// Atlas Grid editing engine checks (H5.4 Checkpoint B). No dependencies:
//   node --test tests/design/*.test.mjs
// Proposals, the eight resize handles, gesture transactions and history,
// all without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const E = require(path.join(SITE, 'scripts/grid/editor.js'));
const G = require(path.join(SITE, 'scripts/grid/atlas-grid.js'));

// Test types: `box` has only cell minimums; `floor` has pixel floors that
// need more cells on narrower grids (300 × 200px).
const TYPES = {
  box: { placeable: true, contract: { minCols: 2, minRows: 2, defaultCols: 4, defaultRows: 3, minWidth: 1, minHeight: 1 } },
  floor: { placeable: true, contract: { minCols: 2, minRows: 1, defaultCols: 6, defaultRows: 5, minWidth: 300, minHeight: 200 } }
};
const ENV = { types: TYPES, width: 1392 };            // cell 54.4, pitch 70.4
const W = (id, col, row, cols, rows, type = 'box') => ({ id, type, col, row, cols, rows });
// a and b share rows 1–3 with a gap; c sits below an empty band (rows 4–5);
// d is alone far down the canvas.
const BASE = E.freezeLayout({ widgets: [W('a', 1, 1, 4, 3), W('b', 9, 1, 4, 3), W('c', 1, 6, 6, 5, 'floor'), W('d', 15, 12, 4, 2)] });
const SNAPSHOT = JSON.stringify(BASE);
const pos = (r, id) => { const w = r.layout.widgets.find(x => x.id === id); return [w.col, w.row, w.cols, w.rows]; };
const others = (r, id) => r.layout.widgets.filter(w => w.id !== id).map(w => JSON.stringify(w)).join();
const othersOf = (layout, id) => layout.widgets.filter(w => w.id !== id).map(w => JSON.stringify(w)).join();

test('the starting layout is valid', () => {
  assert.deepEqual(G.validateLayout(BASE, TYPES), []);
  assert.deepEqual(G.checkFit(BASE, TYPES, ENV.width), []);
});

// ── Moving ─────────────────────────────────────────────────────────────────
test('moves in every direction keep the size and leave the others alone', () => {
  for (const [id, to] of [['a', { col: 2, row: 1 }], ['a', { col: 1, row: 2 }], ['b', { col: 6, row: 1 }], ['c', { col: 1, row: 5 }], ['d', { col: 14, row: 11 }], ['d', { col: 16, row: 14 }]]) {
    const r = E.proposeMove(BASE, id, to, ENV);
    const before = BASE.widgets.find(w => w.id === id);
    assert.equal(r.valid, true, `${id} → ${to.col},${to.row}: ${r.errors.map(e => e.code)}`);
    assert.deepEqual(pos(r, id), [to.col, to.row, before.cols, before.rows], 'size kept');
    assert.equal(others(r, id), othersOf(BASE, id), 'no other widget changes');
    assert.equal(r.changed, true);
  }
  assert.equal(JSON.stringify(BASE), SNAPSHOT);
});

test('moves stop at the grid’s sides and top; positions must be whole cells', () => {
  let r = E.proposeMove(BASE, 'a', { col: -3, row: 0 }, ENV);
  assert.deepEqual(pos(r, 'a'), [1, 1, 4, 3]);
  assert.deepEqual(r.clamped, { left: 'bounds', top: 'bounds' });
  assert.equal(r.changed, false);
  r = E.proposeMove(BASE, 'd', { col: 19, row: 12 }, ENV);              // 4 wide: last start column is 17
  assert.deepEqual(pos(r, 'd'), [17, 12, 4, 2]);
  assert.deepEqual(r.clamped, { right: 'bounds' });
  assert.throws(() => E.proposeMove(BASE, 'a', { col: 2.5, row: 1 }, ENV), /whole/);
  assert.throws(() => E.proposeMove(BASE, 'nope', { col: 1, row: 1 }, ENV), /No widget/);
});

