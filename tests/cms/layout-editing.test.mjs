// Layout editing in the working copy (H5.3 Checkpoint D): scripts/cms/workspace.js
// with the grid editor's proposals and history. Widget instances and their own
// content, one undo history for layout and content, schema 1 ↔ 2, conflicting
// layouts, and the publish summary. Saves go to the emulated Supabase with
// 0014 (and, for one test, without it), so the server agrees with every result.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, homeDoc } from './supabase-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const V1 = p => require(path.join(ROOT, 'PergamonAtlas.V1/scripts', p));
const content = V1('cms/content.js');
const workspace = V1('cms/workspace.js');
const publish = V1('cms/publish.js');
const G = V1('grid/atlas-grid.js');
const E = V1('grid/editor.js');
const TYPES = V1('grid/widget-types.js').types;

const clone = o => JSON.parse(JSON.stringify(o));
// What the browser validates with (the grid rules too).
const validate = doc => (doc && doc.schema === 2 ? content.validatePageDocument(doc, { grid: { validatePage: G.validatePage, types: TYPES } }) : content.validateDocument(doc));
// The widths Layout Mode checks at (scripts/cms/layout-mode.js).
const envOf = region => ({ types: TYPES, width: region.frame === 'sidebar' ? 981 : 1217 });
const GAME = { path: '/games/chess-forge/', name: 'Chess Forge' };

let env, admin, admin2;
before(async () => {
  env = await createEnv({ extra: ['0013_site_sidebar', '0014_page_layout'] });
  admin = await env.createUser('admin@example.test', { admin: true });
  admin2 = await env.createUser('second@example.test', { admin: true });
});
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
const current = async (e = env, who = admin) => ok(await e.rpc(who, 'get_draft', 'home'));
async function publishDoc(doc) {
  const c = await current();
  const s = ok(await env.rpc(admin, 'save_draft', 'home', doc, c.draft ? c.draft.id : null, null));
  return ok(await env.rpc(admin, 'publish', 'home', s.draft_id, c.published ? c.published.id : null));
}
function memoryStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m }; }
function make({ who = admin, e = env, storage = memoryStorage(), now } = {}) {
  return workspace.create({
    page: 'home', storage, validate, content, now, fallbackDoc: homeDoc(),
    createHistory: E.createHistory, starter: type => content.starterContent(type, GAME),
    api: { getDraft: p => e.rpc(who, 'get_draft', p), saveDraft: (p, doc, expected) => e.rpc(who, 'save_draft', p, doc, expected, null) }
  });
}
async function fresh(doc = homeDoc(), o = {}) { await publishDoc(doc); const ws = make(o); ok2(await ws.load()); return ws; }
const ok2 = r => { assert.ok(r && r.ok, JSON.stringify(r)); return r; };

// Layout Mode's operations, as its toolbar and controller make them.
function add(ws, regionId, type) {
  const region = ws.region(regionId), id = content.newInstanceId(type, ...ws.docs());
  const p = E.proposeAdd(region, { id, type }, envOf(region));
  assert.ok(p && p.valid, JSON.stringify(p && p.errors));
  assert.ok(ws.addInstance(p.layout, id, content.starterContent(type, GAME)));
  return id;
}
function remove(ws, regionId, id) { const region = ws.region(regionId); return ws.removeInstance(E.proposeRemove(region, id, envOf(region)).layout, id); }
function move(ws, regionId, id, to) {
  const region = ws.region(regionId), p = E.proposeMove(region, id, to, envOf(region));
  assert.ok(p.valid, JSON.stringify(p.errors));
  return ws.setRegion(p.layout);
}
const at = (ws, id) => { const w = content.instancesOf(ws.working()).find(i => i.id === id); return w ? [w.widget.col, w.widget.row, w.widget.cols, w.widget.rows].join() : null; };

