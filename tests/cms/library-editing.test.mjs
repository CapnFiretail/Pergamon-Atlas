// The Game Library and cards that refer to its games, as the browser has them
// (scripts/cms/library.js, library-editing.js, content.js, workspace.js, publish.js),
// against the emulated Supabase with 0016: what one accepts the other does, drafts and
// conflicts of the library, references in a page's draft, what visitors receive.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv } from './supabase-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const V1 = p => require(path.join(ROOT, 'PergamonAtlas.V1/scripts', p));
const content = V1('cms/content.js'), library = V1('cms/library.js'), editing = V1('cms/library-editing.js'), workspace = V1('cms/workspace.js'), publish = V1('cms/publish.js'), images = V1('cms/images.js'), E = V1('grid/editor.js');
const games = content.forPage('games');
const clone = o => structuredClone(o);
const EXTRA = ['0013_site_sidebar', '0014_page_layout', '0015_studio_documents', '0016_game_library'];
const box = { window: { PergamonCMS: { pages: V1('cms/pages.js') } } };
['entries', 'games-content'].forEach(f => vm.runInNewContext(readFileSync(path.join(ROOT, `PergamonAtlas.V1/data/${f}.js`), 'utf8'), box));
const plain = v => JSON.parse(JSON.stringify(v));
const BUILT_IN = plain(box.window.PergamonGameLibrary), GAMES_DOC = plain(box.window.PergamonGamesContent.document);

let env, admin, admin2;
before(async () => {
  env = await createEnv({ extra: EXTRA });
  admin = await env.createUser('a@example.test', { admin: true });
  admin2 = await env.createUser('b@example.test', { admin: true });
});
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
async function fresh() { const e = await createEnv({ extra: EXTRA }); return { e, a: await e.createUser('a@example.test', { admin: true }), b: await e.createUser('b@example.test', { admin: true }) }; }
const api = (e, who) => ({ getDraft: p => e.rpc(who, 'get_draft', p), saveDraft: (p, doc, expected) => e.rpc(who, 'save_draft', p, doc, expected, null) });
function libraryOf(e, who) {
  return workspace.create({ page: 'library', validate: library.validateDocument, fallbackDoc: editing.empty(), lists: [library.LIST], createHistory: E.createHistory, api: api(e, who) });
}
function pageOf(e, who) {
  return workspace.create({ page: 'games', content: games, validate: games.validateDocument, fallbackDoc: GAMES_DOC, createHistory: E.createHistory, starter: t => games.starterContent(t), api: api(e, who) });
}
const publishIt = async (e, who, page) => { const d = ok(await e.rpc(who, 'get_draft', page)); return e.rpc(who, 'publish', page, d.draft.id, d.published ? d.published.id : null); };
const server = async (page, doc, e = env) => e.as(e.superuser, async tx => (await tx.query('select public.validate_content($1, $2) as v', [page, JSON.stringify(doc)])).rows[0].v);
const key = library.keyOf;

test('the first library: the built-in records, with what the stored overrides say; the server accepts it', async () => {
  const doc = editing.firstLibrary(BUILT_IN, [{ path: '/games/pong', visibility: 'admin' }, { path: '/games/tic-tac-toe/', visibility: 'public' }, { path: '/somewhere', visibility: 'admin' }]);
  assert.ok(library.validateDocument(doc));
  ok(await server('library', doc));
  assert.deepEqual(library.order(doc), BUILT_IN.order);
  const r = library.records(doc);
  assert.deepEqual([r.pong.availability, r['tic-tac-toe'].availability, r.snake.availability], ['hidden', 'coming-soon', 'available']);
  assert.equal(r['chess-forge'].description, BUILT_IN.games['chess-forge'].description);
  assert.deepEqual(r.snake, BUILT_IN.games.snake, 'the same record, id and all');
  const back = editing.firstLibrary({ order: ['snake', 'gone'], games: { snake: Object.assign({}, BUILT_IN.games.snake, { availability: 'hidden' }) } }, [{ path: '/games/snake', visibility: 'public' }]);
  assert.equal(library.records(back).snake.availability, 'available');
  assert.ok(library.validateDocument(editing.firstLibrary(BUILT_IN, null)));
});