test('a move onto another widget is refused, naming both; touching is fine', () => {
  const r = E.proposeMove(BASE, 'a', { col: 7, row: 1 }, ENV);
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.map(e => e.code), ['overlap']);
  assert.deepEqual(r.affected.sort(), ['a', 'b']);
  assert.deepEqual(pos(r, 'b'), [9, 1, 4, 3], 'the other widget is not moved');
  assert.equal(E.proposeMove(BASE, 'a', { col: 5, row: 1 }, ENV).valid, true, 'edge to edge with b');
  assert.equal(E.proposeMove(BASE, 'a', { col: 1, row: 3 }, ENV).valid, true, 'edge to edge with c below');
  assert.equal(E.proposeMove(BASE, 'a', { col: 1, row: 4 }, ENV).valid, false, 'one row further overlaps c');
});

test('moving far down grows the extent; moving the lowest widget up shrinks it; nothing compacts', () => {
  assert.equal(G.extent(BASE), 13);
  const down = E.proposeMove(BASE, 'd', { col: 15, row: 60 }, ENV);
  assert.equal(down.valid, true);
  assert.equal(down.extent, 61);
  const up = E.proposeMove(BASE, 'd', { col: 15, row: 1 }, ENV);
  assert.equal(up.valid, true);
  assert.equal(up.extent, 10, 'now c is the lowest');
  assert.equal(others(up, 'd'), othersOf(BASE, 'd'), 'c stays on row 6: the empty rows above it are kept');
});

// ── Resizing ───────────────────────────────────────────────────────────────
test('all eight handles move only their own edges; the opposite edges stay anchored', () => {
  // d: col 15, row 12, 4 × 2 → edges left 15, right 19, top 12, bottom 14; free on every side.
  const cases = {
    left: [{ left: 14 }, [14, 12, 5, 2]],
    right: [{ right: 20 }, [15, 12, 5, 2]],
    top: [{ top: 11 }, [15, 11, 4, 3]],
    bottom: [{ bottom: 15 }, [15, 12, 4, 3]],
    'top-left': [{ top: 11, left: 14 }, [14, 11, 5, 3]],
    'top-right': [{ top: 11, right: 20 }, [15, 11, 5, 3]],
    'bottom-left': [{ bottom: 15, left: 14 }, [14, 12, 5, 3]],
    'bottom-right': [{ bottom: 15, right: 20 }, [15, 12, 5, 3]]
  };
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(E.HANDLES).sort(), 'every handle is tested');
  for (const [handle, [edges, want]] of Object.entries(cases)) {
    const r = E.proposeResize(BASE, 'd', handle, edges, ENV);
    assert.equal(r.valid, true, handle);
    assert.deepEqual(pos(r, 'd'), want, handle);
    const [c, ro, cs, rs] = want;
    if (!E.HANDLES[handle].includes('left')) assert.equal(c, 15, `${handle}: left anchored`);
    if (!E.HANDLES[handle].includes('right')) assert.equal(c + cs, 19, `${handle}: right anchored`);
    if (!E.HANDLES[handle].includes('top')) assert.equal(ro, 12, `${handle}: top anchored`);
    if (!E.HANDLES[handle].includes('bottom')) assert.equal(ro + rs, 14, `${handle}: bottom anchored`);
    assert.equal(others(r, 'd'), othersOf(BASE, 'd'), `${handle}: nothing else changes`);
  }
  // Edges a handle doesn't own are ignored; the ones it owns are required.
  assert.deepEqual(pos(E.proposeResize(BASE, 'd', 'right', { right: 20, left: 1, top: 1 }, ENV), 'd'), [15, 12, 5, 2]);
  assert.throws(() => E.proposeResize(BASE, 'd', 'top-left', { top: 11 }, ENV), /left edge/);
  assert.throws(() => E.proposeResize(BASE, 'd', 'middle', {}, ENV), /Unknown resize handle/);
});

test('resizing stops at the grid’s sides and at the top; downward is unlimited', () => {
  let r = E.proposeResize(BASE, 'd', 'right', { right: 30 }, ENV);
  assert.deepEqual(pos(r, 'd'), [15, 12, 6, 2]);
  assert.equal(r.clamped.right, 'bounds');
  r = E.proposeResize(BASE, 'a', 'top-left', { top: -2, left: -5 }, ENV);
  assert.deepEqual(pos(r, 'a'), [1, 1, 4, 3]);
  assert.deepEqual(r.clamped, { left: 'bounds', top: 'bounds' });
  r = E.proposeResize(BASE, 'd', 'bottom', { bottom: 200 }, ENV);
  assert.equal(r.valid, true);
  assert.equal(r.extent, 199);
});