// ── Ids by document ────────────────────────────────────────────────────
test('what an id means comes from the document’s instances', () => {
  const doc = content.upgradeDocument(homeDoc());
  doc.regions[1].widgets.push({ id: 'spotlight-2', type: 'feature-spotlight', col: 1, row: 12, cols: 12, rows: 4 }, { id: 'tools', type: 'carousel', col: 1, row: 20, cols: 20, rows: 10 });
  assert.equal(content.cardType('home.spotlight-2'), null, 'unknown on today’s homepage');
  assert.equal(content.cardType('home.spotlight-2', doc), 'spotlight');
  assert.equal(content.cardType('home.spotlight-2.saved.x', homeDoc(), doc), 'spotlight', 'the first document that knows it');
  assert.equal(content.isSaved('home.spotlight-2.saved.x', doc), true);
  assert.equal(content.slotOf('home.spotlight-2.saved.x', doc), 'home.spotlight-2');
  assert.equal(content.cardType('home.tools.pong', doc), 'tile');
  assert.equal(content.listOf('home.tools.pong', doc), 'home.tools');
  assert.equal(content.cardType('home.navigation', doc), null);
  assert.deepEqual(content.cardFields('home.spotlight-2', {}, doc).map(f => f.key), ['title', 'cta', 'href', 'art']);
  // A document without the homepage's own Featured widget doesn't have its card.
  doc.regions[0].widgets.shift();
  assert.equal(content.cardType('home.featured', doc), null);
  assert.deepEqual(content.listsOf(doc), ['home.spotlight.saved', 'home.carousel', 'home.spotlight-2.saved', 'home.tools']);
  assert.notEqual(content.newKey('Saved', []), 'saved', 'never the saved list’s own name');
});

test('instance ids and names: unused, stable, told apart', () => {
  const doc = homeDoc();
  assert.equal(content.newInstanceId('feature-hero', doc), 'featured-2');
  assert.equal(content.newInstanceId('atlas-navigation', doc), 'navigation-2');
  assert.equal(content.instanceLabel('featured', 'feature-hero'), 'Featured Game');
  assert.equal(content.instanceLabel('featured-2', 'feature-hero'), 'Featured Game 2');
  assert.equal(content.instanceLabel('tools', 'carousel'), 'Carousel (tools)');
});

// ── Schema ─────────────────────────────────────────────────────────────
test('content edits keep a schema-1 document schema 1; the first layout change makes it schema 2', async () => {
  const ws = await fresh();
  ws.setField('home.featured', 'title', 'Chess!');
  assert.equal(ws.working().schema, 1);
  ok2(await ws.save());
  assert.equal((await current()).draft.content.schema, 1);
  move(ws, 'lower', 'carousel', { col: 1, row: 3 });
  assert.equal(ws.working().schema, 2);
  assert.deepEqual(ws.unsavedCards(), [content.LAYOUT]);
  assert.equal(ws.cardStatus(content.LAYOUT), 'unsaved');
  ok2(await ws.save());
  const saved = (await current()).draft.content;
  assert.equal(saved.schema, 2);
  assert.equal(saved.regions[1].widgets[0].row, 3);
  assert.deepEqual(saved.components, { ...homeDoc().components, 'home.featured': { ...homeDoc().components['home.featured'], title: 'Chess!' } });
  assert.equal(ws.cardStatus(content.LAYOUT), 'draft');
});

test('a layout back at today’s homepage on a schema-1 base is schema 1 again (nothing unsaved)', async () => {
  const ws = await fresh();
  move(ws, 'lower', 'carousel', { col: 1, row: 4 });
  assert.equal(ws.working().schema, 2);
  move(ws, 'lower', 'carousel', { col: 1, row: 1 });
  assert.deepEqual(ws.working(), homeDoc());
  assert.deepEqual(ws.unsavedCards(), []);
  assert.ok(ws.undo() && ws.undo());
  assert.equal(ws.working().schema, 1);
  assert.equal(ws.canUndo(), false);
});

test('a server without 0014 refuses a layout with a clear reason; content alone still saves', async () => {
  const old = await createEnv({ extra: ['0013_site_sidebar'], without: ['none'] });
  const who = await old.createUser('admin@example.test', { admin: true });
  const ws = make({ who, e: old });
  ok2(await ws.load());
  ws.setField('home.featured', 'title', 'Edited');
  move(ws, 'lower', 'carousel', { col: 1, row: 2 });
  const r = await ws.save();
  assert.equal(r.error.code, 'layout');
  assert.match(r.error.message, /0014/);
  assert.equal(ws.working().schema, 2, 'the edits stay');
  assert.ok(ws.undo());
  ok2(await ws.save());
  assert.equal((await current(old, who)).draft.content.components['home.featured'].title, 'Edited');
});

