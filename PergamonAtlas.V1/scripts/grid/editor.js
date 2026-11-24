// Atlas Grid editing engine (pure; no DOM, no events, no fixed width).
// Moves, resizes, adds and removes widgets in a layout
// (scripts/grid/atlas-grid.js) by proposing a candidate layout and validating
// it; nothing is ever repaired. Pointer and keyboard controllers, the
// Handbook's Layout Lab and Admin Mode's Layout Mode all edit through this file.
//
//   env = { types, width, gutter?, columns? }
//     width  the container width the caller validates at (pixel content
//            floors depend on it); each caller chooses its own policy
//
// Proposals (never change their input):
//   proposeMove(layout, id, { col, row }, env)
//   proposeResize(layout, id, handle, edges, env)
//   proposeAdd(layout, { id, type }, env)   the type's default size (more rows
//     where its content needs them) in the first free place in reading order,
//     below everything else if there is none; existing widgets never move.
//     null when the type has no usable size at this width. Nothing can go under a
//     growing widget (atlas-grid.js), so a new one may find no valid place
//   proposeRemove(layout, id, env)
//   proposeStack(layout, id, step, env)     earlier (−1) or later (+1) in the
//     stacked presentation; nothing on the grid changes
//     handle  'left' 'right' 'top' 'bottom' 'top-left' 'top-right'
//             'bottom-left' 'bottom-right': which edges may move; the others
//             stay anchored
//     edges   grid lines for the moving edges, 1-based like CSS Grid:
//             { left, right, top, bottom } where a widget at col c spanning
//             n columns has left = c and right = c + n (likewise rows)
//   → { valid, layout, widget, errors, affected, clamped, changed, extent }
//     layout    the candidate layout (frozen); widget its placement
//     clamped   edges stopped at the grid's sides or the widget's minimum:
//               { left|right|top|bottom: 'bounds' | 'minimum' }
//     affected  ids named by the errors, plus the edited widget
// Moves keep the size and stop at the grid's sides; resizes stop at the
// sides and at the minimum size (cells, and the pixel content floors at
// env.width). Overlaps are never resolved: they make the proposal invalid.
//
// Gestures (one drag or resize = one transaction):
//   g = beginGesture(committed, { kind: 'move'|'resize', id, handle?, env })
//   g.update(target) → proposal   preview only; the committed layout is kept
//   g.end()    → { committed: layout | null, reason }   commits only the
//              last proposal, and only if it is valid and changes something
//   g.cancel() → { committed: null, reason: 'cancelled' }
// Keyboard steps: nudge(layout, id, dCol, dRow, env), grow(layout, id,
// dCols, dRows, env) are proposals like any other.
//
// History (in memory): h = createHistory(initial, { limit = 100 })
//   h.present() h.commit(layout) h.undo() h.redo() h.reset()
//   h.amend(layout)   replace the present without a new step (typing in one
//   field, say); amending back to the previous entry drops the step
//   h.canUndo() h.canRedo()   unchanged layouts are never recorded; reset
//   is one undoable step; a new commit clears redo.
// Extents: editingExtent(committed, proposal, { pointerRow, spare }) — rows
// to show while a gesture is active; never part of the layout.
(function (root) {
  'use strict';
  const G = typeof module === 'object' && module.exports ? require('./atlas-grid.js') : root.PergamonGrid;

  const HANDLES = {
    left: ['left'], right: ['right'], top: ['top'], bottom: ['bottom'],
    'top-left': ['top', 'left'], 'top-right': ['top', 'right'],
    'bottom-left': ['bottom', 'left'], 'bottom-right': ['bottom', 'right']
  };

  // A frozen copy; the layout's own fields (a region's id, rowHeight, …) are kept.
  const freezeLayout = layout => Object.freeze(Object.assign({}, layout, { widgets: Object.freeze(layout.widgets.map(w => Object.freeze(Object.assign({}, w)))) }));
  const same = (a, b) => a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows;
  const sameLayout = (a, b) => a.rowHeight === b.rowHeight && a.widgets.length === b.widgets.length && a.widgets.every((w, i) => {
    const v = b.widgets[i];
    return v && w.id === v.id && w.type === v.type && same(w, v);
  });
  const opts = env => ({ columns: env.columns || G.COLUMNS, gutter: env.gutter === undefined ? G.GUTTER : env.gutter, rowHeight: env.rowHeight });
  // The environment for one layout: its fixed row height, if it has one.
  const forLayout = (env, layout) => (layout && layout.rowHeight ? Object.assign({}, env, { rowHeight: layout.rowHeight }) : env);

  // The smallest size a widget may have at env.width: its contract's cells,
  // or more where the pixel floors need them. The height floor depends on
  // the widget's own width, so rows are for `cols` columns (default: the
  // smallest width). null when the grid has no room.
  function minCells(contract, env, cols) {
    const { columns, gutter } = opts(env);
    const cell = G.cellSize(env.width, columns, gutter);
    if (!(cell > 0)) return null;
    const minCols = Math.max(contract.minCols, G.cellsFor(contract.minWidth, cell, gutter));
    const width = G.spanSize(cols || minCols, cell, gutter);
    const row = env.rowHeight || cell;                     // fixed rows, or square
    return { cols: minCols, rows: Math.max(contract.minRows, G.cellsFor(G.minHeightAt(contract, width), row, gutter)) };
  }

  // Build, validate and describe a candidate with one widget replaced.
  function propose(layout, index, next, env, clamped) {
    env = forLayout(env, layout);
    const current = layout.widgets[index];
    const widgets = layout.widgets.slice();
    widgets[index] = Object.assign({}, current, next);
    const candidate = freezeLayout(Object.assign({}, layout, { widgets }));
    const errors = check(candidate, env);
    const affected = [...new Set([current.id].concat(...errors.map(e => e.widgets)))];
    return Object.freeze({
      valid: errors.length === 0, layout: candidate, widget: candidate.widgets[index], errors, affected,
      clamped: Object.freeze(clamped), changed: !same(current, candidate.widgets[index]), extent: G.extent(candidate)
    });
  }
  // Everything wrong with a candidate at env.width.
  function check(candidate, env) {
    let errors = G.validateLayout(candidate, env.types, opts(env).columns);
    if (!errors.length) errors = G.checkFit(candidate, env.types, env.width, opts(env));
    // It must keep fitting at every wider width too (height floors can rise
    // where a widget crosses one of its own breakpoints).
    if (!errors.length) errors = candidate.widgets.map(w => [w, G.widgetMinFitWidth(w, env.types[w.type].contract, opts(env))])
      .filter(([, from]) => from > env.width + 1e-6)
      .map(([w, from]) => ({ code: 'unfit-when-wider', widgets: [w.id], message: `“${w.id}” fits at this width but not at every wider one (it fits from ${Math.ceil(from)}px).`, detail: { width: env.width, fitsFrom: from } }));
    return errors;
  }

  function find(layout, id) {
    const index = layout && Array.isArray(layout.widgets) ? layout.widgets.findIndex(w => w.id === id) : -1;
    if (index < 0) throw new Error(`No widget “${id}” in this layout.`);
    return index;
  }
  const int = (n, name) => { if (!Number.isInteger(n)) throw new Error(`${name} must be a whole number.`); return n; };

  function proposeMove(layout, id, to, env) {
    const i = find(layout, id), w = layout.widgets[i], { columns } = opts(env);
    let col = int(to.col, 'col'), row = int(to.row, 'row');
    const clamped = {};
    if (col < 1) { col = 1; clamped.left = 'bounds'; }
    if (col + w.cols - 1 > columns) { col = columns - w.cols + 1; clamped.right = 'bounds'; }
    if (row < 1) { row = 1; clamped.top = 'bounds'; }
    return propose(layout, i, { col, row }, env, clamped);
  }

  function proposeResize(layout, id, handle, edges, env) {
    const moving = HANDLES[handle];
    if (!moving) throw new Error(`Unknown resize handle “${handle}”.`);
    env = forLayout(env, layout);
    const i = find(layout, id), w = layout.widgets[i], { columns } = opts(env);
    const min = Object.assign({}, minCells(env.types[w.type].contract, env) || { cols: 1, rows: 1 });
    let left = w.col, right = w.col + w.cols, top = w.row, bottom = w.row + w.rows;
    const clamped = {};
    for (const e of moving) if (edges[e] === undefined) throw new Error(`The “${handle}” handle needs a ${e} edge.`);
    if (moving.includes('left')) {
      left = int(edges.left, 'left');
      if (left < 1) { left = 1; clamped.left = 'bounds'; }
      if (right - left < min.cols) { left = right - min.cols; clamped.left = 'minimum'; }
    }
    if (moving.includes('right')) {
      right = int(edges.right, 'right');
      if (right > columns + 1) { right = columns + 1; clamped.right = 'bounds'; }
      if (right - left < min.cols) { right = left + min.cols; clamped.right = 'minimum'; }
    }
    // Rows: the floor for the width the widget now has.
    min.rows = (minCells(env.types[w.type].contract, env, right - left) || min).rows;
    if (moving.includes('top')) {
      top = int(edges.top, 'top');
      if (top < 1) { top = 1; clamped.top = 'bounds'; }
      if (bottom - top < min.rows) { top = bottom - min.rows; clamped.top = 'minimum'; }
    }
    if (moving.includes('bottom')) {
      bottom = int(edges.bottom, 'bottom');
      if (bottom - top < min.rows) { bottom = top + min.rows; clamped.bottom = 'minimum'; }
    }
    return propose(layout, i, { col: left, row: top, cols: right - left, rows: bottom - top }, env, clamped);
  }

  // Keyboard steps.
  const nudge = (layout, id, dCol, dRow, env) => { const w = layout.widgets[find(layout, id)]; return proposeMove(layout, id, { col: w.col + dCol, row: w.row + dRow }, env); };
  const grow = (layout, id, dCols, dRows, env) => {
    const w = layout.widgets[find(layout, id)];
    const handle = dCols && dRows ? 'bottom-right' : dCols ? 'right' : 'bottom';
    return proposeResize(layout, id, handle, { right: w.col + w.cols + dCols, bottom: w.row + w.rows + dRows }, env);
  };

  // ── Adding, removing, stacking order ──────────────────────────────────────
  // A change to the widget list, described like any proposal.
  function proposeList(layout, id, next, env) {
    env = forLayout(env, layout);
    const candidate = freezeLayout(Object.assign({}, layout, next));
    const errors = check(candidate, env);
    return Object.freeze({
      valid: errors.length === 0, layout: candidate, widget: candidate.widgets.find(w => w.id === id) || null, errors,
      affected: [...new Set([id].concat(...errors.map(e => e.widgets)))], clamped: Object.freeze({}), changed: true, extent: G.extent(candidate)
    });
  }
  // A new widget's size: the contract's defaults, at least what its content
  // needs at env.width and at every wider width.
  function defaultSize(type, env) {
    const t = env.types[type];
    const { columns } = opts(env), min = t && minCells(t.contract, env);
    if (!min) return null;
    const cols = Math.max(t.contract.defaultCols, min.cols);
    if (cols > columns) return null;
    const first = Math.max(t.contract.defaultRows, minCells(t.contract, env, cols).rows);
    for (let rows = first; rows <= first + 60; rows++) {
      if (G.widgetMinFitWidth({ cols, rows }, t.contract, opts(env)) <= env.width + 1e-6) return { cols, rows };
    }
    return null;
  }
  function proposeAdd(layout, w, env) {
    env = forLayout(env, layout);
    if (layout.widgets.some(x => x.id === w.id)) throw new Error(`“${w.id}” is already in this layout.`);
    const size = defaultSize(w.type, env), { columns } = opts(env);
    if (!size) return null;
    const bottom = G.extent(layout) + 1;
    // A place that is free and keeps growing widgets last, if there is one;
    // otherwise the first free one (refused, with the reason).
    const free = at => !layout.widgets.some(x => G.overlap(x, at));
    const allowed = at => !G.belowGrowing(layout.widgets.concat(at), env.types).length;
    let spot = null, refused = null;
    for (let row = 1; row <= bottom && !spot; row++) {
      for (let col = 1; col + size.cols - 1 <= columns && !spot; col++) {
        const at = Object.assign({ id: w.id, type: w.type, col, row }, size);
        if (!free(at)) continue;
        if (allowed(at)) spot = at; else refused = refused || at;
      }
    }
    const widget = spot || refused;
    const next = { widgets: layout.widgets.concat(widget) };
    // Stacked, it follows the widget it follows on the grid.
    if (Array.isArray(layout.stack)) {
      const order = G.readingOrder(next), before = order[order.indexOf(w.id) - 1];
      next.stack = layout.stack.slice();
      next.stack.splice(before ? next.stack.indexOf(before) + 1 : 0, 0, w.id);
    }
    return proposeList(layout, w.id, next, env);
  }
  function proposeRemove(layout, id, env) {
    find(layout, id);
    const next = { widgets: layout.widgets.filter(w => w.id !== id) };
    if (Array.isArray(layout.stack)) next.stack = layout.stack.filter(x => x !== id);
    return proposeList(layout, id, next, env);
  }
  function proposeStack(layout, id, step, env) {
    find(layout, id);
    const stack = G.stackOrder(layout), from = stack.indexOf(id);
    const to = Math.max(0, Math.min(stack.length - 1, from + int(step, 'step')));
    stack.splice(to, 0, stack.splice(from, 1)[0]);
    const p = proposeList(layout, id, { widgets: layout.widgets, stack }, env);
    return Object.freeze(Object.assign({}, p, { changed: to !== from }));
  }

  // ── Gestures ──────────────────────────────────────────────────────────────
  function beginGesture(committed, o) {
    const { kind, id, handle, env } = o;
    if (kind !== 'move' && kind !== 'resize') throw new Error('A gesture is a move or a resize.');
    if (kind === 'resize' && !HANDLES[handle]) throw new Error(`Unknown resize handle “${handle}”.`);
    find(committed, id);
    let last = null, done = false;
    const live = () => { if (done) throw new Error('This gesture has ended.'); };
    return {
      kind, id, handle,
      committed: () => committed,
      proposal: () => last,
      update(target) {
        live();
        last = kind === 'move' ? proposeMove(committed, id, target, env) : proposeResize(committed, id, handle, target, env);
        return last;
      },
      end() {
        live(); done = true;
        if (!last) return { committed: null, reason: 'unchanged' };
        if (!last.valid) return { committed: null, reason: 'invalid', errors: last.errors };
        if (!last.changed) return { committed: null, reason: 'unchanged' };
        return { committed: last.layout, reason: 'committed' };
      },
      cancel() { live(); done = true; return { committed: null, reason: 'cancelled' }; }
    };
  }

  function editingExtent(committed, proposal, o = {}) {
    return Math.max(G.extent(committed), proposal ? proposal.extent : 0, o.pointerRow || 0) + (o.spare || 0);
  }

  // ── History ───────────────────────────────────────────────────────────────
  // o.same / o.freeze: how entries are compared and frozen (default: layouts;
  // a page editor passes its own for whole documents).
  function createHistory(initial, o = {}) {
    const limit = o.limit || 100;
    const isSame = o.same || sameLayout, freeze = o.freeze || freezeLayout;
    const original = freeze(initial);
    let past = [], present = original, future = [];
    function commit(layout) {
      if (!layout || isSame(layout, present)) return false;
      past.push(present);
      if (past.length > limit) past = past.slice(past.length - limit);
      present = freeze(layout);
      future = [];
      return true;
    }
    function amend(layout) {
      if (!past.length) return commit(layout);
      if (!layout || isSame(layout, present)) return false;
      present = freeze(layout);
      future = [];
      if (isSame(present, past[past.length - 1])) present = past.pop();
      return true;
    }
    return {
      present: () => present,
      original: () => original,
      commit, amend,
      undo() { if (!past.length) return null; future.push(present); present = past.pop(); return present; },
      redo() { if (!future.length) return null; past.push(present); present = future.pop(); return present; },
      reset() { return commit(original); },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
      size: () => ({ past: past.length, future: future.length })
    };
  }
  // Commit a proposal (keyboard steps): only a valid change is recorded.
  const commitProposal = (history, proposal) => !!(proposal && proposal.valid && proposal.changed) && history.commit(proposal.layout);

  const api = { HANDLES, minCells, proposeMove, proposeResize, proposeAdd, proposeRemove, proposeStack, defaultSize, nudge, grow, beginGesture, editingExtent, createHistory, commitProposal, sameLayout, freezeLayout };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonGrid = root.PergamonGrid || {}; root.PergamonGrid.editor = api; }
})(typeof window !== 'undefined' ? window : globalThis);
