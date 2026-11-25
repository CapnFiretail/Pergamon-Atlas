// Converting the homepage's cards to references to game records
// (scripts/cms/convert.js), through the workspace and the emulated Supabase with 0016:
// what differs is reported, what isn't is kept, nothing but the chosen cards changes,
// the model visitors are drawn from is the same, legacy documents and history go on
// working, and a converted page stays schema 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, homeDoc } from './supabase-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const V1 = p => require(path.join(ROOT, 'PergamonAtlas.V1/scripts', p));
const content = V1('cms/content.js'), library = V1('cms/library.js'), editing = V1('cms/library-editing.js'), convert = V1('cms/convert.js'), workspace = V1('cms/workspace.js'), publish = V1('cms/publish.js'), images = V1('cms/images.js'), E = V1('grid/editor.js'), TYPES = V1('grid/widget-types.js').types, G = V1('grid/atlas-grid.js');
const clone = o => structuredClone(o);
const CATEGORY = { battleship: 'Strategy', breakout: 'Arcade', pong: 'Arcade', blackjack: 'Card', 'connect-four': 'Strategy', snake: 'Arcade', 'chess-forge': 'Strategy', 'tic-tac-toe': 'Classic' };
const NAME = id => id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(id === 'tic-tac-toe' ? '-' : ' ');
const ids = Object.keys(CATEGORY);
const record = (id, o = {}) => Object.assign({ id, name: NAME(id), category: CATEGORY[id], destination: `/games/${id}/`, availability: id === 'tic-tac-toe' ? 'coming-soon' : 'available', art: { source: { static: `/images/featured/${id}-card.webp` }, alt: '' } }, o);
const records = (o = {}) => Object.fromEntries(ids.map(id => [id, record(id, o[id])]));
const LIVE = ids.filter(id => id !== 'tic-tac-toe').map(id => `/games/${id}/`);
const env = (recs, choices) => ({ content, records: recs, live: LIVE, choices });
const plan = (doc, recs) => convert.plan(doc, env(recs));
const by = (cards, id) => cards.find(c => c.id === id);
// A homepage whose list cards have the records' own pictures, framed here and there.
function pictured() {
  const d = homeDoc();
  Object.keys(d.components).filter(k => k.startsWith('home.carousel.')).forEach(k => { d.components[k].art = { source: { static: `/images/featured/${k.slice(14)}-card.webp` }, alt: '' }; });
  Object.assign(d.components['home.carousel.snake'].art, { focus: { x: 20, y: 30 }, scale: 1.4, focusNarrow: { x: 1, y: 2 } });
  return d;
}
// The records whose wide pictures are the homepage's, framed as there (or otherwise).
const matching = (o = {}) => records(Object.assign({ 'chess-forge': { wide: { source: { static: '/images/featured/chess-forge.webp' }, alt: '', focus: { x: 1, y: 1 } } }, 'connect-four': { wide: clone(homeDoc().components['home.spotlight'].art) } }, o));
const look = (doc, recs) => { const m = content.toModel(doc, { games: recs }); return JSON.parse(JSON.stringify(m, (k, v) => (k === 'game' ? undefined : v))); };
const everything = (doc, recs, what = 'convert') => Object.fromEntries(plan(doc, recs).map(c => [c.id, what]));