// ── Instances ──────────────────────────────────────────────────────────
test('instances of one type are independent: position, size, content, saved cards', async () => {
  const ws = await fresh();
  const second = add(ws, 'upper', 'feature-hero');
  assert.equal(second, 'featured-2');
  ws.setField('home.featured-2', 'title', 'Second');
  assert.ok(ws.addCard('home.featured-2.saved', 'winter', { title: 'Winter', cta: 'Go', href: '/games/pong/' }));
  ws.addCard('home.featured.saved', 'summer', { title: 'Summer', cta: 'Go', href: '/games/pong/' });
  assert.ok(ws.activate('home.featured-2.saved.winter', 'second'));
  assert.equal(ws.component('home.featured-2').title, 'Winter');
  assert.equal(ws.component('home.featured-2.saved.second').title, 'Second');
  assert.equal(ws.component('home.featured').title, 'Chess Forge', 'the first one is untouched');
  assert.deepEqual(ws.order('home.featured.saved'), ['summer']);
  const before = at(ws, 'featured');
  move(ws, 'upper', second, { col: 5, row: 14 });
  assert.equal(at(ws, 'featured'), before);
  ok2(await ws.save());
  assert.deepEqual(ws.unsavedCards(), []);
});

test('two carousels have their own cards and order', async () => {
  const ws = await fresh();
  const id = add(ws, 'lower', 'carousel');
  const list = 'home.' + id;
  assert.deepEqual(ws.order(list), []);
  ws.addCard(list, 'pong', { title: 'Pong', category: 'Arcade', href: '/games/pong/' });
  ws.addCard(list, 'snake', { title: 'Snake', category: 'Arcade', href: '/games/snake/' });
  assert.ok(ws.moveCard(list + '.snake', 0));
  assert.deepEqual(ws.order(list), ['snake', 'pong']);
  assert.deepEqual(ws.order('home.carousel'), homeDoc().components['home.carousel'].order);
  assert.ok(ws.removeCard(list + '.pong'));
  assert.ok(ws.removeCard(list + '.snake'));
  assert.deepEqual(ws.component(list), { order: [] }, 'an empty carousel keeps its list');
  ok2(await ws.save());
});

test('removing a widget takes its own content only, and undo brings back exactly what it was', async () => {
  const doc = homeDoc();
  doc.components['home.featured.saved'] = { order: ['summer'] };
  doc.components['home.featured.saved.summer'] = { title: 'Summer', cta: 'Go', href: '/games/pong/' };
  const ws = await fresh(doc);
  ws.setField('home.featured', 'cta', 'Unsaved label');
  const before = clone(ws.working());
  assert.ok(remove(ws, 'upper', 'featured'));
  assert.equal(at(ws, 'featured'), null);
  assert.ok(!Object.keys(ws.working().components).some(k => k === 'home.featured' || k.startsWith('home.featured.')));
  assert.equal(ws.component('home.spotlight').title, 'Connect Four');
  assert.ok(validate(ws.working()), 'nothing is orphaned');
  assert.ok(ws.undo());
  assert.deepEqual(ws.working(), before, 'layout, card, saved cards and the unsaved edit');
  assert.ok(ws.redo());
  assert.equal(at(ws, 'featured'), null);
  ok2(await ws.save());
});

test('every widget can be removed: an empty page still saves', async () => {
  const ws = await fresh();
  for (const [r, id] of [['upper', 'featured'], ['upper', 'spotlight'], ['upper', 'navigation'], ['lower', 'carousel']]) assert.ok(remove(ws, r, id));
  assert.deepEqual(content.instancesOf(ws.working()), []);
  ok2(await ws.save());
  assert.equal(add(ws, 'upper', 'feature-hero'), 'featured-2', 'the published widget’s id is not taken by a new one');
  ok2(await ws.save());
  assert.equal(content.newInstanceId('feature-hero', ws.working()), 'featured', 'free where nothing has it');
});

