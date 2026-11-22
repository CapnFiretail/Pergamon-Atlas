// Atlas Grid checks (H5.2c): geometry, sizing contracts, layout validation
// and width fit. No dependencies:
//   node --test tests/design/*.test.mjs
// The renderer's placement in a real browser is checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const G = require(path.join(SITE, 'scripts/grid/atlas-grid.js'));
const { types: TYPES, reference, frameRegions } = require(path.join(SITE, 'scripts/grid/widget-types.js'));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const codes = errs => errs.map(e => e.code).sort();

// A small test registry, independent of the real components.
const T = {
  box: { placeable: true, contract: { minCols: 2, minRows: 2, defaultCols: 4, defaultRows: 3, minWidth: 100, minHeight: 80 } },
  wide: { placeable: true, contract: { minCols: 6, minRows: 1, defaultCols: 10, defaultRows: 2, minWidth: 400, minHeight: 40 } },
  later: { placeable: false, contract: { minCols: 1, minRows: 1, defaultCols: 1, defaultRows: 1, minWidth: 1, minHeight: 1 } }
};
const W = (id, col, row, cols, rows, type = 'box') => ({ id, type, col, row, cols, rows });

// ── Geometry ─────────────────────────────────────────────────────────────
test('cell size: (W − 19 × 16) / 20, including fractional widths', () => {
  near(G.cellSize(1392), 54.4, '1392');
  near(G.cellSize(1000), 34.8, '1000');
  near(G.cellSize(853), 27.45, '853');
  near(G.cellSize(1000.5), 34.825, '1000.5');
  near(G.cellSize(304), 0, '304: no room');
  assert.ok(G.cellSize(288) < 0, 'negative below 304px');
  near(G.cellSize(600, 6, 10), 91.66666666666667, 'other column counts and gutters');
});

test('widget size and position follow the cell, the gutter and 1-based coordinates', () => {
  const cell = G.cellSize(1392);
  const r = G.rect(W('a', 4, 3, 11, 5), cell);
  near(r.x, 3 * (54.4 + 16), 'x');
  near(r.y, 2 * (54.4 + 16), 'y');
  near(r.width, 11 * 54.4 + 10 * 16, 'width');
  near(r.height, 5 * 54.4 + 4 * 16, 'height');
  const full = G.rect(W('f', 1, 1, 20, 1), cell);
  near(full.x + full.width, 1392, 'twenty columns fill the container exactly');
  // Adjacent widgets are exactly one gutter apart.
  const a = G.rect(W('a', 1, 1, 3, 2), cell), b = G.rect(W('b', 4, 1, 3, 2), cell), c = G.rect(W('c', 1, 3, 3, 2), cell);
  near(b.x - (a.x + a.width), 16, 'horizontal gutter');
  near(c.y - (a.y + a.height), 16, 'vertical gutter');
  // Square cells: one cell is as tall as it is wide.
  const one = G.rect(W('s', 7, 9, 1, 1), G.cellSize(1234.56));
  near(one.width, one.height, 'square');
});

test('the canvas ends after the lowest occupied row; empty rows are kept', () => {
  assert.equal(G.extent({ widgets: [] }), 0);
  assert.equal(G.canvasHeight({ widgets: [] }, 50), 0);
  const layout = { widgets: [W('a', 1, 1, 4, 3), W('b', 9, 15, 4, 2)] };
  assert.equal(G.extent(layout), 16, 'rows 4–14 stay empty; the canvas reaches row 16');
  near(G.canvasHeight(layout, 54.4), 16 * 54.4 + 15 * 16, 'height');
  // Moving the low widget up shrinks the canvas; removing it shrinks it more.
  assert.equal(G.extent({ widgets: [W('a', 1, 1, 4, 3), W('b', 9, 4, 4, 2)] }), 5);
  assert.equal(G.extent({ widgets: [W('a', 1, 1, 4, 3)] }), 3);
  assert.equal(G.extent({ widgets: [W('a', 1, 1, 4, 3), W('b', 1, 400, 4, 9)] }), 408, 'no maximum height');
});

test('cellsFor gives the smallest span reaching a size', () => {
  const cell = 54.4;
  assert.equal(G.cellsFor(54.4, cell), 1);
  assert.equal(G.cellsFor(54.5, cell), 2);
  assert.equal(G.cellsFor(124.8, cell), 2, 'two cells and a gutter, exactly');
  assert.equal(G.cellsFor(1, cell), 1);
});

test('reading order is top to bottom, then left to right, without changing the layout', () => {
  const layout = { widgets: [W('c', 1, 5, 2, 2), W('b', 9, 1, 2, 2), W('a', 1, 1, 2, 2), W('d', 3, 5, 2, 2)] };
  const before = JSON.stringify(layout);
  assert.deepEqual(G.readingOrder(layout), ['a', 'b', 'c', 'd']);
  assert.equal(JSON.stringify(layout), before);
});