test('the same pictures: nothing differs, and the page is drawn the same', () => {
  const doc = pictured(), recs = matching(), cards = plan(doc, recs);
  assert.deepEqual(cards.map(c => c.id), ['home.featured', 'home.spotlight'].concat(doc.components['home.carousel'].order.map(k => 'home.carousel.' + k)), 'in the page’s order');
  assert.ok(cards.every(c => c.game && !c.differences.length && c.picture === 'same' && convert.suggested(c) === 'convert'), JSON.stringify(cards.filter(c => c.differences.length)));
  const r = convert.apply(doc, env(recs, everything(doc, recs)));
  assert.deepEqual([r.converted, r.kept, r.artwork], [8, 0, {}]);
  assert.deepEqual(look(r.doc, recs), look(doc, recs), 'order, names, links, categories, button labels, pictures and every framing');
  assert.equal(r.doc.schema, 2);
  assert.deepEqual(r.doc.regions, content.builtInRegions());
  assert.deepEqual(Object.keys(r.doc.components).sort(), Object.keys(doc.components).sort(), 'the same ids');
  assert.deepEqual(r.doc.components['home.carousel'], doc.components['home.carousel']);
  assert.deepEqual(r.doc.components['home.featured'], { game: 'chess-forge', cta: 'Play Now', style: { rules: true }, crop: { focus: { x: 78, y: 5 }, focusNarrow: { x: 88, y: 12 } } });
  assert.deepEqual(r.doc.components['home.spotlight'], { game: 'connect-four', cta: 'Play Now', style: { rules: true } }, 'framed as the record frames it: no crop of its own');
  assert.deepEqual(r.doc.components['home.carousel.snake'], { game: 'snake', crop: { focus: { x: 20, y: 30 }, scale: 1.4, focusNarrow: { x: 1, y: 2 } } });
  assert.deepEqual(r.doc.components['home.carousel.pong'], { game: 'pong' });
  assert.ok(content.validateDocument(r.doc));
  assert.deepEqual(doc, pictured(), 'the document given is untouched');
  assert.deepEqual(plan(r.doc, recs), [], 'nothing left to convert');
});

test('every difference is reported, with what it is now and what it would be', () => {
  const doc = pictured(), c = doc.components;
  c['home.featured'].title = 'Chess Forge!';
  c['home.carousel.pong'].category = 'Classic';
  c['home.carousel.battleship'].description = 'Sink them.';
  c['home.carousel.breakout'].art.alt = 'Bricks';
  delete c['home.carousel.blackjack'].art;
  c['home.carousel.snake'].art = { source: { media: '00000001-0000-4000-8000-000000000000' }, alt: '' };
  c['home.carousel'].order.push('ttt'); c['home.carousel.ttt'] = { title: 'Tic-Tac-Toe', category: 'Classic', href: '/games/tic-tac-toe/', art: { source: { static: '/images/featured/tic-tac-toe-card.webp' }, alt: '' } };
  c['home.spotlight'].href = '/updates/';
  const recs = matching({ 'connect-four': { availability: 'hidden' } });
  const cards = plan(doc, recs), say = id => by(cards, id).differences.map(d => `${d.what}: ${d.before} → ${d.after}`);
  assert.deepEqual(say('home.featured'), ['Name: Chess Forge! → Chess Forge']);
  assert.deepEqual(say('home.carousel.pong'), ['Category: Classic → Arcade']);
  assert.deepEqual(say('home.carousel.battleship'), ['Description: Sink them. → none']);
  assert.deepEqual(say('home.carousel.breakout'), ['Image description: Bricks → none']);
  assert.deepEqual(say('home.carousel.blackjack'), ['Picture: none → the game’s']);
  assert.deepEqual(say('home.carousel.snake'), ['Picture: this card’s → the game’s']);
  assert.deepEqual(say('home.carousel.ttt'), [], 'coming soon: not shown in the carousel before, nor after');
  assert.deepEqual(say('home.carousel.connect-four'), ['Shown to visitors: yes → no (hidden)']);
  assert.deepEqual([by(cards, 'home.spotlight').game, convert.offers(by(cards, 'home.spotlight'))], [null, ['keep']]);
  cards.filter(x => x.differences.length).forEach(x => assert.equal(convert.suggested(x), 'keep', x.id));
  // As suggested: what differs is kept exactly as it was.
  const r = convert.apply(doc, env(recs, Object.fromEntries(cards.map(x => [x.id, convert.suggested(x)]))));
  cards.filter(x => x.differences.length || !x.game).forEach(x => assert.deepEqual(r.doc.components[x.id], doc.components[x.id], x.id));
  assert.deepEqual([r.converted, r.doc.components['home.carousel.ttt']], [1, { game: 'tic-tac-toe' }]);
  assert.ok(!content.toModel(doc, { games: recs }).carousel.some(x => x.game === 'tic-tac-toe') && !content.toModel(r.doc, { games: recs }).carousel.some(x => x.game === 'tic-tac-toe'));
  // Asked for, it is done; a link to no game and unknown choices never are.
  const all = convert.apply(doc, env(recs, Object.assign(everything(doc, recs), { 'home.carousel.pong': 'nonsense' })));
  assert.deepEqual([all.doc.components['home.spotlight'], all.doc.components['home.carousel.pong']], [doc.components['home.spotlight'], doc.components['home.carousel.pong']]);
  assert.deepEqual(all.doc.components['home.carousel.snake'], { game: 'snake' }, 'a framing made for another picture doesn’t come along');
});