test('a library document: the browser refuses what the server refuses', async () => {
  const good = editing.firstLibrary(BUILT_IN, []);
  const bad = [
    d => { d.schema = 2; }, d => { d.extra = 1; }, d => { d.components[library.LIST].order.push('snake'); }, d => { d.components[library.LIST].order.push('ghost'); }, d => { d.components[library.LIST].order.pop(); }, d => { delete d.components[library.LIST]; },
    d => { d.components['home.featured'] = {}; }, d => { d.components[key('snake')].name = ''; }, d => { d.components[key('snake')].name = 'x'.repeat(41); }, d => { d.components[key('snake')].name = '<b>'; }, d => { d.components[key('snake')].category = 'Casino'; },
    d => { d.components[key('snake')].availability = 'public'; }, d => { d.components[key('snake')].destination = 'https://x.test/'; }, d => { d.components[key('snake')].destination = '/games/'; }, d => { d.components[key('snake')].destination = '/games/pong/'; },
    d => { d.components[key('snake')].description = ''; }, d => { d.components[key('snake')].description = 'x'.repeat(161); }, d => { d.components[key('snake')].price = 1; }, d => { d.components[key('snake')].art = { source: { static: 'https://x/y.webp' } }; }, d => { d.components[key('snake')].wide = { alt: 'x' }; }
  ];
  for (const change of bad) { const d = clone(good); change(d); assert.ok(!library.validateDocument(d), change.toString()); assert.equal((await server('library', d)).error.code, 'PT422', change.toString()); }
  for (const d of [null, [], 'x', {}]) assert.ok(!library.validateDocument(d));
  const many = editing.empty(); for (let i = 0; i < 65; i++) { many.components[library.LIST].order.push('g' + i); many.components[key('g' + i)] = { name: 'G', category: 'Card', destination: `/games/g${i}/`, availability: 'hidden' }; }
  assert.ok(!library.validateDocument(many));
});

test('references: what each kind of card may hold, in the browser and on the server', async () => {
  const doc = (type, c) => ({ schema: 2, regions: [{ id: 'main', widgets: [{ id: 'w', type, col: 1, row: 1, cols: 20, rows: 11 }] }], components: type === 'card-grid' || type === 'carousel' ? { 'games.w': { order: ['x'] }, 'games.w.x': c } : { 'games.w': c } });
  const both = async (type, c, expected) => { const d = doc(type, c); assert.equal(games.validateDocument(d), expected, `${type} ${JSON.stringify(c)}`); assert.equal(!(await server('games', d)).error, expected, `server ${type} ${JSON.stringify(c)}`); };
  const own = { title: 'Snake', category: 'Arcade', href: '/games/snake/' }, ownFeature = { title: 'Snake', cta: 'Play', href: '/games/snake/' };
  for (const type of ['card-grid', 'carousel']) {
    for (const c of [{ game: 'snake' }, { game: 'snake', crop: {} }, { game: 'snake', crop: { focus: { x: 1, y: 2 }, scale: 2 } }]) await both(type, c, true);
    for (const c of [{ game: null }, { game: '' }, { game: 'A' }, { game: 1 }, { game: 'snake', title: 'x' }, { game: 'snake', crop: { source: { static: '/images/featured/x.webp' } } }, { game: 'snake', crop: null }, { game: 'snake', crop: [] }, {}, null]) await both(type, c, false);
  }
  await both('card-grid', own, false);
  await both('carousel', own, true);
  for (const type of ['feature-hero', 'feature-spotlight']) {
    for (const c of [{ game: 'snake', cta: 'Play' }, { game: 'snake', cta: 'Play', crop: { fit: 'height', base: '#aabbcc' } }, ownFeature]) await both(type, c, true);
    for (const c of [{ game: 'snake' }, { game: null }, { game: 'snake', cta: 'Play', href: '/games/' }, { game: 'snake', cta: '' }]) await both(type, c, false);
  }
  // As visitors receive it, a card widget may have lost its game; a list's card never arrives without one.
  assert.ok(games.validateDocument(doc('feature-hero', { game: null }), { delivered: true }));
  assert.ok(!games.validateDocument(doc('feature-hero', { game: null, cta: 'x' }), { delivered: true }));
  assert.ok(!games.validateDocument(doc('card-grid', { game: null }), { delivered: true }));
});