test('resizing into another widget is refused; the neighbour is not moved or shrunk', () => {
  const r = E.proposeResize(BASE, 'b', 'left', { left: 4 }, ENV);    // b would cover column 4, which a occupies
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.map(e => e.code), ['overlap']);
  assert.deepEqual(r.affected.sort(), ['a', 'b']);
  assert.deepEqual(pos(r, 'a'), [1, 1, 4, 3]);
  assert.equal(E.proposeResize(BASE, 'b', 'left', { left: 5 }, ENV).valid, true, 'up to a’s edge is fine');
  assert.equal(E.proposeResize(BASE, 'a', 'bottom', { bottom: 7 }, ENV).valid, false, 'down into c');
});

test('shrinking stops at the minimum cells', () => {
  for (const [handle, edges, want, edge] of [
    ['right', { right: 15 }, [15, 12, 2, 2], 'right'], ['left', { left: 30 }, [17, 12, 2, 2], 'left'],
    ['top', { top: 20 }, [15, 12, 4, 2], 'top'], ['bottom', { bottom: 3 }, [15, 12, 4, 2], 'bottom'],
    ['top-left', { top: 99, left: 99 }, [17, 12, 2, 2], 'left']
  ]) {
    const r = E.proposeResize(BASE, 'd', handle, edges, ENV);
    assert.deepEqual(pos(r, 'd'), want, handle);
    assert.equal(r.clamped[edge], 'minimum', handle);
    assert.equal(r.valid, true, handle);
  }
});

test('pixel floors set the minimum at the width given; the same request differs by width', () => {
  // c is 6 × 5 of a 300 × 200px type. At 1392px a cell is 54.4: 5 × 4 cells needed.
  assert.deepEqual(E.minCells(TYPES.floor.contract, ENV), { cols: 5, rows: 4 });
  let r = E.proposeResize(BASE, 'c', 'bottom-right', { right: 2, bottom: 7 }, ENV);
  assert.deepEqual(pos(r, 'c'), [1, 6, 5, 4]);
  assert.deepEqual(r.clamped, { right: 'minimum', bottom: 'minimum' });
  assert.ok(G.rect(r.widget, G.cellSize(1392)).width >= 300);
  // On a wider grid (2512px, cells 110.4) 3 × 2 cells are enough.
  const wide = { types: TYPES, width: 2512 };
  assert.deepEqual(E.minCells(TYPES.floor.contract, wide), { cols: 3, rows: 2 });
  r = E.proposeResize(BASE, 'c', 'bottom-right', { right: 2, bottom: 7 }, wide);
  assert.deepEqual(pos(r, 'c'), [1, 6, 3, 2]);
  // On a narrower grid (1000px, cells 34.8) c’s current 6 columns are too narrow: even a plain move is refused.
  const narrow = { types: TYPES, width: 1000 };
  r = E.proposeMove(BASE, 'c', { col: 2, row: 6 }, narrow);
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.map(e => e.code), ['below-min-width']);
  assert.equal(E.minCells(TYPES.floor.contract, { types: TYPES, width: 300 }), null, 'no room at all');
});