test('a card’s picture in the Game Library: only when chosen, and then nothing on the card changes', () => {
  const doc = pictured(), c = doc.components, recs = records();
  c['home.carousel.snake'].art = { source: { media: '00000001-0000-4000-8000-000000000000' }, alt: 'S', focus: { x: 9, y: 9 } };
  let cards = plan(doc, recs);
  assert.deepEqual([by(cards, 'home.featured').picture, by(cards, 'home.featured').fills, convert.suggested(by(cards, 'home.featured'))], ['other', true, 'picture'], 'the game has no wide picture: there is room for this one');
  assert.deepEqual([by(cards, 'home.carousel.snake').fills, convert.suggested(by(cards, 'home.carousel.snake')), convert.offers(by(cards, 'home.carousel.snake'))], [false, 'keep', ['keep', 'convert', 'picture']], 'replacing a picture is never suggested');
  const choices = Object.fromEntries(cards.map(x => [x.id, convert.offers(x).includes('picture') ? 'picture' : 'convert']));
  const r = convert.apply(doc, env(recs, choices));
  assert.deepEqual(r.artwork, { 'chess-forge': { wide: c['home.featured'].art }, 'connect-four': { wide: c['home.spotlight'].art }, snake: { art: c['home.carousel.snake'].art } });
  const after = Object.fromEntries(ids.map(id => [id, Object.assign({}, recs[id], r.artwork[id])]));
  assert.deepEqual(look(r.doc, after), look(doc, recs), 'with the library’s changes, the page is the same');
  ['home.featured', 'home.spotlight', 'home.carousel.snake'].forEach(k => assert.equal(r.doc.components[k].crop, undefined, k + ': framed by the record'));
  Object.values(after).forEach(g => { const s = Object.assign({}, g); delete s.id; assert.ok(library.validRecord(s), g.id); });
  // Two cards, one game: the same picture is one, with each card's framing; different ones are asked about.
  const two = clone(doc), k = 'home.featured.saved';
  two.components[k] = { order: ['again'] }; two.components[k + '.again'] = Object.assign(clone(c['home.featured']), { art: { source: c['home.featured'].art.source, alt: '', focus: { x: 3, y: 3 } } });
  cards = plan(two, recs);
  assert.ok(by(cards, k + '.again').saved);
  const s = convert.apply(two, env(recs, Object.fromEntries(cards.map(x => [x.id, 'picture']))));
  assert.deepEqual([s.artwork['chess-forge'].wide, s.doc.components[k + '.again'].crop], [c['home.featured'].art, { focus: { x: 3, y: 3 } }]);
  two.components[k + '.again'].art.source = { static: '/images/featured/other.webp' };
  assert.match(convert.apply(two, env(recs, Object.fromEntries(cards.map(x => [x.id, 'picture'])))).problem, /Two cards would give “Chess Forge” different pictures/);
  // A list card without a picture, a game without one.
  const none = pictured(); delete none.components['home.carousel.pong'].art;
  const bare = matching({ pong: { art: null }, snake: { art: null } });
  assert.deepEqual([by(plan(none, bare), 'home.carousel.pong').picture, by(plan(none, bare), 'home.carousel.snake').picture, convert.suggested(by(plan(none, bare), 'home.carousel.snake'))], ['none', 'lost', 'picture']);
});