test('what a card shows: the record, its own framing, and why visitors don’t see it', () => {
  const art = { source: { static: '/images/featured/snake-card.webp' }, alt: 'Snake', focus: { x: 10, y: 20 }, scale: 2, focusNarrow: { x: 1, y: 1 } };
  const wide = { source: { static: '/images/featured/snake.webp' }, alt: 'Wide' };
  const records = { snake: { id: 'snake', name: 'Snake', category: 'Arcade', destination: '/games/snake/', availability: 'available', art, wide }, pong: { id: 'pong', name: 'Pong', category: 'Arcade', destination: '/games/pong/', availability: 'hidden' }, chess: { id: 'chess', name: 'Chess', category: 'Strategy', destination: '/games/chess/', availability: 'coming-soon', unpublished: true } };
  const shown = (c, type = 'tile') => games.shownCard(c, type, records);
  assert.deepEqual(shown({ game: 'snake' }).art, art);
  assert.deepEqual(shown({ game: 'snake', crop: { focus: { x: 90, y: 90 } } }).art, { source: art.source, alt: 'Snake', focus: { x: 90, y: 90 } }, 'a crop replaces the framing as a whole, never the picture');
  assert.deepEqual(shown({ game: 'snake' }, 'feature').art, wide);
  assert.equal(shown({ game: 'pong' }).note, 'hidden');
  assert.equal(shown({ game: 'chess' }).note, 'unpublished');
  assert.deepEqual([shown({ game: 'gone' }).note, shown({ game: 'gone' }).category], ['missing', 'gone']);
  assert.equal(shown({ game: 'constructor' }).note, 'missing');
  assert.deepEqual(shown({ title: 'Own', href: '/games/' }), { title: 'Own', href: '/games/' });
  const doc = clone(GAMES_DOC); doc.components['games.grid'].order = ['snake', 'pong', 'chess', 'gone'];
  Object.keys(doc.components).filter(k => k.startsWith('games.grid.')).forEach(k => delete doc.components[k]);
  ['snake', 'pong', 'chess', 'gone'].forEach(id => { doc.components['games.grid.' + id] = { game: id }; });
  const cards = editingOn => games.toModel(doc, { games: records, editing: editingOn }).instances.grid.cards.map(c => [c.game, c.note]);
  assert.deepEqual(cards(false), [['snake', undefined], ['chess', undefined]], 'visitors: what is listed');
  assert.deepEqual(cards(true), [['snake', undefined], ['pong', 'hidden'], ['chess', 'unpublished'], ['gone', 'missing']], 'editing: every card in its place');
  const round = images.setFraming(art, 'desktop', { x: 5, y: 6, zoom: 1.5 }, 'tile'), crop = content.cropOf(round);
  assert.deepEqual(Object.keys(crop).sort(), ['focus', 'focusNarrow', 'scale', 'scaleNarrow']);
  assert.deepEqual(content.withCrop(art, crop), round, 'framing it and drawing it agree');
});

test('what arrives with a page: checked, public, and everything its cards refer to', () => {
  const g = Object.assign({}, BUILT_IN.games.snake); delete g.id;
  const raw = o => ({ version: 5, games: Object.assign({ snake: g }, o) });
  assert.deepEqual(library.received(raw(), ['snake']).games.snake, BUILT_IN.games.snake);
  assert.equal(library.received(raw(), ['snake', 'pong']), null, 'lacks one');
  assert.deepEqual(library.received(undefined, []), { version: null, games: {} });
  assert.equal(library.received(undefined, ['snake']), null);
  for (const r of [{ version: 5 }, { version: 'x', games: {} }, [], 'x', raw({ pong: Object.assign({}, g, { availability: 'hidden' }) }), raw({ pong: Object.assign({}, g, { destination: 'https://x.test/' }) }), raw({ 'Bad Id': g }), raw({ pong: null })]) assert.equal(library.received(r, []), null, JSON.stringify(r));
});

