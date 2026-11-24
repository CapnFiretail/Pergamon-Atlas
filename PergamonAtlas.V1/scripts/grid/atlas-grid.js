// Atlas Grid: geometry and validation (pure; no DOM). A layout is a list of
// widget placements on a 20-column grid with a fixed gutter. Rows are square
// (as tall as a column is wide) unless the layout fixes their height:
//
//   layout  = { widgets: [placement, …], rowHeight? }
//     rowHeight  px: every row this tall at any width (a page that keeps its
//                proportions as the window changes); omitted: square cells
//     stack      [id, …]: the order of a stacked presentation (every widget
//                once); omitted: reading order
//   placement = { id, type, col, row, cols, rows }
//     id         stable instance id (letters, digits, - and _; ≤ 64)
//     type       a registered widget type (scripts/grid/widget-types.js)
//     col, row   1-based starting cell, the same numbers as CSS Grid lines
//     cols, rows span in cells (positive integers)
//
// Geometry, for a container of width W, C columns and gutter G:
//   cell   = (W − (C − 1) × G) / C          column width
//   row    = rowHeight, or cell (square)
//   width  = cols × cell + (cols − 1) × G   height = rows × row + (rows − 1) × G
//   x      = (col − 1) × (cell + G)         y = (row − 1) × (row size + G)
//   extent = max(row + rows − 1)            the canvas ends after this row
// No maximum row; empty cells and rows are kept; nothing is compacted.
//
// Growing widgets (type.grows): as tall as their rectangle or their content,
// whichever is more. The layout stores only the rectangle; drawn, the row a
// growing widget ends on takes whatever its content needs beyond it. Because
// that pushes down everything below that row, nothing may end lower than a
// growing widget (belowGrowing). A CURRENT LIMITATION of the engine, not a
// design rule: placing widgets under one needs rows whose height is known only
// once they are drawn.
//
// Validation never corrects a layout: it returns structured errors
//   { code, widgets: [id, …], message, detail }
// so an editor can explain why a proposed layout is refused. Two checks:
//   validateLayout(layout, types)       structure, bounds, minimum cells,
//                                       overlaps (independent of width)
//   checkFit(layout, types, width)      pixel content floors at one
//                                       container width (cells shrink with it)
// A widget's height floor can depend on its own rendered width (a component
// may stack or unstack at its breakpoints: see minHeightBands), so fitting
// is not monotonic: a layout can fit at one width and not at a wider one.
// minFitWidth() gives the narrowest width from which it fits at every wider
// width; pages present layouts below that width some other way (stacked).
// With fixed rows a widget's height doesn't change with width, so only its
// width (and the height floor its width band asks for) decides.
//
// A page can have several grids (regions), each its own layout:
//   page = { regions: [{ id, widgets, rowHeight? , …page fields }] }
// validatePage() checks every region and that instance ids are unique across
// the page; widgets stay inside their region.
//
// Future editing operations (move, resize from edges and corners, shrinking
// neighbours within their minimums, undo) build candidate layouts and accept
// them only when both checks pass; resizing never relocates other widgets.
// Content-neutral: knows nothing about any page or component.
// Works in the browser (window.PergamonGrid) and in Node.
(function (root) {
  'use strict';

  const COLUMNS = 20;
  const GUTTER = 16;           // matches --layout-gutter (styles/layout.css)
  const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
  const MIN_ROW = 8, MAX_ROW = 400;            // fixed row heights (px)
  const isPosInt = n => typeof n === 'number' && Number.isInteger(n) && n > 0;
  const isPosNum = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const err = (code, widgets, message, detail) => ({ code, widgets, message, detail: detail || {} });

  // ── Geometry ────────────────────────────────────────────────────────────
  const cellSize = (width, columns = COLUMNS, gutter = GUTTER) => (width - (columns - 1) * gutter) / columns;
  const spanSize = (n, cell, gutter = GUTTER) => n * cell + (n - 1) * gutter;
  // The smallest span (in cells) whose size reaches `px`.
  const cellsFor = (px, cell, gutter = GUTTER) => Math.max(1, Math.ceil((px + gutter) / (cell + gutter) - 1e-9));
  // A layout's row size: its fixed rowHeight, or the column width (square).
  const rowSize = (layout, cell) => (layout && isPosNum(layout.rowHeight) ? layout.rowHeight : cell);
  function rect(w, cell, gutter = GUTTER, row = cell) {
    return { x: (w.col - 1) * (cell + gutter), y: (w.row - 1) * (row + gutter), width: spanSize(w.cols, cell, gutter), height: spanSize(w.rows, row, gutter) };
  }
  const extent = layout => (layout && Array.isArray(layout.widgets) ? layout.widgets : []).reduce((m, w) => Math.max(m, w.row + w.rows - 1), 0);
  const canvasHeight = (layout, cell, gutter = GUTTER) => { const n = extent(layout); return n ? spanSize(n, rowSize(layout, cell), gutter) : 0; };
  // Cells shared by two placements, or null. Touching edges share none.
  function overlap(a, b) {
    const c0 = Math.max(a.col, b.col), c1 = Math.min(a.col + a.cols, b.col + b.cols);
    const r0 = Math.max(a.row, b.row), r1 = Math.min(a.row + a.rows, b.row + b.rows);
    return c0 < c1 && r0 < r1 ? { col: c0, row: r0, cols: c1 - c0, rows: r1 - r0 } : null;
  }
  // Reading order (top to bottom, then left to right). Returns ids; never
  // changes the layout.
  const readingOrder = layout => layout.widgets.slice().sort((a, b) => a.row - b.row || a.col - b.col).map(w => w.id);
  // The order a stacked presentation shows widgets in: the layout's own
  // stack order when it has one, otherwise reading order.
  const stackOrder = layout => (Array.isArray(layout.stack) ? layout.stack.slice() : readingOrder(layout));

  // Pairs [growing widget, widget that ends below it]: not allowed (see above).
  const grows = (w, types) => !!(w && types && Object.prototype.hasOwnProperty.call(types, w.type) && types[w.type].grows);
  const lastRow = w => w.row + w.rows - 1;
  function belowGrowing(widgets, types) {
    const out = [];
    widgets.forEach(g => { if (grows(g, types)) widgets.forEach(w => { if (lastRow(w) > lastRow(g)) out.push([g, w]); }); });
    return out;
  }

  // ── Sizing contracts ────────────────────────────────────────────────────
  //   { minCols, minRows, defaultCols, defaultRows, minWidth, minHeight,
  //     minHeightBands? }
  // Cells: positive integers, defaults ≥ minimums, at most the grid's width.
  // minWidth/minHeight: the smallest pixel size at which the widget's
  // largest permitted content fits without clipping.
  // minHeightBands: [{ maxWidth, minHeight }, …] in ascending maxWidth: the
  // height floor while the widget itself is at most maxWidth wide (its own
  // responsive layouts); minHeight applies above the last band.
  function minHeightAt(c, widgetWidth) {
    for (const b of c.minHeightBands || []) if (widgetWidth <= b.maxWidth + 1e-9) return b.minHeight;
    return c.minHeight;
  }
  function validateContract(type, c, columns = COLUMNS) {
    const out = [];
    const bad = (field, message) => out.push(err('invalid-contract', [], `${type}: ${message}`, { type, field }));
    if (!c || typeof c !== 'object') { bad('contract', 'has no sizing contract'); return out; }
    for (const f of ['minCols', 'minRows', 'defaultCols', 'defaultRows']) if (!isPosInt(c[f])) bad(f, `${f} must be a positive integer`);
    for (const f of ['minWidth', 'minHeight']) if (!isPosNum(c[f])) bad(f, `${f} must be a positive number of pixels`);
    if (isPosInt(c.minCols) && isPosInt(c.defaultCols) && c.defaultCols < c.minCols) bad('defaultCols', 'defaultCols is smaller than minCols');
    if (isPosInt(c.minRows) && isPosInt(c.defaultRows) && c.defaultRows < c.minRows) bad('defaultRows', 'defaultRows is smaller than minRows');
    if (isPosInt(c.minCols) && c.minCols > columns) bad('minCols', `minCols is wider than the ${columns}-column grid`);
    if (isPosInt(c.defaultCols) && c.defaultCols > columns) bad('defaultCols', `defaultCols is wider than the ${columns}-column grid`);
    if (c.minHeightBands !== undefined) {
      if (!Array.isArray(c.minHeightBands)) bad('minHeightBands', 'minHeightBands must be a list');
      else c.minHeightBands.forEach((b, i) => {
        if (!b || !isPosNum(b.maxWidth) || !isPosNum(b.minHeight)) bad('minHeightBands', `band ${i + 1} needs a positive maxWidth and minHeight`);
        else if (i && !(b.maxWidth > c.minHeightBands[i - 1].maxWidth)) bad('minHeightBands', 'bands must be in ascending maxWidth');
      });
    }
    return out;
  }

  // ── Layout validation (width-independent) ───────────────────────────────
  // types: { [type]: { contract, placeable } }
  function validateLayout(layout, types, columns = COLUMNS) {
    const out = [];
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.widgets)) {
      return [err('invalid-layout', [], 'A layout is an object with a widgets array.')];
    }
    if (layout.rowHeight !== undefined && !(isPosNum(layout.rowHeight) && layout.rowHeight >= MIN_ROW && layout.rowHeight <= MAX_ROW)) {
      return [err('invalid-row-height', [], `rowHeight must be a number of pixels from ${MIN_ROW} to ${MAX_ROW}.`, { rowHeight: layout.rowHeight })];
    }
    // A stack order lists every widget exactly once.
    if (layout.stack !== undefined) {
      const ids = layout.widgets.map(w => w && w.id);
      const s = layout.stack;
      if (!Array.isArray(s) || s.length !== ids.length || new Set(s).size !== s.length || !s.every(id => ids.indexOf(id) >= 0)) {
        return [err('invalid-stack', [], 'stack must list every widget of the layout exactly once.', { stack: s })];
      }
    }
    const seen = new Map(), checkedTypes = new Map(), placed = [];
    layout.widgets.forEach((w, index) => {
      if (!w || typeof w !== 'object') { out.push(err('invalid-widget', [], `Widget ${index + 1} is not an object.`, { index })); return; }
      const id = w.id;
      if (typeof id !== 'string' || !ID.test(id)) { out.push(err('invalid-id', [], `Widget ${index + 1} has an invalid id.`, { index, id })); return; }
      if (seen.has(id)) { out.push(err('duplicate-id', [id], `Two widgets share the id “${id}”.`, { indexes: [seen.get(id), index] })); return; }
      seen.set(id, index);
      let ok = true;
      const t = types && Object.prototype.hasOwnProperty.call(types, w.type) ? types[w.type] : null;
      if (!t) { out.push(err('unknown-type', [id], `“${id}” has an unknown type “${w.type}”.`, { type: w.type })); ok = false; }
      else if (t.placeable === false) { out.push(err('not-placeable', [id], `“${w.type}” can't be placed on a grid yet.`, { type: w.type })); ok = false; }
      else {
        if (!checkedTypes.has(w.type)) checkedTypes.set(w.type, validateContract(w.type, t.contract, columns));
        const cErr = checkedTypes.get(w.type);
        if (cErr.length) { out.push(...cErr.map(e => Object.assign({}, e, { widgets: [id] }))); ok = false; }
      }
      if (!isPosInt(w.col) || !isPosInt(w.row)) { out.push(err('invalid-position', [id], `“${id}” must start at a whole, positive column and row.`, { col: w.col, row: w.row })); ok = false; }
      if (!isPosInt(w.cols) || !isPosInt(w.rows)) { out.push(err('invalid-span', [id], `“${id}” must span a whole, positive number of columns and rows.`, { cols: w.cols, rows: w.rows })); ok = false; }
      if (isPosInt(w.col) && isPosInt(w.cols) && w.col + w.cols - 1 > columns) {
        out.push(err('out-of-bounds', [id], `“${id}” extends past column ${columns}.`, { lastCol: w.col + w.cols - 1, columns })); ok = false;
      }
      if (ok) {
        const c = t.contract;
        if (w.cols < c.minCols) { out.push(err('below-min-cols', [id], `“${id}” is ${w.cols} columns wide; “${w.type}” needs at least ${c.minCols}.`, { cols: w.cols, minCols: c.minCols })); ok = false; }
        if (w.rows < c.minRows) { out.push(err('below-min-rows', [id], `“${id}” is ${w.rows} rows tall; “${w.type}” needs at least ${c.minRows}.`, { rows: w.rows, minRows: c.minRows })); ok = false; }
      }
      // Overlaps are checked for every placement with a usable rectangle.
      if (isPosInt(w.col) && isPosInt(w.row) && isPosInt(w.cols) && isPosInt(w.rows)) placed.push(w);
    });
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const o = overlap(placed[i], placed[j]);
      if (o) out.push(err('overlap', [placed[i].id, placed[j].id], `“${placed[i].id}” and “${placed[j].id}” overlap.`, { cells: o }));
    }
    belowGrowing(placed, types).forEach(([g, w]) => out.push(err('below-growing', [g.id, w.id], `“${w.id}” ends below “${g.id}”, which grows with its content, so nothing can be placed under it.`, { growing: g.id, endsAt: lastRow(g) })));
    return out;
  }

  // ── Fit at a container width ────────────────────────────────────────────
  // Pixel content floors for a structurally valid layout at one width.
  function checkFit(layout, types, width, opts = {}) {
    const columns = opts.columns || COLUMNS, gutter = opts.gutter === undefined ? GUTTER : opts.gutter;
    const cell = cellSize(width, columns, gutter);
    if (!(cell > 0)) return [err('grid-too-narrow', [], `A ${columns}-column grid has no room for cells at ${round(width)}px.`, { width, cell })];
    const out = [], row = rowSize(layout, cell);
    for (const w of layout.widgets) {
      const c = types[w.type].contract, r = rect(w, cell, gutter, row);
      if (r.width < c.minWidth - 1e-6) out.push(err('below-min-width', [w.id], `“${w.id}” is ${round(r.width)}px wide at this width; its content needs ${c.minWidth}px.`, { width: r.width, minWidth: c.minWidth, containerWidth: width }));
      const minHeight = minHeightAt(c, r.width);
      if (r.height < minHeight - 1e-6) out.push(err('below-min-height', [w.id], `“${w.id}” is ${round(r.height)}px tall at this width; at ${round(r.width)}px wide its content needs ${minHeight}px.`, { height: r.height, minHeight, width: r.width, containerWidth: width }));
    }
    return out;
  }
  // The narrowest container width from which one widget fits at every wider
  // width. Solved per height band in cell units: a band covers the cells at
  // which the widget's width falls inside it; any part of a band where the
  // widget is shorter than the band's floor pushes the threshold above it.
  // With fixed rows (opts.rowHeight) the height is the same at every width:
  // a band whose floor it doesn't reach is excluded whole (Infinity if that
  // is the widest band: the widget never fits).
  function widgetMinFitWidth(w, c, opts = {}) {
    const columns = opts.columns || COLUMNS, gutter = opts.gutter === undefined ? GUTTER : opts.gutter;
    const cellAtWidth = px => (px - (w.cols - 1) * gutter) / w.cols;
    const fixed = isPosNum(opts.rowHeight) ? spanSize(w.rows, opts.rowHeight, gutter) : null;
    const cellAtHeight = px => (fixed === null ? (px - (w.rows - 1) * gutter) / w.rows : (fixed >= px - 1e-6 ? -Infinity : Infinity));
    let need = Math.max(1e-6, cellAtWidth(c.minWidth));
    let lo = -Infinity;
    const segments = (c.minHeightBands || []).map(b => { const s = { lo, hi: cellAtWidth(b.maxWidth), h: b.minHeight }; lo = s.hi; return s; });
    segments.push({ lo, hi: Infinity, h: c.minHeight });
    for (const s of segments) {
      const req = cellAtHeight(s.h);
      if (req <= s.lo) continue;                                      // tall enough throughout this band
      need = Math.max(need, req <= s.hi ? req : s.hi + 1e-6);         // short until req, or for the whole band
    }
    return columns * need + (columns - 1) * gutter;
  }
  const minFitWidth = (layout, types, opts = {}) => {
    const o = Object.assign({ rowHeight: layout.rowHeight }, opts);
    return layout.widgets.reduce((m, w) => Math.max(m, widgetMinFitWidth(w, types[w.type].contract, o)), 0);
  };

  // ── Pages: several grids (regions) ──────────────────────────────────────
  // Each region is validated as its own layout; instance ids must be unique
  // across the page (an instance lives in exactly one region). Errors carry
  // the region's id in detail.region.
  const REGION_ID = /^[a-z][a-z0-9-]{0,31}$/;
  function validatePage(page, types, columns = COLUMNS) {
    if (!page || typeof page !== 'object' || !Array.isArray(page.regions) || !page.regions.length) {
      return [err('invalid-page', [], 'A page is an object with a non-empty regions array.')];
    }
    const out = [], regionIds = new Set(), owner = new Map();
    page.regions.forEach((region, i) => {
      const rid = region && region.id;
      if (typeof rid !== 'string' || !REGION_ID.test(rid)) { out.push(err('invalid-region', [], `Region ${i + 1} has an invalid id.`, { index: i, region: rid })); return; }
      if (regionIds.has(rid)) { out.push(err('duplicate-region', [], `Two regions share the id “${rid}”.`, { region: rid })); return; }
      regionIds.add(rid);
      for (const e of validateLayout(region, types, columns)) out.push(Object.assign({}, e, { detail: Object.assign({}, e.detail, { region: rid }) }));
      for (const w of (Array.isArray(region.widgets) ? region.widgets : [])) {
        if (!w || typeof w.id !== 'string') continue;
        if (owner.has(w.id) && owner.get(w.id) !== rid) out.push(err('duplicate-id', [w.id], `“${w.id}” is in two regions (“${owner.get(w.id)}” and “${rid}”).`, { regions: [owner.get(w.id), rid] }));
        else owner.set(w.id, rid);
      }
    });
    return out;
  }
  // Where an instance lives: { region, widget } or null.
  function findInstance(page, id) {
    for (const region of page.regions || []) for (const w of region.widgets || []) if (w.id === id) return { region, widget: w };
    return null;
  }
  const round = n => Math.round(n * 10) / 10;

  const api = { COLUMNS, GUTTER, MIN_ROW, MAX_ROW, cellSize, spanSize, cellsFor, rowSize, rect, extent, canvasHeight, overlap, grows, belowGrowing, readingOrder, stackOrder, minHeightAt, validateContract, validateLayout, checkFit, minFitWidth, widgetMinFitWidth, validatePage, findInstance };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PergamonGrid = Object.assign(root.PergamonGrid || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