test('a document the page couldn’t show is never kept', async () => {
  const ws = await fresh();
  const before = clone(ws.working());
  const overlapping = ws.region('upper');
  overlapping.widgets[1].row = 3;
  assert.equal(ws.setRegion(overlapping), false, 'overlap');
  const small = ws.region('upper'); small.widgets[0].cols = 3;
  assert.equal(ws.setRegion(small), false, 'below the minimum cells');
  assert.equal(ws.setRegion({ id: 'nowhere', widgets: [] }), false, 'unknown region');
  const moved = ws.region('lower'); moved.widgets.push({ id: 'featured', type: 'feature-hero', col: 1, row: 20, cols: 14, rows: 7 });
  assert.equal(ws.setRegion(moved), false, 'the same instance in two regions');
  for (let i = 0; i < 20; i++) add(ws, 'lower', 'atlas-navigation');
  assert.equal(content.instancesOf(ws.working()).length, 24);
  const region = ws.region('lower'), p = E.proposeAdd(region, { id: 'navigation-99', type: 'atlas-navigation' }, envOf(region));
  assert.equal(ws.addInstance(p.layout, 'navigation-99'), false, 'a 25th widget');
  for (let i = 0; i < 20; i++) ws.undo();
  assert.deepEqual(ws.working(), before);
});

// ── History ────────────────────────────────────────────────────────────
test('one history for layout and content, in the order things were done', async () => {
  const ws = await fresh();
  assert.equal(ws.canUndo(), false);
  ws.setField('home.featured', 'title', 'One');
  move(ws, 'lower', 'carousel', { col: 1, row: 2 });
  ws.setField('home.spotlight', 'title', 'Two');
  const id = add(ws, 'upper', 'feature-spotlight');
  assert.ok(ws.undo()); assert.equal(at(ws, id), null);
  assert.ok(ws.undo()); assert.equal(ws.component('home.spotlight').title, 'Connect Four');
  assert.ok(ws.undo()); assert.equal(at(ws, 'carousel'), '1,1,20,10'); assert.equal(ws.working().schema, 1);
  assert.ok(ws.undo()); assert.equal(ws.component('home.featured').title, 'Chess Forge');
  assert.equal(ws.undo(), false);
  assert.deepEqual(ws.unsavedCards(), []);
  while (ws.canRedo()) ws.redo();
  assert.equal(ws.component('home.spotlight').title, 'Two');
  assert.ok(at(ws, id));
  ws.undo();
  ws.setField('home.featured', 'title', 'New branch');
  assert.equal(ws.canRedo(), false, 'a new edit clears redo');
});

test('typing in one field is one step; other edits are their own', async () => {
  let t = 0;
  const ws = await fresh(homeDoc(), { now: () => t });
  for (const s of ['A', 'Ab', 'Abc']) { t += 200; ws.setField('home.featured', 'title', s); }
  t += 5000; ws.setField('home.featured', 'title', 'Abcd');
  t += 100; ws.setField('home.featured', 'cta', 'Go');
  t += 100; ws.setField('home.featured', 'art', { source: { static: '/images/featured/connect-four.webp' } });
  t += 100; ws.setField('home.featured', 'art', { source: { static: '/images/featured/chess-forge.webp' } });
  ws.undo(); assert.match(ws.component('home.featured').art.source.static, /connect-four/, 'each image change is a step');
  ws.undo(); ws.undo(); assert.equal(ws.component('home.featured').cta, 'Play Now');
  ws.undo(); assert.equal(ws.component('home.featured').title, 'Abc', 'a pause starts a new step');
  ws.undo(); assert.equal(ws.component('home.featured').title, 'Chess Forge');
  assert.equal(ws.canUndo(), false);
});

test('typing back to the start leaves nothing to undo', async () => {
  let t = 0;
  const ws = await fresh(homeDoc(), { now: () => t });
  for (const s of ['Chess Forge!', 'Chess Forge']) { t += 100; ws.setField('home.featured', 'title', s); }
  assert.equal(ws.canUndo(), false);
  assert.deepEqual(ws.unsavedCards(), []);
});

test('undo reaches back past a save, and what it changes is unsaved', async () => {
  const ws = await fresh();
  move(ws, 'lower', 'carousel', { col: 1, row: 5 });
  ok2(await ws.save());
  assert.deepEqual(ws.unsavedCards(), []);
  assert.ok(ws.undo());
  assert.deepEqual(ws.unsavedCards(), [content.LAYOUT]);
  ok2(await ws.save());
  assert.equal((await current()).draft.content.schema, 1);
});