test('only game cards of the page: Site Navigation, headings, layout and other links stay', () => {
  const d = clone(content.upgradeDocument(pictured()));
  d.components['site.sidebar'] = { sections: [{ items: [{ id: 'home', label: 'Start', icon: 'home', href: '/', visible: true }] }] };
  d.regions[1].widgets.push({ id: 'heading', type: 'page-heading', col: 1, row: 12, cols: 20, rows: 5 }); d.components['home.heading'] = { title: 'Hi', emblem: 'none', count: 'none' };
  d.regions[1].widgets[0].rows = 11;
  const recs = matching(), r = convert.apply(d, env(recs, everything(d, recs)));
  assert.deepEqual([r.doc.regions, r.doc.components['site.sidebar'], r.doc.components['home.heading']], [d.regions, d.components['site.sidebar'], d.components['home.heading']]);
  assert.equal(r.converted, 8);
  assert.deepEqual(convert.plan({ schema: 9 }, env(recs)), []);
  assert.deepEqual(convert.plan(null, env(recs)), []);
});

test('coming soon: in the catalog, not in a carousel; its own record decides', () => {
  const recs = matching({ snake: { availability: 'coming-soon' }, pong: { availability: 'coming-soon', unpublished: true } });
  const doc = convert.apply(pictured(), env(matching(), everything(pictured(), matching()))).doc;
  const shown = editingOn => content.toModel(doc, { games: recs, editing: editingOn }).carousel.map(c => [c.game, c.note]);
  assert.deepEqual(shown(false), ['battleship', 'breakout', 'blackjack', 'connect-four'].map(g => [g, undefined]));
  assert.deepEqual(shown(true), [['battleship', undefined], ['breakout', undefined], ['pong', 'coming-soon'], ['blackjack', undefined], ['connect-four', undefined], ['snake', 'coming-soon']], 'administrators see it in its place, marked');
  const games = content.forPage('games');
  const grid = { schema: 2, regions: [{ id: 'main', widgets: [{ id: 'grid', type: 'card-grid', col: 1, row: 1, cols: 20, rows: 7 }] }], components: { 'games.grid': { order: ['snake'] }, 'games.grid.snake': { game: 'snake' } } };
  assert.deepEqual(games.toModel(grid, { games: recs }).instances.grid.cards.map(c => [c.game, c.note]), [['snake', undefined]], 'the Game Catalog shows it');
  // A Featured card is no list of games to play: it shows what was chosen, as before.
  const f = { schema: 2, regions: [{ id: 'main', widgets: [{ id: 'w', type: 'feature-hero', col: 1, row: 1, cols: 20, rows: 11 }] }], components: { 'games.w': { game: 'snake', cta: 'Soon' } } };
  assert.equal(games.toModel(f, { games: recs }).instances.w.card.title, 'Snake');
  // A game shown today whose record says coming soon is said to leave.
  assert.deepEqual(by(plan(pictured(), recs), 'home.carousel.snake').differences, [{ what: 'Shown to visitors', before: 'yes', after: 'no (coming soon)' }]);
  assert.equal(convert.suggested(by(plan(pictured(), recs), 'home.carousel.snake')), 'keep');
  const before = editing.empty(), put = (d, a) => { d.components['library.games'].order = ['snake']; const g = record('snake', { availability: a }); delete g.id; d.components[library.keyOf('snake')] = g; return d; };
  put(before, 'available');
  assert.deepEqual(editing.postponed(before, put(editing.empty(), 'coming-soon')), [{ id: 'snake', name: 'Snake' }]);
  assert.deepEqual(editing.postponed(null, before), []);
});