// ── Validation ───────────────────────────────────────────────────────────
test('a valid layout with gaps, empty rows and a widget far down has no errors', () => {
  const layout = { widgets: [W('a', 1, 1, 4, 3), W('b', 5, 1, 4, 3), W('c', 13, 2, 8, 2, 'wide'), W('d', 1, 9, 20, 4, 'wide'), W('e', 17, 200, 4, 2)] };
  assert.deepEqual(G.validateLayout(layout, T), []);
});

test('touching edges are fine; shared cells are an overlap naming both widgets', () => {
  assert.deepEqual(G.validateLayout({ widgets: [W('a', 1, 1, 4, 3), W('b', 5, 1, 4, 3), W('c', 1, 4, 4, 2)] }, T), []);
  const errs = G.validateLayout({ widgets: [W('a', 1, 1, 4, 3), W('b', 4, 3, 4, 3)] }, T);
  assert.deepEqual(codes(errs), ['overlap']);
  assert.deepEqual(errs[0].widgets, ['a', 'b']);
  assert.deepEqual(errs[0].detail.cells, { col: 4, row: 3, cols: 1, rows: 1 });
  // Containment and crossing shapes overlap too.
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', 1, 1, 10, 10), W('b', 3, 3, 2, 2)] }, T)), ['overlap']);
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', 5, 1, 2, 10, 'box'), W('b', 1, 4, 10, 2, 'box')] }, T)), ['overlap']);
});

test('ids: required, well formed, unique', () => {
  for (const id of [undefined, '', ' a', 'a b', 'x'.repeat(65), 7, '-lead']) {
    assert.deepEqual(codes(G.validateLayout({ widgets: [W(id, 1, 1, 4, 3)] }, T)), ['invalid-id'], String(id));
  }
  const dup = G.validateLayout({ widgets: [W('a', 1, 1, 4, 3), W('a', 1, 5, 4, 3)] }, T);
  assert.deepEqual(codes(dup), ['duplicate-id']);
  assert.deepEqual(dup[0].detail.indexes, [0, 1]);
});

test('types: unknown and not-yet-placeable types are refused', () => {
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', 1, 1, 4, 3, 'nope')] }, T)), ['unknown-type']);
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', 1, 1, 4, 3, 'later')] }, T)), ['not-placeable']);
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', 1, 1, 4, 3, 'toString')] }, T)), ['unknown-type'], 'no prototype lookups');
});

test('positions and spans: whole positive numbers, inside 20 columns', () => {
  for (const [col, row] of [[0, 1], [1, 0], [-1, 1], [1.5, 1], ['2', 1], [1, NaN]]) {
    assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', col, row, 4, 3)] }, T)), ['invalid-position'], `${col},${row}`);
  }
  for (const [cols, rows] of [[0, 3], [4, 0], [-2, 3], [2.5, 3], [4, 3.25], [null, 3]]) {
    assert.deepEqual(codes(G.validateLayout({ widgets: [W('a', 1, 1, cols, rows)] }, T)), ['invalid-span'], `${cols}×${rows}`);
  }
  assert.deepEqual(G.validateLayout({ widgets: [W('a', 17, 1, 4, 3)] }, T), [], 'ending at column 20 is inside');
  const out = G.validateLayout({ widgets: [W('a', 18, 1, 4, 3)] }, T);
  assert.deepEqual(codes(out), ['out-of-bounds']);
  assert.equal(out[0].detail.lastCol, 21);
});

test('below a type’s minimum cells is an error, with the numbers', () => {
  const errs = G.validateLayout({ widgets: [W('a', 1, 1, 1, 1)] }, T);
  assert.deepEqual(codes(errs), ['below-min-cols', 'below-min-rows']);
  assert.deepEqual(errs.find(e => e.code === 'below-min-cols').detail, { cols: 1, minCols: 2 });
});

test('a malformed layout is refused as a whole', () => {
  for (const bad of [null, [], {}, { widgets: 'x' }]) assert.deepEqual(codes(G.validateLayout(bad, T)), ['invalid-layout']);
  assert.deepEqual(codes(G.validateLayout({ widgets: [null] }, T)), ['invalid-widget']);
});