test('layout edits survive a reload in the same tab; the history starts again', async () => {
  const storage = memoryStorage();
  const ws = await fresh(homeDoc(), { storage });
  const id = add(ws, 'upper', 'feature-spotlight');
  const again = make({ storage });
  ok2(await again.load());
  assert.ok(at(again, id));
  assert.equal(again.canUndo(), false);
  assert.ok(again.discardLayout());
  assert.deepEqual(again.working(), homeDoc());
  assert.ok(again.undo(), 'and that can be undone');
  assert.ok(at(again, id));
});

test('discarding the layout keeps content edits, drops new widgets, restores removed ones', async () => {
  const ws = await fresh();
  ws.setField('home.spotlight', 'title', 'Kept edit');
  remove(ws, 'upper', 'featured');
  const id = add(ws, 'lower', 'feature-hero');
  ws.setField('home.' + id, 'title', 'New one');
  assert.ok(ws.discardLayout());
  assert.equal(at(ws, 'featured'), '1,1,14,7');
  assert.equal(at(ws, id), null);
  assert.equal(ws.component('home.featured').title, 'Chess Forge', 'with its saved content');
  assert.equal(ws.component('home.spotlight').title, 'Kept edit');
  assert.ok(validate(ws.working()));
});

test('discarding a new widget’s card goes back to what it started with', async () => {
  const ws = await fresh();
  const id = add(ws, 'upper', 'feature-hero');
  ws.setField('home.' + id, 'title', 'Changed');
  ws.discardCard('home.' + id);
  assert.equal(ws.component('home.' + id).title, 'New featured card');
  assert.ok(at(ws, id), 'the widget stays');
  ws.discardCard('home.gone');
  assert.ok(validate(ws.working()));
});

// ── Conflicts ──────────────────────────────────────────────────────────
async function conflicting(mine, theirs, doc = homeDoc()) {
  const a = await fresh(doc), b = make({ who: admin2 });
  ok2(await b.load());
  theirs(b); ok2(await b.save());
  mine(a);
  const r = await a.save();
  assert.ok(r.conflict, 'a conflict: nothing was overwritten');
  return { a, b, info: r.conflict };
}

test('conflict: different widgets moved by two administrators are both kept', async () => {
  const { a, info } = await conflicting(
    ws => { move(ws, 'lower', 'carousel', { col: 1, row: 3 }); ws.setField('home.featured', 'title', 'Mine'); },
    ws => { add(ws, 'upper', 'feature-spotlight'); ws.setField('home.spotlight', 'title', 'Theirs'); });
  assert.deepEqual(info.overlap, [content.LAYOUT]);
  ok2(await a.combine(info));
  assert.equal(at(a, 'carousel'), '1,3,20,10');
  assert.ok(at(a, 'spotlight-2'), 'their new widget');
  assert.equal(a.component('home.featured').title, 'Mine');
  assert.equal(a.component('home.spotlight').title, 'Theirs');
  assert.ok(a.component('home.spotlight-2'));
  assert.equal((await current()).draft.content.regions[0].stack.length, 4);
});

test('conflict: layouts that don’t fit together change nothing anywhere', async () => {
  const { a, info } = await conflicting(
    ws => { add(ws, 'upper', 'feature-hero'); ws.setField('home.featured', 'title', 'Mine'); },
    ws => { add(ws, 'upper', 'feature-spotlight'); });                  // the same free place
  const before = clone(a.working()), server = await current();
  const r = await a.combine(info);
  assert.equal(r.error.code, 'layout');
  assert.deepEqual(a.working(), before, 'edits kept');
  assert.deepEqual(await current(), server, 'their draft kept');
  a.adopt(info);
  assert.ok(at(a, 'spotlight-2'));
  assert.equal(a.canUndo(), false);
});

test('conflict: two new widgets that happen to share an id are never merged into one', async () => {
  const { a, info } = await conflicting(
    ws => { add(ws, 'upper', 'feature-hero'); move(ws, 'upper', 'featured-2', { col: 1, row: 40 }); },
    ws => add(ws, 'upper', 'feature-hero'));
  assert.equal((await a.combine(info)).error.code, 'layout');
});