// ── Through the workspace and the database ──────────────────────────────────
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
const ok2 = r => { assert.ok(r && r.ok, JSON.stringify(r)); return r; };
const validate = doc => (doc && doc.schema === 2 ? content.validatePageDocument(doc, { grid: { validatePage: G.validatePage, types: TYPES } }) : content.validateDocument(doc));
async function world() {
  const e = await createEnv({ extra: ['0013_site_sidebar', '0014_page_layout', '0015_studio_documents', '0016_game_library'] });
  const a = await e.createUser('a@example.test', { admin: true });
  const put = async (page, doc) => { const d = ok(await e.rpc(a, 'get_draft', page)); const s = ok(await e.rpc(a, 'save_draft', page, doc, d.draft ? d.draft.id : null, null)); return ok(await e.rpc(a, 'publish', page, s.draft_id, d.published ? d.published.id : null)); };
  const libraryDoc = recs => { const d = editing.empty(); ids.forEach(id => { const g = clone(recs[id]); delete g.id; d.components['library.games'].order.push(id); d.components[library.keyOf(id)] = g; }); return d; };
  const see = async () => { const p = ok(await e.rpc(e.anon, 'get_published_content', 'home')); const got = library.received(p.library, content.gameRefs(p.content)); assert.ok(got && content.validateDocument(p.content, { delivered: true })); return { p, model: look(p.content, got.games), games: got.games }; };
  const open = async () => {
    const ws = workspace.create({ page: 'home', content, validate, fallbackDoc: homeDoc(), createHistory: E.createHistory, starter: t => content.starterContent(t, { path: '/games/snake/' }), api: { getDraft: p => e.rpc(a, 'get_draft', p), saveDraft: (p, doc, x) => e.rpc(a, 'save_draft', p, doc, x, null) } });
    ok2(await ws.load()); return ws;
  };
  return { e, a, put, libraryDoc, see, open };
}

test('reviewed unsaved, one step to undo, saved, published; visitors see the same page', async () => {
  const { e, a, put, libraryDoc, see, open } = await world(), recs = matching();
  await put('home', pictured()); await put('library', libraryDoc(recs));
  const before = await see(), ws = await open();
  const r = convert.apply(ws.working(), env(recs, everything(ws.working(), recs)));
  assert.ok(ws.setDocument(r.doc));
  assert.equal(ok(await e.rpc(a, 'get_draft', 'home')).draft, null, 'nothing is saved by it');
  assert.ok(ws.unsavedCards().length === 8 && !ws.unsavedCards().includes(content.LAYOUT), 'eight cards, no layout change');
  ws.undo(); assert.deepEqual(ws.working(), pictured()); ws.redo();
  ws.discardCard('home.carousel.snake');
  assert.equal(ws.component('home.carousel.snake').title, 'Snake', 'one card can be taken back'); ws.undo();
  // Review: each card, and that nothing else of it changes.
  const s = publish.summarize(pictured(), ws.working(), content, images, recs);
  assert.equal(s.cards.length, 8);
  s.cards.forEach(x => assert.deepEqual(x.changes, ['Now uses the Game Library'], x.id));
  assert.deepEqual([s.other, s.layout], [[], []]);
  ok2(await ws.save());
  const d = ok(await e.rpc(a, 'get_draft', 'home'));
  assert.equal(d.draft.content.schema, 2);
  ok(await e.rpc(a, 'publish', 'home', d.draft.id, d.published.id));
  const after = await see();
  assert.deepEqual(after.model, before.model, 'what visitors are drawn is the same');
  assert.deepEqual(Object.keys(after.games).sort(), ids.filter(id => id !== 'tic-tac-toe').sort());
  // A change in the library reaches it, and the Games page with the same record.
  await put('library', libraryDoc(matching({ snake: { name: 'Python', art: { source: { static: '/images/featured/pong-card.webp' }, alt: '' } } })));
  const games = content.forPage('games');
  const gdoc = { schema: 2, regions: [{ id: 'main', frame: 'sidebar', rowHeight: 23.43, widgets: [{ id: 'grid', type: 'card-grid', col: 1, row: 1, cols: 20, rows: 7 }] }], components: { 'games.grid': { order: ['snake'] }, 'games.grid.snake': { game: 'snake' } } };
  await put('games', gdoc);
  const gp = ok(await e.rpc(e.anon, 'get_published_content', 'games')), gm = games.toModel(gp.content, { games: library.received(gp.library, ['snake']).games });
  const here = (await see()).model.carousel.find(c => c.id === 'home.carousel.snake');
  assert.deepEqual([here.title, gm.instances.grid.cards[0].title, here.art.src, gm.instances.grid.cards[0].art.src], ['Python', 'Python', '/images/featured/pong-card.webp', '/images/featured/pong-card.webp']);
  assert.deepEqual([here.art.focus, gm.instances.grid.cards[0].art.focus], ['20% 30%', undefined], 'the homepage keeps its own framing');
  // Hidden: gone from the carousel; Featured keeps its place, empty.
  await put('library', libraryDoc(matching({ snake: { availability: 'hidden' }, 'chess-forge': { availability: 'archived' } })));
  const less = await see();
  assert.deepEqual([less.model.carousel.length, less.model.featured, less.p.content.components['home.featured']], [5, null, { game: null }]);
  // History: the version before comes back whole, the library isn't touched, and back again.
  const lib = ok(await e.rpc(a, 'get_draft', 'library')).published.id;
  const list = ok(await e.rpc(a, 'list_published_versions', 'home', 20)), old = list.find(v => v.content.schema === 1);
  ok(await e.rpc(a, 'rollback', 'home', old.id, list.find(v => v.status === 'published').id));
  const back = await see();
  assert.deepEqual([back.model, back.p.library, back.p.content.schema], [before.model, undefined, 1]);
  assert.equal(ok(await e.rpc(a, 'get_draft', 'library')).published.id, lib);
  const now = ok(await e.rpc(a, 'list_published_versions', 'home', 20));
  ok(await e.rpc(a, 'rollback', 'home', now.find(v => v.content.schema === 2).id, now.find(v => v.status === 'published').id));
  assert.equal((await see()).model.carousel.length, 5);
  const said = publish.summarize(now.find(v => v.content.schema === 2).content, pictured(), content, images, recs);
  assert.ok(said.cards.every(x => x.changes[0] === 'Now has its own details'));
});

