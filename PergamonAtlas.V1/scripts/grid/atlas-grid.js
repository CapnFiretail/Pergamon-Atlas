// Atlas Grid: geometry and validation (pure; no DOM). A layout is a list of
// widget placements on a 20-column grid of square cells with a fixed gutter:
//
//   layout  = { widgets: [placement, …] }
//   placement = { id, type, col, row, cols, rows }
//     id         stable instance id (letters, digits, - and _; ≤ 64)
//     type       a registered widget type (scripts/grid/widget-types.js)
//     col, row   1-based starting cell, the same numbers as CSS Grid lines
//     cols, rows span in cells (positive integers)
//
// Geometry, for a container of width W, C columns and gutter G:
//   cell   = (W − (C − 1) × G) / C          (square: rows use the same size)
//   width  = cols × cell + (cols − 1) × G   height likewise with rows
//   x      = (col − 1) × (cell + G)         y likewise with row
//   extent = max(row + rows − 1)            the canvas ends after this row
// No maximum row; empty cells and rows are kept; nothing is compacted.
//
// Validation never corrects a layout: it returns structured errors
//   { code, widgets: [id, …], message, detail }
// so an editor can explain why a proposed layout is refused. Two checks:
//   validateLayout(layout, types)       structure, bounds, minimum cells,
//                                       overlaps (independent of width)
//   checkFit(layout, types, width)      pixel content floors at one
//                                       container width (cells shrink with it)
// A size only grows with the container, so a layout that fits at a width
// fits at every wider one; minFitWidth() gives the narrowest.
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
  const isPosInt = n => typeof n === 'number' && Number.isInteger(n) && n > 0;
  const isPosNum = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const err = (code, widgets, message, detail) => ({ code, widgets, message, detail: detail || {} });

  // ── Geometry ────────────────────────────────────────────────────────────
  const cellSize = (width, columns = COLUMNS, gutter = GUTTER) => (width - (columns - 1) * gutter) / columns;
  const spanSize = (n, cell, gutter = GUTTER) => n * cell + (n - 1) * gutter;
  // The smallest span (in cells) whose size reaches `px`.
  const cellsFor = (px, cell, gutter = GUTTER) => Math.max(1, Math.ceil((px + gutter) / (cell + gutter) - 1e-9));
  function rect(w, cell, gutter = GUTTER) {
    return { x: (w.col - 1) * (cell + gutter), y: (w.row - 1) * (cell + gutter), width: spanSize(w.cols, cell, gutter), height: spanSize(w.rows, cell, gutter) };
  }
  const extent = layout => (layout && Array.isArray(layout.widgets) ? layout.widgets : []).reduce((m, w) => Math.max(m, w.row + w.rows - 1), 0);
  const canvasHeight = (layout, cell, gutter = GUTTER) => { const n = extent(layout); return n ? spanSize(n, cell, gutter) : 0; };
  // Cells shared by two placements, or null. Touching edges share none.
  function overlap(a, b) {
    const c0 = Math.max(a.col, b.col), c1 = Math.min(a.col + a.cols, b.col + b.cols);
    const r0 = Math.max(a.row, b.row), r1 = Math.min(a.row + a.rows, b.row + b.rows);
    return c0 < c1 && r0 < r1 ? { col: c0, row: r0, cols: c1 - c0, rows: r1 - r0 } : null;
  }
  // Reading order (top to bottom, then left to right): the order a stacked
  // presentation shows widgets in. Returns ids; never changes the layout.
  const readingOrder = layout => layout.widgets.slice().sort((a, b) => a.row - b.row || a.col - b.col).map(w => w.id);

  // ── Sizing contracts ────────────────────────────────────────────────────
  //   { minCols, minRows, defaultCols, defaultRows, minWidth, minHeight }
  // Cells: positive integers, defaults ≥ minimums, at most the grid's width.
  // minWidth/minHeight: the smallest pixel size at which the widget's
  // largest permitted content fits without clipping.
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
    return out;
  }

  // ── Layout validation (width-independent) ───────────────────────────────
  // types: { [type]: { contract, placeable } }
  function validateLayout(layout, types, columns = COLUMNS) {
    const out = [];
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.widgets)) {
      return [err('invalid-layout', [], 'A layout is an object with a widgets array.')];
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
    return out;
  }

  // ── Fit at a container width ────────────────────────────────────────────
  // Pixel content floors for a structurally valid layout at one width.
  function checkFit(layout, types, width, opts = {}) {
    const columns = opts.columns || COLUMNS, gutter = opts.gutter === undefined ? GUTTER : opts.gutter;
    const cell = cellSize(width, columns, gutter);
    if (!(cell > 0)) return [err('grid-too-narrow', [], `A ${columns}-column grid has no room for cells at ${round(width)}px.`, { width, cell })];
    const out = [];
    for (const w of layout.widgets) {
      const c = types[w.type].contract, r = rect(w, cell, gutter);
      if (r.width < c.minWidth - 1e-6) out.push(err('below-min-width', [w.id], `“${w.id}” is ${round(r.width)}px wide at this width; its content needs ${c.minWidth}px.`, { width: r.width, minWidth: c.minWidth, containerWidth: width }));
      if (r.height < c.minHeight - 1e-6) out.push(err('below-min-height', [w.id], `“${w.id}” is ${round(r.height)}px tall at this width; its content needs ${c.minHeight}px.`, { height: r.height, minHeight: c.minHeight, containerWidth: width }));
    }
    return out;
  }
  // The narrowest container width at which checkFit passes (cells > 0).
  function minFitWidth(layout, types, opts = {}) {
    const columns = opts.columns || COLUMNS, gutter = opts.gutter === undefined ? GUTTER : opts.gutter;
    let cell = 0;
    for (const w of layout.widgets) {
      const c = types[w.type].contract;
      cell = Math.max(cell, (c.minWidth - (w.cols - 1) * gutter) / w.cols, (c.minHeight - (w.rows - 1) * gutter) / w.rows);
    }
    return columns * Math.max(cell, 0) + (columns - 1) * gutter;
  }
  const round = n => Math.round(n * 10) / 10;

  const api = { COLUMNS, GUTTER, cellSize, spanSize, cellsFor, rect, extent, canvasHeight, overlap, readingOrder, validateContract, validateLayout, checkFit, minFitWidth };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PergamonGrid = Object.assign(root.PergamonGrid || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