test('the engine has no fixed width: callers choose it', () => {
  const src = readFileSync(path.join(SITE, 'scripts/grid/editor.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const numbers = (src.match(/\b\d{3,}\b/g) || []).filter(n => n !== '100');   // 100: the default history limit
  assert.deepEqual(numbers, [], 'no pixel widths in the engine');
  assert.ok(!/document\.|addEventListener|getBoundingClientRect|clientX|PointerEvent|KeyboardEvent/.test(src), 'no DOM or event code');
});

// ── Gestures ───────────────────────────────────────────────────────────────
test('a gesture previews without touching the committed layout; valid → invalid → valid commits the last', () => {
  const g = E.beginGesture(BASE, { kind: 'move', id: 'a', env: ENV });
  assert.equal(g.update({ col: 2, row: 1 }).valid, true);
  assert.equal(g.update({ col: 8, row: 1 }).valid, false);            // over b
  assert.equal(g.update({ col: 5, row: 2 }).valid, true);             // back in open space
  assert.equal(JSON.stringify(g.committed()), SNAPSHOT, 'committed layout untouched during the gesture');
  const out = g.end();
  assert.equal(out.reason, 'committed');
  assert.deepEqual(pos({ layout: out.committed }, 'a'), [5, 2, 4, 3]);
  assert.equal(JSON.stringify(BASE), SNAPSHOT);
  assert.throws(() => g.update({ col: 1, row: 1 }), /ended/);
});

test('releasing over an invalid place, cancelling, or ending where it started commits nothing', () => {
  let g = E.beginGesture(BASE, { kind: 'move', id: 'a', env: ENV });
  g.update({ col: 3, row: 1 }); g.update({ col: 9, row: 2 });
  let out = g.end();
  assert.equal(out.committed, null);
  assert.equal(out.reason, 'invalid');
  assert.equal(out.errors[0].code, 'overlap');
  g = E.beginGesture(BASE, { kind: 'resize', id: 'd', handle: 'bottom-right', env: ENV });
  g.update({ bottom: 20, right: 20 });
  assert.deepEqual(g.cancel(), { committed: null, reason: 'cancelled' });
  g = E.beginGesture(BASE, { kind: 'move', id: 'a', env: ENV });
  g.update({ col: 4, row: 1 }); g.update({ col: 1, row: 1 });
  assert.equal(g.end().reason, 'unchanged');
  assert.equal(E.beginGesture(BASE, { kind: 'move', id: 'a', env: ENV }).end().reason, 'unchanged', 'a click without movement');
  assert.throws(() => E.beginGesture(BASE, { kind: 'resize', id: 'a', handle: 'centre', env: ENV }), /handle/);
  assert.equal(JSON.stringify(BASE), SNAPSHOT);
});

test('a resize gesture uses the same rules', () => {
  const g = E.beginGesture(BASE, { kind: 'resize', id: 'b', handle: 'left', env: ENV });
  assert.equal(g.update({ left: 3 }).valid, false);
  assert.equal(g.update({ left: 5 }).valid, true);
  const out = g.end();
  assert.deepEqual(pos({ layout: out.committed }, 'b'), [5, 1, 8, 3]);
  assert.equal(out.committed.widgets.find(w => w.id === 'b').col + out.committed.widgets.find(w => w.id === 'b').cols, 13, 'right edge anchored');
});

test('editing extent: rows shown during a gesture, never part of the layout', () => {
  const g = E.beginGesture(BASE, { kind: 'move', id: 'd', env: ENV });
  const p = g.update({ col: 15, row: 30 });
  assert.equal(E.editingExtent(BASE, p), 31);
  assert.equal(E.editingExtent(BASE, p, { pointerRow: 40, spare: 3 }), 43);
  assert.equal(E.editingExtent(BASE, null), 13, 'no gesture: the committed extent');
  g.cancel();
  assert.equal(G.extent(BASE), 13);
  assert.ok(!('extent' in BASE) && BASE.widgets.every(w => Object.keys(w).join() === 'id,type,col,row,cols,rows'), 'layouts hold placements only');
});

test('proposals and their layouts are frozen; inputs are never changed', () => {
  const r = E.proposeMove(BASE, 'a', { col: 2, row: 2 }, ENV);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.layout) && Object.isFrozen(r.layout.widgets) && r.layout.widgets.every(Object.isFrozen));
  assert.throws(() => { r.layout.widgets[0].col = 9; }, TypeError);
  const plain = { widgets: BASE.widgets.map(w => Object.assign({}, w)) };        // an unfrozen caller copy
  const json = JSON.stringify(plain);
  E.proposeResize(plain, 'd', 'top-left', { top: 2, left: 2 }, ENV);
  E.beginGesture(plain, { kind: 'move', id: 'a', env: ENV }).update({ col: 3, row: 3 });
  assert.equal(JSON.stringify(plain), json);
});

// ── Keyboard steps ─────────────────────────────────────────────────────────
test('keyboard steps are proposals with the same rules', () => {
  assert.deepEqual(pos(E.nudge(BASE, 'a', 1, 0, ENV), 'a'), [2, 1, 4, 3]);
  assert.deepEqual(pos(E.nudge(BASE, 'a', 0, 1, ENV), 'a'), [1, 2, 4, 3]);
  assert.equal(E.nudge(BASE, 'a', -1, 0, ENV).changed, false, 'already at the left side');
  assert.deepEqual(pos(E.grow(BASE, 'd', 1, 0, ENV), 'd'), [15, 12, 5, 2]);
  assert.deepEqual(pos(E.grow(BASE, 'd', 0, -1, ENV), 'd'), [15, 12, 4, 2], 'stops at the minimum');
  assert.equal(E.grow(BASE, 'a', 0, 3, ENV).valid, false, 'into c');
});