test('editing the library: fields, order, undo, saving; a newer draft is never overwritten', async () => {
  const { e, a, b } = await fresh();
  const ws = libraryOf(e, a);
  ok2(await ws.load());
  assert.ok(ws.unstored() && !ws.unsavedCards().length);
  assert.ok(ws.setDocument(editing.firstLibrary(BUILT_IN, [])));
  assert.equal(library.order(ws.working()).length, 8);
  ws.undo(); assert.equal(library.order(ws.working()).length, 0); ws.redo();
  assert.ok(!ws.setDocument({ schema: 1, components: {} }), 'never a document that isn’t valid');
  ws.setField(key('snake'), 'name', 'Serpent');
  ws.setFields(key('snake'), { category: 'Classic', description: 'Eat and grow.' });
  ws.undo(); assert.deepEqual([ws.component(key('snake')).category, ws.component(key('snake')).description, ws.component(key('snake')).name], ['Arcade', undefined, 'Serpent'], 'several fields are one step');
  assert.equal(ws.addCard(library.LIST, 'go', { name: 'Go', category: 'Strategy', destination: '/games/go/', availability: 'hidden' }), key('go'));
  assert.ok(ws.moveCard(key('go'), 0) && library.order(ws.working())[0] === 'go' && ws.removeCard(key('go')));
  ok2(await ws.save());
  assert.ok(!ws.unstored());
  ok(await publishIt(e, a, 'library'));
  ok2(await ws.load());
  // Two administrators.
  const other = libraryOf(e, b);
  ok2(await other.load());
  other.setField(key('pong'), 'name', 'Table Tennis');
  ok2(await other.save());
  ws.setField(key('snake'), 'name', 'Python'); ws.setField(key('pong'), 'category', 'Classic');
  const r = await ws.save();
  assert.deepEqual(r.conflict.overlap, [key('pong')]);
  ok2(await ws.combine(r.conflict));
  const saved = library.records(ok(await e.rpc(a, 'get_draft', 'library')).draft.content);
  assert.deepEqual([saved.snake.name, saved.pong.category], ['Python', 'Classic']);
  // A published game can't leave; the server says so and nothing is lost here.
  ws.removeCard(key('snake'));
  const no = await ws.save();
  assert.match(no.error.message, /archived, not removed/);
  assert.ok(ws.unsavedCards().length);
  // Discarding the saved draft: back to what is published.
  ws.discardAll();
  ok(await e.rpc(a, 'discard_draft', 'library', ws.draft().id));
  ok2(await ws.load());
  assert.equal(ws.component(key('snake')).name, 'Serpent');
  assert.ok(!ws.draft() && !ws.unsavedCards().length);
});
const ok2 = r => { assert.ok(r && r.ok, JSON.stringify(r)); return r; };

test('a page’s draft and the library’s: saving, publishing, a game that went away', async () => {
  const { e, a } = await fresh();
  const lib = libraryOf(e, a), page = pageOf(e, a);
  ok2(await lib.load()); ok2(await page.load());
  assert.ok(page.unstored());
  const early = await page.save();
  assert.equal(early.error.code, 'games');
  assert.match(early.error.message, /Save the Game Library’s draft first/);
  lib.setDocument(editing.firstLibrary(BUILT_IN, []));
  lib.addCard(library.LIST, 'extra', { name: 'Extra', category: 'Arcade', destination: '/games/snake/', availability: 'available' });
  assert.equal((await lib.save()).error.code, 'invalid', 'two games can’t lead to one page');
  lib.setField(key('snake'), 'availability', 'archived'); lib.undo(); lib.removeCard(key('extra'));
  ok2(await lib.save());
  ok2(await page.save());
  const refused = await publishIt(e, a, 'games');
  assert.match(refused.error.message, /publish the library first/);
  assert.ok(ok(await e.rpc(a, 'get_draft', 'games')).draft, 'the draft is kept');
  ok(await publishIt(e, a, 'library'));
  ok(await publishIt(e, a, 'games'));
  const see = async () => ok(await e.rpc(e.anon, 'get_published_content', 'games'));
  let seen = await see();
  let got = library.received(seen.library, games.gameRefs(seen.content));
  assert.ok(got && games.validateDocument(seen.content, { delivered: true }));
  assert.deepEqual(games.toModel(seen.content, { games: got.games }).instances.grid.cards.map(c => c.title), GAMES_DOC.components['games.grid'].order.map(id => BUILT_IN.games[id].name));
  // Hidden: gone for visitors, with the same page version and a newer library's.
  const was = [seen.version, seen.library.version];
  ok2(await lib.load());
  lib.setField(key('pong'), 'availability', 'hidden'); ok2(await lib.save()); ok(await publishIt(e, a, 'library'));
  seen = await see(); got = library.received(seen.library, games.gameRefs(seen.content));
  assert.ok(seen.version === was[0] && seen.library.version !== was[1]);
  assert.ok(got && !got.games.pong && games.toModel(seen.content, { games: got.games }).instances.grid.cards.length === 7);
  // A page that doesn't exist can't be a game's.
  ok2(await lib.load());
  lib.addCard(library.LIST, 'newer', { name: 'Newer', category: 'Arcade', destination: '/games/newer/', availability: 'available' });
  const route = await lib.save();
  assert.ok(route.error && /allowed destination/.test(route.error.message));
});