test('sizing contracts: positive whole cells, defaults ≥ minimums, pixel floors', () => {
  assert.deepEqual(G.validateContract('ok', T.box.contract), []);
  const bad = c => G.validateContract('x', Object.assign({}, T.box.contract, c)).map(e => e.detail.field);
  assert.deepEqual(bad({ minCols: 0 }), ['minCols']);
  assert.deepEqual(bad({ minRows: 1.5 }), ['minRows']);
  assert.deepEqual(bad({ defaultCols: 1 }), ['defaultCols'], 'default below minimum');
  assert.deepEqual(bad({ defaultRows: 1 }), ['defaultRows']);
  assert.deepEqual(bad({ minWidth: 0 }), ['minWidth']);
  assert.deepEqual(bad({ minHeight: 'tall' }), ['minHeight']);
  assert.deepEqual(bad({ minCols: 21, defaultCols: 21 }), ['minCols', 'defaultCols']);
  assert.deepEqual(G.validateContract('x', null).map(e => e.code), ['invalid-contract']);
  // A layout using a type with a broken contract is refused for that widget.
  const broken = { b: { placeable: true, contract: Object.assign({}, T.box.contract, { defaultCols: 1 }) } };
  const errs = G.validateLayout({ widgets: [W('w', 1, 1, 4, 3, 'b')] }, broken);
  assert.deepEqual(codes(errs), ['invalid-contract']);
  assert.deepEqual(errs[0].widgets, ['w']);
});

// ── Fit at a width ───────────────────────────────────────────────────────
test('fit: pixel floors are checked at the actual width; failures name the widget and sizes', () => {
  const layout = { widgets: [W('a', 1, 1, 6, 1, 'wide')] };          // 6 cols must reach 400px
  assert.deepEqual(G.checkFit(layout, T, 1392), []);                    // 6 × 54.4 + 80 = 406.4
  const errs = G.checkFit(layout, T, 1300);                              // cell 49.8 → 378.8
  assert.deepEqual(codes(errs), ['below-min-width']);
  assert.equal(errs[0].widgets[0], 'a');
  near(errs[0].detail.width, 6 * 49.8 + 80, 'reported width');
  assert.equal(errs[0].detail.minWidth, 400);
  assert.deepEqual(codes(G.checkFit(layout, T, 300)), ['grid-too-narrow']);
});

test('minFitWidth is exact: the layout fits there and not 1px narrower', () => {
  const layout = { widgets: [W('a', 1, 1, 6, 1, 'wide'), W('b', 7, 1, 2, 2)] };
  const min = G.minFitWidth(layout, T);
  assert.deepEqual(G.checkFit(layout, T, min), []);
  assert.ok(G.checkFit(layout, T, min - 1).length > 0);
  // Fit only gets easier as the container widens.
  for (const w of [min, min + 0.5, min + 100, 2560, 5000]) assert.deepEqual(G.checkFit(layout, T, w), [], String(w));
});

// ── The real widget types ────────────────────────────────────────────────
test('every widget type has a valid contract', () => {
  for (const [id, t] of Object.entries(TYPES)) {
    assert.deepEqual(G.validateContract(id, t.contract), [], id);
    assert.ok(t.name && t.measured && t.responsive && typeof t.placeable === 'boolean', id);
  }
  assert.deepEqual(Object.keys(TYPES).filter(id => TYPES[id].placeable).sort(), ['carousel', 'feature-hero', 'feature-spotlight']);
});

test('at the reference width, each minimum cell count is the smallest span reaching its pixel floor', () => {
  const cell = G.cellSize(reference.width);
  near(cell, 54.4, 'reference cell');
  for (const [id, t] of Object.entries(TYPES)) {
    const c = t.contract;
    assert.equal(c.minCols, G.cellsFor(c.minWidth, cell), `${id} minCols`);
    assert.equal(c.minRows, G.cellsFor(c.minHeight, cell), `${id} minRows`);
    // So a minimum-size widget fits at the reference width.
    assert.deepEqual(G.checkFit({ widgets: [W(id, 1, 1, c.minCols, c.minRows, id)] }, { [id]: Object.assign({}, t, { placeable: true }) }, reference.width), [], id);
  }
});

test('the sidebar is a frame region, not a widget type', () => {
  assert.ok(frameRegions.sidebar);
  assert.ok(!TYPES.sidebar);
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('nav', 1, 1, 3, 6, 'sidebar')] }, TYPES)), ['unknown-type']);
});

test('the grid engine is content-neutral: no page, component or CMS names', () => {
  for (const f of ['scripts/grid/atlas-grid.js', 'scripts/grid/renderer.js', 'styles/grid.css']) {
    const code = readFileSync(path.join(SITE, f), 'utf8');
    for (const word of ['home', 'upper', 'feature', 'spotlight', 'carousel', 'cms', 'sidebar', 'banner']) {
      assert.ok(!new RegExp(`\\b${word}`, 'i').test(code), `${f} mentions “${word}”`);
    }
  }
});