test('a converted page stays schema 2, and its new cards refer to games', async () => {
  const { put, libraryDoc, open } = await world(), recs = matching();
  await put('home', pictured()); await put('library', libraryDoc(recs));
  const ws = await open();
  assert.ok(!content.refers(ws.working()));
  ws.setDocument(convert.apply(ws.working(), env(recs, everything(ws.working(), recs))).doc);
  assert.ok(content.refers(ws.working()));
  // A layout change taken back: still schema 2 (schema 1 can't hold references).
  const region = ws.region('lower'); region.widgets[0].rows += 1;
  assert.ok(ws.setRegion(region)); region.widgets[0].rows -= 1; assert.ok(ws.setRegion(region));
  assert.equal(ws.working().schema, 2); ok2(await ws.save());
  assert.ok(ws.discardLayout()); assert.equal(ws.working().schema, 2);
  // Unconverted, it goes back to schema 1 as before.
  const plain = await open(); plain.discardAll();
  const { open: open2, put: put2 } = await world(); await put2('home', pictured());
  const w2 = await open2(), r2 = w2.region('lower'); r2.widgets[0].rows += 1; w2.setRegion(r2); r2.widgets[0].rows -= 1; w2.setRegion(r2);
  assert.equal(w2.working().schema, 1);
});

test('two administrators: a conversion combines with another’s edit, keeping both', async () => {
  const { e, a, put, libraryDoc, open } = await world(), recs = matching();
  await put('home', pictured()); await put('library', libraryDoc(recs));
  const mine = await open(), theirs = await open();
  const choices = everything(mine.working(), recs); choices['home.spotlight'] = 'keep';
  mine.setDocument(convert.apply(mine.working(), env(recs, choices)).doc);
  theirs.setField('home.spotlight', 'cta', 'Try it'); ok2(await theirs.save());
  const r = await mine.save();
  assert.deepEqual(r.conflict.overlap, []);
  ok2(await mine.combine(r.conflict));
  const d = ok(await e.rpc(a, 'get_draft', 'home')).draft.content;
  assert.deepEqual([d.schema, d.components['home.spotlight'].cta, d.components['home.featured'].game, d.components['home.spotlight'].title], [2, 'Try it', 'chess-forge', 'Connect Four'], 'references and own details, side by side');
  // Without its games in the library, it can't be saved, and nothing is lost.
  const bare = await world(); await bare.put('home', pictured());
  const ws = await bare.open(); ws.setDocument(convert.apply(ws.working(), env(recs, everything(ws.working(), recs))).doc);
  const no = await ws.save();
  assert.equal(no.error.code, 'games'); assert.equal(ws.unsavedCards().length, 8);
});