test('a whole page with every kind of reference: saved, published, received, drawn', async () => {
  const { e, a } = await fresh();
  const lib = libraryOf(e, a), page = pageOf(e, a);
  ok2(await lib.load()); lib.setDocument(editing.firstLibrary(BUILT_IN, []));
  lib.setField(key('snake'), 'wide', { source: { static: '/images/featured/chess-forge.webp' }, alt: '', focus: { x: 78, y: 5 } });
  ok2(await lib.save()); ok(await publishIt(e, a, 'library'));
  ok2(await page.load());
  const region = page.region('main'), types = V1('grid/widget-types.js').types;
  region.widgets.find(w => w.id === 'grid').row = 40;
  assert.ok(page.setRegion(region));
  const p = E.proposeAdd(page.region('main'), { id: 'featured', type: 'feature-hero' }, { types, width: 981 });
  assert.ok(page.addInstance(p.layout, 'featured', games.starterContent('feature-hero', { game: 'snake' })));
  assert.deepEqual(page.component('games.featured'), { game: 'snake', cta: 'Play Now' });
  assert.ok(page.addCard('games.featured.saved', 'pong', { game: 'pong', cta: 'Go' }));
  page.setField('games.grid.snake', 'crop', { focus: { x: 1, y: 2 }, scale: 1.4 });
  assert.deepEqual(games.cardFields('games.grid.snake', page.component('games.grid.snake'), ...page.docs()).map(f => f.key), ['game', 'crop']);
  assert.deepEqual(games.cardFields('games.featured', page.component('games.featured'), ...page.docs()).map(f => f.key), ['game', 'cta', 'crop']);
  ok2(await page.save()); ok(await publishIt(e, a, 'games'));
  const seen = ok(await e.rpc(e.anon, 'get_published_content', 'games')), got = library.received(seen.library, games.gameRefs(seen.content));
  const m = games.toModel(seen.content, { games: got.games });
  assert.deepEqual([m.instances.featured.card.title, m.instances.featured.card.cta, m.instances.featured.card.art.src, m.instances.featured.saved.length], ['Snake', 'Play Now', '/images/featured/chess-forge.webp', 0]);
  assert.equal(m.instances.grid.cards.find(c => c.game === 'snake').art.focus, '1% 2%');
  assert.equal(got.games.snake.art.focus, undefined, 'the record keeps its own framing');
  // Its game archived: the Featured card loses it, the page doesn't break.
  ok2(await lib.load()); lib.setField(key('snake'), 'availability', 'archived'); ok2(await lib.save()); ok(await publishIt(e, a, 'library'));
  const after = ok(await e.rpc(e.anon, 'get_published_content', 'games'));
  assert.deepEqual(after.content.components['games.featured'], { game: null });
  assert.ok(games.validateDocument(after.content, { delivered: true }) && !games.validateDocument(after.content));
  assert.equal(games.toModel(after.content, { games: library.received(after.library, games.gameRefs(after.content)).games }).instances.featured.card, null);
  // The review says what changed, by name.
  const before = ok(await e.rpc(a, 'get_draft', 'games')).published.content, next = clone(before);
  next.components['games.grid.snake'] = { game: 'pong' }; next.components['games.grid.pong'].crop = { scale: 2 }; delete next.components['games.grid.breakout'].crop;
  const s = publish.summarize(before, next, games, images, BUILT_IN.games);
  assert.deepEqual(s.cards.map(c => [c.title, c.changes.join()]).sort(), [['Pong', 'Framing'], ['Pong', 'Game']]);
});