// ── History ────────────────────────────────────────────────────────────────
test('history: one entry per committed change; undo, redo, and a new edit clears redo', () => {
  const h = E.createHistory(BASE);
  assert.equal(h.canUndo(), false);
  const m1 = E.proposeMove(h.present(), 'a', { col: 2, row: 1 }, ENV);
  assert.equal(E.commitProposal(h, m1), true);
  const m2 = E.proposeResize(h.present(), 'd', 'right', { right: 20 }, ENV);
  assert.equal(E.commitProposal(h, m2), true);
  assert.deepEqual(h.size(), { past: 2, future: 0 });
  assert.deepEqual(pos({ layout: h.undo() }, 'd'), [15, 12, 4, 2]);
  assert.deepEqual(pos({ layout: h.undo() }, 'a'), [1, 1, 4, 3]);
  assert.equal(h.undo(), null);
  assert.deepEqual(pos({ layout: h.redo() }, 'a'), [2, 1, 4, 3]);
  assert.equal(h.canRedo(), true);
  E.commitProposal(h, E.proposeMove(h.present(), 'b', { col: 10, row: 1 }, ENV));
  assert.equal(h.canRedo(), false, 'a new edit after undo clears redo');
});

test('history ignores invalid, cancelled and unchanged edits', () => {
  const h = E.createHistory(BASE);
  assert.equal(E.commitProposal(h, E.proposeMove(h.present(), 'a', { col: 9, row: 1 }, ENV)), false, 'invalid');
  assert.equal(E.commitProposal(h, E.proposeMove(h.present(), 'a', { col: 1, row: 1 }, ENV)), false, 'unchanged');
  const g = E.beginGesture(h.present(), { kind: 'move', id: 'a', env: ENV });
  g.update({ col: 3, row: 1 });
  g.cancel();
  assert.equal(h.commit(null), false, 'a cancelled gesture commits nothing');
  assert.equal(h.commit(h.present()), false);
  assert.equal(h.canUndo(), false);
});

test('reset is one undoable step, and does nothing when already at the start', () => {
  const h = E.createHistory(BASE);
  assert.equal(h.reset(), false, 'already the original');
  E.commitProposal(h, E.proposeMove(h.present(), 'a', { col: 2, row: 1 }, ENV));
  E.commitProposal(h, E.proposeMove(h.present(), 'd', { col: 15, row: 20 }, ENV));
  assert.equal(h.reset(), true);
  assert.ok(E.sameLayout(h.present(), BASE));
  assert.deepEqual(pos({ layout: h.undo() }, 'd'), [15, 20, 4, 2], 'undo brings the edits back in one step');
  assert.deepEqual(pos({ layout: h.present() }, 'a'), [2, 1, 4, 3]);
});

test('history keeps at most its limit of undo steps', () => {
  const h = E.createHistory(BASE, { limit: 3 });
  for (let row = 20; row < 25; row++) E.commitProposal(h, E.proposeMove(h.present(), 'd', { col: 15, row }, ENV));
  assert.deepEqual(h.size(), { past: 3, future: 0 });
  h.undo(); h.undo(); h.undo();
  assert.equal(h.undo(), null);
  assert.deepEqual(pos({ layout: h.present() }, 'd'), [15, 21, 4, 2], 'the oldest steps were dropped');
  assert.ok(E.sameLayout(E.createHistory(BASE).original(), BASE));
  assert.equal(E.createHistory(BASE, {}).size().past, 0);
});

// ── Width-aware minimums (H5.4 refinement) ─────────────────────────────────
const BANDED = { band: { placeable: true, contract: { minCols: 2, minRows: 1, defaultCols: 20, defaultRows: 7, minWidth: 100, minHeight: 356, minHeightBands: [{ maxWidth: 640, minHeight: 384 }, { maxWidth: 900, minHeight: 392 }] } } };