test('conflict: a widget they removed stays if it was edited here, and goes if not', async () => {
  const one = await conflicting(ws => ws.setField('home.spotlight', 'title', 'Mine'), ws => remove(ws, 'upper', 'spotlight'));
  ok2(await one.a.combine(one.info));
  assert.equal(at(one.a, 'spotlight'), '1,8,14,4');
  assert.equal(one.a.component('home.spotlight').title, 'Mine');
  const two = await conflicting(ws => ws.setField('home.featured', 'title', 'Mine'), ws => remove(ws, 'upper', 'spotlight'));
  ok2(await two.a.combine(two.info));
  assert.equal(at(two.a, 'spotlight'), null);
  assert.equal(two.a.component('home.featured').title, 'Mine');
});

test('conflict: a widget removed here stays removed, with nothing left behind', async () => {
  const { a, info } = await conflicting(ws => remove(ws, 'upper', 'spotlight'), ws => ws.setField('home.spotlight', 'title', 'Theirs'));
  ok2(await a.combine(info));
  assert.equal(at(a, 'spotlight'), null);
  assert.ok(!Object.keys(a.working().components).some(k => k.startsWith('home.spotlight')));
});

test('conflict: content edited here lands on their schema-2 draft', async () => {
  const { a, info } = await conflicting(ws => ws.setField('home.carousel.pong', 'title', 'Pong!'), ws => move(ws, 'lower', 'carousel', { col: 1, row: 4 }));
  assert.deepEqual(info.overlap, []);
  ok2(await a.combine(info));
  assert.equal(a.working().schema, 2);
  assert.equal(at(a, 'carousel'), '1,4,20,10');
  assert.equal(a.component('home.carousel.pong').title, 'Pong!');
});

// ── Draft → publish → rollback ─────────────────────────────────────────
test('a saved layout publishes, visitors get it without saved cards, and rollback returns to schema 1', async () => {
  const ws = await fresh();
  const v1 = (await current()).published.id;
  const id = add(ws, 'upper', 'feature-hero');
  ws.addCard('home.' + id + '.saved', 'later', { title: 'Later', cta: 'Go', href: '/games/pong/' });
  ok2(await ws.save());
  assert.equal(ok(await env.rpc(env.anon, 'get_published_content', 'home')).content.schema, 1, 'saving publishes nothing');
  const c = await current();
  const p = ok(await env.rpc(admin, 'publish', 'home', c.draft.id, c.published.id));
  ws.markPublished(p.version);
  assert.deepEqual(ws.unsavedCards(), []);
  assert.equal(ws.cardStatus(content.LAYOUT), 'published');
  const live = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.ok(live.content.components['home.' + id]);
  assert.ok(!Object.keys(live.content.components).some(k => k.includes('.saved')));
  assert.ok(validate(live.content), 'the public document is one the page shows');
  ok(await env.rpc(admin, 'rollback', 'home', v1, p.version));
  ok2(await ws.load());
  assert.equal(ws.working().schema, 1);
  assert.deepEqual(ws.working(), homeDoc());
  // Editing goes on from the rolled-back version.
  move(ws, 'lower', 'carousel', { col: 1, row: 2 });
  ok2(await ws.save());
});

test('the publish summary names layout changes, per widget', async () => {
  const ws = await fresh();
  const before = clone(ws.working());
  const region = ws.region('upper');
  ws.setRegion(E.proposeResize(region, 'navigation', 'bottom', { bottom: 14 }, envOf(region)).layout);
  add(ws, 'upper', 'feature-spotlight');
  move(ws, 'lower', 'carousel', { col: 1, row: 2 });
  ws.setField('home.spotlight-2', 'title', 'Second');
  const s = publish.summarize(before, ws.working(), content);
  assert.deepEqual(s.layout.map(c => `${c.label}: ${c.changes.join('; ')}`), [
    'Atlas Navigation: Resized (6 × 11 to 6 × 13)', 'Spotlight 2: Added to the upper area', 'Carousel: Moved'
  ]);
  assert.deepEqual(s.cards.map(c => [c.typeLabel, c.title, c.changes.join()]), [['Spotlight card, Spotlight 2', 'Second', 'Added']]);
  assert.equal(s.empty, false);
  const back = publish.summarize(ws.working(), before, content);
  assert.ok(back.layout.some(c => c.label === 'Spotlight 2' && c.changes[0] === 'Removed'));
  // Schema alone is no change.
  assert.equal(publish.summarize(before, content.upgradeDocument(before), content).empty, true);
});
