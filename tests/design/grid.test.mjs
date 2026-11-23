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
    assert.equal(c.minRows, G.cellsFor(G.minHeightAt(c, G.spanSize(c.minCols, cell)), cell), `${id} minRows (the floor for the width minCols gives it)`);
    // So a minimum-size widget fits at the reference width.
    assert.deepEqual(G.checkFit({ widgets: [W(id, 1, 1, c.minCols, c.minRows, id)] }, { [id]: Object.assign({}, t, { placeable: true }) }, reference.width), [], id);
  }
});

test('the sidebar is a frame region, not a widget type', () => {
  assert.ok(frameRegions.sidebar);
  assert.ok(!TYPES.sidebar);
  assert.deepEqual(codes(G.validateLayout({ widgets: [W('nav', 1, 1, 3, 6, 'sidebar')] }, TYPES)), ['unknown-type']);
});

test('the grid engine and editing code are content-neutral: no page, component or CMS names', () => {
  for (const f of ['scripts/grid/atlas-grid.js', 'scripts/grid/renderer.js', 'styles/grid.css', 'scripts/grid/editor.js', 'scripts/grid/interaction.js', 'scripts/grid/overlay.js', 'styles/grid-editor.css']) {
    const code = readFileSync(path.join(SITE, f), 'utf8');
    for (const word of ['home', 'upper', 'feature', 'spotlight', 'carousel', 'cms', 'sidebar', 'banner']) {
      assert.ok(!new RegExp(`\\b${word}`, 'i').test(code), `${f} mentions “${word}”`);
    }
  }
});

// ── Width-aware height floors (H5.4 refinement) ─────────────────────────────
// A test type that, like the Carousel, gets taller between 641 and 900px wide.
const BANDED = { band: { placeable: true, contract: { minCols: 2, minRows: 1, defaultCols: 20, defaultRows: 7, minWidth: 100, minHeight: 356, minHeightBands: [{ maxWidth: 640, minHeight: 384 }, { maxWidth: 900, minHeight: 392 }] } } };

test('minHeightAt picks the floor for the widget’s own width', () => {
  const c = BANDED.band.contract;
  assert.equal(G.minHeightAt(c, 300), 384);
  assert.equal(G.minHeightAt(c, 640), 384);
  assert.equal(G.minHeightAt(c, 640.5), 392);
  assert.equal(G.minHeightAt(c, 900), 392);
  assert.equal(G.minHeightAt(c, 901), 356);
  assert.equal(G.minHeightAt({ minHeight: 50 }, 10000), 50, 'no bands: one floor');
});

test('height bands are validated', () => {
  const field = b => G.validateContract('x', Object.assign({}, BANDED.band.contract, { minHeightBands: b })).map(e => e.detail.field);
  assert.deepEqual(field([{ maxWidth: 640, minHeight: 300 }]), []);
  assert.deepEqual(field('tall'), ['minHeightBands']);
  assert.deepEqual(field([{ maxWidth: 0, minHeight: 300 }]), ['minHeightBands']);
  assert.deepEqual(field([{ maxWidth: 900, minHeight: 1 }, { maxWidth: 640, minHeight: 1 }]), ['minHeightBands'], 'ascending');
});

test('fit uses the floor for each widget’s actual width, for any span', () => {
  // Full width, 7 rows: 1122px grid → 1122px wide, 7 × 40.9 + 96 = 382.3px tall; above 900 it needs 356.
  const full = { widgets: [W('c', 1, 1, 20, 7, 'band')] };
  assert.deepEqual(G.checkFit(full, BANDED, 1122), []);
  // At 1000px it is 1000 wide (needs 356) but only 7 × 34.8 + 96 = 339.6 tall.
  assert.deepEqual(G.checkFit(full, BANDED, 1000).map(e => e.code), ['below-min-height']);
  // Half width, 7 rows at 1122: 10 × 40.9 + 144 = 553px wide → the ≤640 floor (384) applies; 382.3px is too short.
  const half = { widgets: [W('c', 1, 1, 10, 7, 'band')] };
  const e = G.checkFit(half, BANDED, 1122);
  assert.deepEqual(e.map(x => x.code), ['below-min-height']);
  assert.equal(e[0].detail.minHeight, 384);
  // 14 columns (780.6px wide) is in the 641–900 band: 392px; 7 rows (382.3px) fail, 8 (439.2px) fit.
  const e14 = G.checkFit({ widgets: [W('c', 1, 1, 14, 7, 'band')] }, BANDED, 1122);
  assert.equal(e14[0].detail.minHeight, 392);
  assert.deepEqual(G.checkFit({ widgets: [W('c', 1, 1, 14, 8, 'band')] }, BANDED, 1122), []);
  assert.deepEqual(G.checkFit({ widgets: [W('c', 1, 1, 10, 8, 'band')] }, BANDED, 1122), [], 'one more row is enough');
});

test('fitting is not monotonic in width; minFitWidth is where it holds for every wider width', () => {
  // 20 × 7: fits at some widths ≤ 900 (cells shrink but so does the widget, and the
  // 384/392 floors apply), fails across 641–900 widget widths, fits again above.
  const layout = { widgets: [W('c', 1, 1, 20, 7, 'band')] };
  const from = G.minFitWidth(layout, BANDED);
  assert.ok(Math.abs(from - (20 * ((356 - 96) / 7) + 304)) < 0.01, `threshold ${from}`);
  for (let w = Math.ceil(from); w <= from + 1200; w += 0.5) assert.deepEqual(G.checkFit(layout, BANDED, w), [], `fits at ${w}`);
  assert.ok(G.checkFit(layout, BANDED, from - 0.05).length > 0, 'and not just below');
  // A widget whose band boundary itself is the limit: 10 columns needing more than the band allows.
  const edge = { widgets: [W('c', 1, 1, 10, 3, 'band')] };
  const f2 = G.minFitWidth(edge, BANDED);
  for (let w = Math.ceil(f2 * 2) / 2; w <= f2 + 800; w += 0.5) assert.deepEqual(G.checkFit(edge, BANDED, w), [], `fits at ${w}`);
  assert.ok(G.checkFit(edge, BANDED, f2 - 0.05).length > 0);
  assert.ok(G.widgetMinFitWidth(edge.widgets[0], BANDED.band.contract) === f2);
});