test('minimum rows follow the widget’s own width', () => {
  const env = { types: BANDED, width: 1122 };                    // cells 40.9, pitch 56.9
  assert.equal(E.minCells(BANDED.band.contract, env, 20).rows, 7, 'full width (1122px): 356px → 7 rows');
  assert.equal(E.minCells(BANDED.band.contract, env, 14).rows, 8, '781px wide (641–900 band): 392px → 8 rows');
  assert.equal(E.minCells(BANDED.band.contract, env, 10).rows, 8, '553px wide (≤640 band): 384px → 8 rows');
  assert.equal(E.minCells(BANDED.band.contract, env, 4).rows, 8, '212px wide (≤640 band): 384px → 8 rows');
});

test('shrinking a widget’s height stops at the floor for its current width', () => {
  const env = { types: BANDED, width: 1122 };
  const L = E.freezeLayout({ widgets: [W('c', 1, 1, 20, 9, 'band')] });
  const r = E.proposeResize(L, 'c', 'bottom', { bottom: 2 }, env);
  assert.deepEqual(pos(r, 'c'), [1, 1, 20, 7]);
  assert.equal(r.clamped.bottom, 'minimum');
  // Narrowing it to 10 columns (553px, the 384px band) makes 7 rows too short: refused, not resized.
  const narrow = E.proposeResize(r.layout, 'c', 'right', { right: 11 }, env);
  assert.equal(narrow.valid, false);
  assert.deepEqual(narrow.errors.map(e => e.code), ['below-min-height']);
  // A corner resize gets the floor for its new width: 10 columns → 8 rows (384px band).
  const corner = E.proposeResize(L, 'c', 'bottom-right', { right: 11, bottom: 2 }, env);
  assert.deepEqual(pos(corner, 'c'), [1, 1, 10, 8]);
  assert.equal(corner.valid, true);
});

test('a change that fits here but not at a wider width is refused', () => {
  // A 5-column widget at 600px: 5 × 15.2 + 64 = 140px wide (≤640: needs 384).
  // With 18 rows it is 18 × 15.2 + 272 = 545.6px tall: fits here. Widen the grid and the
  // widget crosses 640px, where it needs 392px… which it still has; so pick a case that fails:
  const T = { t: { placeable: true, contract: { minCols: 1, minRows: 1, defaultCols: 1, defaultRows: 1, minWidth: 1, minHeight: 50, minHeightBands: [{ maxWidth: 200, minHeight: 50 }, { maxWidth: 400, minHeight: 300 }] } } };
  const env = { types: T, width: 600 };                          // cells 14.8
  const L = E.freezeLayout({ widgets: [W('a', 1, 1, 6, 4, 't')] }); // 6 × 14.8 + 80 = 168.8px wide, 4 × 14.8 + 48 = 107.2px tall
  const r = E.proposeMove(L, 'a', { col: 2, row: 1 }, env);
  assert.equal(r.valid, false, 'wider screens put it in the 300px band, where 4 rows are too short');
  assert.deepEqual(r.errors.map(e => e.code), ['unfit-when-wider']);
  assert.ok(r.errors[0].detail.fitsFrom > 600);
  assert.equal(E.proposeMove(L, 'a', { col: 2, row: 1 }, { types: T, width: r.errors[0].detail.fitsFrom + 1 }).valid, true, 'from its threshold up it is fine');
});

// ── Fixed-height rows (H5.3) ───────────────────────────────────────────────
const ROW = 23.43;
const FIXED = E.freezeLayout({ id: 'upper', frame: 'sidebar', rowHeight: ROW, widgets: [W('c', 1, 1, 6, 10, 'floor'), W('a', 9, 1, 4, 3)] });

test('fixed rows: minimum rows count fixed rows; region fields survive every proposal', () => {
  const env = { types: TYPES, width: 1392 };
  // floor: 300 × 200px. 200px in 23.43px rows (+16 gutters) needs 6 rows; square cells would need 4.
  assert.equal(E.minCells(TYPES.floor.contract, Object.assign({ rowHeight: ROW }, env), 6).rows, 6);
  assert.equal(E.minCells(TYPES.floor.contract, env, 6).rows, 4);
  const r = E.proposeResize(FIXED, 'c', 'bottom', { bottom: 2 }, env);
  assert.deepEqual(pos(r, 'c'), [1, 1, 6, 6]);
  assert.equal(r.clamped.bottom, 'minimum');
  assert.equal(r.layout.rowHeight, ROW);
  assert.equal(r.layout.id, 'upper');
  assert.equal(r.layout.frame, 'sidebar');
  const m = E.proposeMove(FIXED, 'a', { col: 9, row: 20 }, env);
  assert.equal(m.valid, true);
  assert.equal(m.layout.rowHeight, ROW);
  // Collisions block in fixed rows exactly as in square ones.
  assert.equal(E.proposeMove(FIXED, 'a', { col: 5, row: 1 }, env).valid, false);
});