test('reviewing the library: what changes, what stops being listed, a changed identity', async () => {
  const before = editing.firstLibrary(BUILT_IN, []), after = clone(before);
  Object.assign(after.components[key('snake')], { name: 'Pong II', destination: '/games/pong-two/', description: 'New.', wide: { source: { static: '/images/featured/x.webp' } } });
  after.components[key('pong')].name = 'Table Tennis';
  after.components[key('breakout')].availability = 'archived';
  after.components[library.LIST].order.reverse();
  assert.deepEqual(editing.identityChanges(before, after), [{ id: 'snake', before: { name: 'Snake', destination: '/games/snake/' }, after: { name: 'Pong II', destination: '/games/pong-two/' } }], 'one of the two alone is no warning');
  assert.deepEqual(editing.identityChanges(null, after), []);
  assert.deepEqual(editing.unlisted(before, after), [{ id: 'breakout', name: 'Breakout' }]);
  const s = publish.summarize(before, after, editing.content, images);
  const of = t => s.cards.find(c => c.title === t).changes;
  assert.deepEqual(of('Pong II').sort(), ['Description', 'Destination', 'Name', 'Wide artwork: image added']);
  assert.deepEqual([of('Breakout'), of('Table Tennis'), s.other, s.layout], [['Availability'], ['Name'], ['Order of the games'], []]);
  // It is a warning: the database accepts the change (tests/cms/game-library.test.mjs).
  assert.deepEqual(editing.usesOf([{ game: 'snake', page: 'games', status: 'published', cards: ['games.grid.snake'] }, { game: 'snake', page: 'games', status: 'draft', cards: ['a', 'b'] }, { game: 'pong', page: 'elsewhere', status: 'draft', cards: ['x'] }, null]),
    { snake: [{ page: 'games', name: 'Games page', live: 1, draft: 2 }], pong: [{ page: 'elsewhere', name: 'elsewhere', live: 0, draft: 1 }] });
});

test('an earlier library: opened to edit, games added since kept; ids and destinations', () => {
  const old = editing.firstLibrary(BUILT_IN, []), live = clone(old);
  live.components[key('snake')].name = 'Python';
  live.components[library.LIST].order.push('go'); live.components[key('go')] = { name: 'Go', category: 'Strategy', destination: '/games/go/', availability: 'available' };
  const work = clone(live); work.components[library.LIST].order.push('tak'); work.components[key('tak')] = { name: 'Tak', category: 'Strategy', destination: '/games/tak/', availability: 'hidden' };
  const r = editing.restored(old, live, work);
  assert.ok(library.validateDocument(r.doc));
  assert.deepEqual(library.order(r.doc), BUILT_IN.order.concat('go', 'tak'));
  assert.equal(library.records(r.doc).snake.name, 'Snake');
  live.components[key('snake')].destination = '/games/moved/'; live.components[key('go')].destination = '/games/snake/';
  assert.match(editing.restored(old, live, null).problem, /would both lead to \/games\/snake\//);
  assert.equal(editing.newId('Tic Tac Toe!', [old]), 'tic-tac-toe-2');
  assert.equal(editing.newId('', [old]), 'game');
  assert.match(editing.idProblem('snake', [old]), /another game’s id/);
  assert.match(editing.idProblem('Bad id', [old]), /lower-case/);
  assert.equal(editing.idProblem('go', [old]), null);
  assert.match(editing.destinationProblem('/games/pong/', 'snake', old), /Pong already leads there/);
  assert.equal(editing.destinationProblem('/games/snake/', 'snake', old), null);
  assert.match(editing.destinationProblem('https://x.test/', 'snake', old), /game’s page/);
  assert.deepEqual(content.mediaIds({ components: { a: { art: { source: { media: 'm1' } }, wide: { source: { media: 'm2' } } } } }), ['m1', 'm2']);
});

test('the homepage’s documents are judged and drawn as before', async () => {
  const { homeDoc } = await import('./supabase-env.mjs');
  const doc = homeDoc();
  assert.ok(content.validateDocument(doc) && content.validateDocument(doc, { delivered: true }));
  const m = content.toModel(doc, { games: {} });
  assert.ok(m.featured.title && m.carousel.length && m.carousel.every(c => c.game === undefined && c.note === undefined));
  assert.deepEqual(content.gameRefs(doc), []);
  assert.deepEqual(content.starterContent('feature-hero', { path: '/games/snake/' }), { title: 'New featured card', cta: 'Play Now', href: '/games/snake/' });
  // It may also refer to records (its conversion is a later step): drawn the same way.
  const up = clone(content.upgradeDocument(doc)); up.components['home.featured'] = { game: 'snake', cta: 'Play' };
  assert.ok(content.validateDocument(up));
  assert.equal(content.toModel(up, { games: BUILT_IN.games }).featured.title, 'Snake');
});