test('fixed rows: fit is checked with the fixed height, not the cell', () => {
  // 6 columns × 6 fixed rows: 6 × 23.43 + 80 = 220.6px ≥ 200 at any width; as square cells at 1000px it would be 6 × 34.8 + 80.
  const L = E.freezeLayout({ rowHeight: ROW, widgets: [W('c', 1, 1, 7, 6, 'floor')] });
  for (const width of [1000, 1392, 2000]) assert.equal(E.proposeMove(L, 'c', { col: 2, row: 1 }, { types: TYPES, width }).valid, true, `at ${width}`);
  const short = E.freezeLayout({ rowHeight: ROW, widgets: [W('c', 1, 1, 7, 7, 'floor')] });
  const r = E.proposeResize(short, 'c', 'bottom', { bottom: 6 }, { types: TYPES, width: 1392 });   // 5 rows = 181.2px < 200
  assert.deepEqual(pos(r, 'c'), [1, 1, 7, 6], 'stops at 6 rows');
});

test('history can hold whole documents (layout plus content)', () => {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const h = E.createHistory({ regions: [], components: { x: 1 } }, { same, freeze: d => Object.freeze(structuredClone(d)) });
  assert.equal(h.commit({ regions: [], components: { x: 1 } }), false, 'unchanged');
  assert.equal(h.commit({ regions: [], components: { x: 2 } }), true);
  assert.equal(h.undo().components.x, 1);
  assert.equal(h.redo().components.x, 2);
  assert.ok(Object.isFrozen(h.present()));
});

// ── Adding, removing, stacking order, amending (H5.3 Checkpoint D) ─────────
test('a new widget takes its default size in the first free place in reading order; nothing else moves', () => {
  const r = E.proposeAdd(BASE, { id: 'n', type: 'box' }, ENV);
  assert.equal(r.valid, true);
  assert.deepEqual(pos(r, 'n'), [5, 1, 4, 3], 'between a and b');
  assert.equal(others(r, 'n'), othersOf(BASE, 'n'));
  // No gap wide enough above: below everything.
  const full = E.freezeLayout({ widgets: [W('a', 1, 1, 18, 3), W('b', 1, 4, 18, 3)] });
  assert.deepEqual(pos(E.proposeAdd(full, { id: 'n', type: 'box' }, ENV), 'n'), [1, 7, 4, 3]);
  assert.deepEqual(pos(E.proposeAdd({ widgets: [] }, { id: 'n', type: 'box' }, ENV), 'n'), [1, 1, 4, 3]);
  assert.throws(() => E.proposeAdd(BASE, { id: 'a', type: 'box' }, ENV), /already/);
});

test('a new widget is as tall as its content needs, at the width and at every wider one', () => {
  const r = E.proposeAdd(FIXED, { id: 'n', type: 'floor' }, { types: TYPES, width: 1392 });
  assert.deepEqual(pos(r, 'n').slice(2), [6, 6], 'the default 5 rows are too short in 23.43px rows');
  assert.equal(r.layout.rowHeight, ROW);
  const T = { band: { placeable: true, contract: { minCols: 4, minRows: 2, defaultCols: 8, defaultRows: 2, minWidth: 100, minHeight: 300, minHeightBands: [{ maxWidth: 400, minHeight: 100 }] } } };
  const b = E.proposeAdd({ rowHeight: ROW, widgets: [] }, { id: 'n', type: 'band' }, { types: T, width: 900 });   // 350px wide here, over 400 in wider windows
  assert.equal(b.valid, true);
  assert.deepEqual(pos(b, 'n').slice(2), [8, 9], 'tall enough for the wider floor');
  assert.equal(E.proposeAdd({ widgets: [] }, { id: 'n', type: 'floor' }, { types: TYPES, width: 290 }), null, 'no usable size');
});

test('adding and removing keep a stack order complete; a new widget follows its neighbour', () => {
  const L = E.freezeLayout({ stack: ['b', 'a'], widgets: [W('a', 1, 1, 4, 3), W('b', 9, 1, 4, 3)] });
  const r = E.proposeAdd(L, { id: 'n', type: 'box' }, ENV);
  assert.equal(r.valid, true);
  assert.deepEqual(r.layout.stack, ['b', 'a', 'n'], 'placed between a and b, so after a');
  const x = E.proposeRemove(r.layout, 'b', ENV);
  assert.equal(x.valid, true);
  assert.deepEqual(x.layout.stack, ['a', 'n']);
  assert.deepEqual(x.layout.widgets.map(w => w.id), ['a', 'n']);
  assert.equal(E.proposeRemove(E.freezeLayout({ widgets: [W('a', 1, 1, 4, 3)] }), 'a', ENV).valid, true, 'the last one too');
});

test('the stacked order changes by steps and stops at the ends; the grid stays as it is', () => {
  const r = E.proposeStack(BASE, 'c', -1, ENV);
  assert.deepEqual(r.layout.stack, ['a', 'c', 'b', 'd'], 'from reading order');
  assert.deepEqual(r.layout.widgets, BASE.widgets);
  assert.equal(E.proposeStack(BASE, 'a', -1, ENV).changed, false);
  assert.equal(E.proposeStack(r.layout, 'd', 1, ENV).changed, false);
});

test('amending replaces the present step; back at the start it disappears', () => {
  const h = E.createHistory(1, { same: (a, b) => a === b, freeze: v => v });
  assert.equal(h.amend(2), true, 'nothing to amend yet: a step');
  h.amend(3);
  assert.deepEqual([h.present(), h.size().past], [3, 1]);
  assert.equal(h.undo(), 1);
  h.commit(4);
  assert.equal(h.amend(1), true);
  assert.deepEqual([h.present(), h.canUndo(), h.canRedo()], [1, false, false]);
});

// ── Growing widgets (P1) ────────────────────────────────────────────────────
test('growing widgets: moves, resizes and additions that would put something below one are refused', () => {
  const box = { minCols: 2, minRows: 1, defaultCols: 4, defaultRows: 2, minWidth: 10, minHeight: 10 };
  const types = { box: { placeable: true, contract: box }, list: { placeable: true, grows: true, contract: Object.assign({}, box, { defaultCols: 20 }) } };
  const env = { types, width: 1392 };
  const at = (id, type, col, row, cols, rows) => ({ id, type, col, row, cols, rows });
  const L = { widgets: [at('a', 'box', 1, 1, 4, 2), at('l', 'list', 1, 4, 20, 3)] };
  const why = p => p.errors.map(e => e.code);
  assert.deepEqual(why(E.proposeMove(L, 'a', { col: 1, row: 8 }, env)), ['below-growing']);
  assert.ok(E.proposeMove(L, 'l', { col: 1, row: 10 }, env).valid, 'it can move down itself, leaving room above');
  assert.ok(E.proposeResize(L, 'l', 'bottom', { bottom: 12 }, env).valid, 'and be made taller');
  const beside = { widgets: [at('l', 'list', 1, 1, 10, 4), at('a', 'box', 12, 1, 4, 4)] };
  assert.deepEqual(why(E.grow(beside, 'a', 0, 1, env)), ['below-growing']);
  assert.deepEqual(why(E.grow(beside, 'l', 0, -1, env)), ['below-growing']);
  // Adding: the first free place that keeps the growing widget last.
  const gap = E.proposeAdd(L, { id: 'b', type: 'box' }, env);
  assert.ok(gap.valid && gap.widget.row === 1 && gap.widget.col === 5);
  const full = E.proposeAdd({ widgets: [at('l', 'list', 1, 1, 20, 3)] }, { id: 'b', type: 'box' }, env);
  assert.deepEqual(why(full), ['below-growing'], 'refused, with the reason');
  // A new growing widget goes below everything.
  const last = E.proposeAdd({ widgets: [at('a', 'box', 1, 6, 4, 2)] }, { id: 'l', type: 'list' }, env);
  assert.ok(last.valid && last.widget.row === 8, JSON.stringify(last.widget));
  // Removing one is always allowed.
  assert.ok(E.proposeRemove(L, 'l', env).valid);
});
