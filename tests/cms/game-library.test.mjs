// 0016_game_library.sql on the emulated Supabase: the Game Library and the Games
// page, what is accepted and refused, that references hold, what visitors receive,
// who may do what, that everything valid before 0016 is judged and answered exactly
// as before, and preflight_0016.sql, verify_0016.sql and recovery_0016.sql.
// (Real concurrency needs two connections, which this Postgres doesn't have; here
// the locks are checked, and every order two writers can finish in.)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, homeDoc } from './supabase-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const content = require(path.join(ROOT, 'PergamonAtlas.V1/scripts/cms/content.js'));
const sql = f => readFileSync(path.join(ROOT, 'supabase/proposed', f), 'utf8');
const PRIOR = ['0013_site_sidebar', '0014_page_layout', '0015_studio_documents'];   // (without: 'later' keeps CMS_EXTRA_MIGRATIONS out)
const clone = o => structuredClone(o);
const J = JSON.stringify;

let env, admin, admin2, user;
before(async () => {
  env = await createEnv({ extra: [...PRIOR, '0016_game_library'] });
  admin = await env.createUser('admin@example.test', { admin: true });
  admin2 = await env.createUser('second@example.test', { admin: true });
  user = await env.createUser('user@example.test');
});
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
const refused = (r, code, re) => { assert.ok(r.error, 'accepted'); assert.equal(r.error.code, code, r.error.message); if (re) assert.match(r.error.message, re); };
async function fresh() { const e = await createEnv({ extra: [...PRIOR, '0016_game_library'] }); const a = await e.createUser('a@example.test', { admin: true }); return { e, a, ...on(e, a) }; }
// Saving and publishing in one environment.
function on(e, a) {
  const at = async page => { const d = ok(await e.rpc(a, 'get_draft', page)); return { draft: d.draft ? d.draft.id : null, live: d.published ? d.published.id : null, doc: d }; };
  const save = async (page, doc, who = a) => e.rpc(who, 'save_draft', page, J(doc), (await at(page)).draft, null);
  const publish = async (page, doc) => { const s = await save(page, doc); if (s.error) return s; return e.rpc(a, 'publish', page, s.data.draft_id, (await at(page)).live); };
  const see = async page => ok(await e.rpc(e.anon, 'get_published_content', page));
  return { at, save, publish, see };
}
const record = (id, o = {}) => ({ name: id[0].toUpperCase() + id.slice(1), category: 'Arcade', destination: `/games/${id}/`, availability: 'available', ...o });
const library = (games) => ({ schema: 1, components: { 'library.games': { order: Object.keys(games) }, ...Object.fromEntries(Object.entries(games).map(([id, g]) => ['library.games.' + id, g])) } });
const GAMES = () => ({ snake: record('snake'), pong: record('pong'), breakout: record('breakout', { availability: 'coming-soon' }), battleship: record('battleship', { availability: 'hidden', category: 'Strategy' }), blackjack: record('blackjack', { availability: 'archived', category: 'Card' }) });
const HEADING = { title: 'Games', subtitle: 'Pergamon Catalogs', emblem: 'games', count: 'cards', countLabel: 'Games' };
const gamesPage = (ids = ['snake', 'pong']) => ({ schema: 2, regions: [{ id: 'main', frame: 'sidebar', rowHeight: 23.43, widgets: [{ id: 'heading', type: 'page-heading', col: 1, row: 1, cols: 20, rows: 6 }, { id: 'grid', type: 'card-grid', col: 1, row: 7, cols: 20, rows: 7 }] }],
  components: { 'games.heading': HEADING, 'games.grid': { order: ids }, ...Object.fromEntries(ids.map(id => ['games.grid.' + id, { game: id }])) } });
const check = async (page, doc, e = env) => e.as(e.superuser, async tx => (await tx.query('select public.validate_content($1, $2) as v', [page, J(doc)])).rows[0].v);

// ── The library's rules ─────────────────────────────────────────────────────
test('library: what a record may be', async () => {
  ok(await check('library', library(GAMES())));
  ok(await check('library', library({})));
  const art = { source: { static: '/images/featured/snake-card.webp' }, alt: 'Snake', focus: { x: 40, y: 60 }, scale: 1.2, focusNarrow: { x: 10, y: 10 } };
  ok(await check('library', library({ snake: record('snake', { description: 'Eat and grow.', art, wide: { source: { static: '/images/featured/snake.webp' }, fit: 'height', scale: 1.3, anchor: { x: 50, offset: -60, y: 50 }, base: '#030916' } }) })));
  ok(await check('library', library({ snake: record('snake', { art: null, wide: null }) })));
  const bad = [
    ['no name', { name: undefined }, /missing field "name"/], ['empty name', { name: '' }, /1 to 40/], ['long name', { name: 'x'.repeat(41) }, /1 to 40/], ['markup', { name: '<b>x</b>' }, /not allowed/],
    ['bidi override', { name: 'a‮b' }, /not allowed/], ['spaces', { name: ' Snake' }, /spaces/], ['category', { category: 'Casino' }, /category/], ['availability', { availability: 'public' }, /availability/], ['availability type', { availability: true }, /availability/],
    ['external destination', { destination: 'https://evil.example/' }, /allowed destination/], ['script destination', { destination: 'javascript:alert(1)' }, /allowed destination/], ['not a game page', { destination: '/games/' }, /game page/],
    ['unknown game page', { destination: '/games/tetris/' }, /allowed destination/], ['long description', { description: 'x'.repeat(161) }, /1 to 160/], ['empty description', { description: '' }, /1 to 160/], ['extra field', { price: 1 }, /unsupported field/],
    ['external image', { art: { source: { static: 'https://x/y.webp' } } }, /featured/], ['image outside the folder', { wide: { source: { static: '/images/logo.png' } } }, /featured/], ['CSS in framing', { art: { source: { static: '/images/featured/a.webp' }, focus: 'center' } }, /object/], ['image without source', { art: { alt: 'x' } }, /source/]
  ];
  for (const [what, change, re] of bad) { const g = record('snake', change); Object.keys(g).forEach(k => g[k] === undefined && delete g[k]); refused(await check('library', library({ snake: g })), 'PT422', re); assert.ok(what); }
});
test('library: ids, lists, size and shape', async () => {
  const L = library(GAMES());
  const bad = [
    [d => { d.components['library.games'].order.push('snake'); }, /listed twice/], [d => { d.components['library.games'].order.push('ghost'); }, /no component/], [d => { d.components['library.games'].order.pop(); }, /not listed/],
    [d => { delete d.components['library.games']; }, /missing "library.games"/], [d => { d.components['library.games.BAD'] = record('snake'); }, /unsupported component/], [d => { d.components['home.featured'] = {}; }, /unsupported component/],
    [d => { d.components['site.sidebar'] = {}; }, /unsupported component/], [d => { d.components['library.games.pong'].destination = '/games/snake/'; }, /another game/], [d => { d.schema = 2; }, /must be 1/], [d => { d.regions = []; }, /unsupported field/],
    [d => { d.components = []; }, /object/], [d => { d.components['library.games'].extra = 1; }, /unsupported field/]
  ];
  for (const [change, re] of bad) { const d = clone(L); change(d); refused(await check('library', d), 'PT422', re); }
  for (const d of [null, [], 'x', 1, true]) refused(await check('library', d), 'PT422');
  const many = {}; for (let i = 0; i < 65; i++) many['g' + i] = record('snake');
  refused(await check('library', library(many)), 'PT422', /up to 64/);
});

// ── Page rules ──────────────────────────────────────────────────────────────
test('the Games page: schema 2 only, its own ids, no Site Navigation', async () => {
  ok(await check('games', gamesPage()));
  ok(await check('games', { schema: 2, regions: [{ id: 'main', widgets: [] }], components: {} }));
  refused(await check('games', homeDoc()), 'PT422');
  const d = gamesPage(); d.components['site.sidebar'] = { sections: [] };
  refused(await check('games', d), 'PT422', /unsupported component/);
  const h = gamesPage(); h.components['home.featured'] = { title: 'x', cta: 'y', href: '/games/' };
  refused(await check('games', h), 'PT422', /unsupported component/);
  refused(await check('home', gamesPage()), 'PT422');
  for (const page of ['studio', 'nowhere', '', 'Games', "games'; drop table x; --"]) refused(await check(page, gamesPage()), 'PT422', /no content schema/);
  const other = gamesPage(); other.components['gamesx.grid'] = { order: [] };
  refused(await check('games', other), 'PT422', /unsupported component/);
});
test('page heading: its fields, and the browser agrees', async () => {
  const api = content.forPage('games'), H = o => ({ ...HEADING, ...o });
  const doc = h => ({ schema: 2, regions: [{ id: 'main', widgets: [{ id: 'heading', type: 'page-heading', col: 1, row: 1, cols: 20, rows: 6 }] }], components: { 'games.heading': h } });
  for (const h of [HEADING, { title: 'Only', emblem: 'none', count: 'none' }, H({ emblem: 'compass' })]) { ok(await check('games', doc(h))); assert.ok(api.validateDocument(doc(h))); }
  for (const h of [H({ title: '' }), H({ title: 'x'.repeat(41) }), H({ title: '<i>' }), H({ subtitle: '' }), H({ subtitle: 'x'.repeat(41) }), H({ emblem: 'star' }), H({ emblem: 1 }), H({ count: 8 }), H({ count: 'all' }), H({ countLabel: 'x'.repeat(17) }), H({ href: '/games/' }), { emblem: 'none', count: 'none' }, [], 'x']) {
    refused(await check('games', doc(h)), 'PT422'); assert.ok(!api.validateDocument(doc(h)), J(h));
  }
  const saved = doc(HEADING); saved.components['games.heading.saved'] = { order: [] };
  refused(await check('games', saved), 'PT422', /not part of/);
  const none = doc(HEADING); delete none.components['games.heading'];
  refused(await check('games', none), 'PT422', /missing "games.heading"/);
});
test('card grid: references only; up to 24, as in the browser; crops are framing only', async () => {
  const one = c => { const d = gamesPage(['snake']); d.components['games.grid.snake'] = c; return d; };
  for (const c of [{ game: 'snake' }, { game: 'snake', crop: {} }, { game: 'snake', crop: { focus: { x: 1, y: 2 }, focusNarrow: { x: 3, y: 4 }, scale: 2, scaleNarrow: 0.5 } }, { game: 'snake', crop: { fit: 'height', anchor: { x: 50, offset: -60, y: 10 }, anchorNarrow: { x: 1 }, base: '#aabbcc' } }]) ok(await check('games', one(c)));
  for (const c of [{}, { game: '' }, { game: 'A' }, { game: 1 }, { game: null }, { game: { id: 'snake' } }, { title: 'Snake', category: 'Arcade', href: '/games/snake/' }, { game: 'snake', title: 'Mine' }, { game: 'snake', href: '/games/pong/' }, { game: 'snake', art: { source: { static: '/images/featured/x.webp' } } },
    { game: 'snake', crop: { source: { static: '/images/featured/other.webp' } } }, { game: 'snake', crop: { alt: 'x' } }, { game: 'snake', crop: { scale: 9 } }, { game: 'snake', crop: { focus: 'x' } }, { game: 'snake', crop: [] }, { game: 'snake', crop: 'x' }, { game: 'snake', crop: null }, 'snake', ['game']]) refused(await check('games', one(c)), 'PT422');
  const ids = Array.from({ length: 24 }, (_, i) => 'k' + i), many = gamesPage(ids);
  ok(await check('games', many));
  const more = gamesPage([...ids, 'k24']);
  refused(await check('games', more), 'PT422', /up to 24/);
  const reserved = gamesPage(['saved']);
  refused(await check('games', reserved), 'PT422', /reserved/);
});
test('nothing may end below a card grid; the grid engine says the same', async () => {
  const G = require(path.join(ROOT, 'PergamonAtlas.V1/scripts/grid/atlas-grid.js')), TYPES = require(path.join(ROOT, 'PergamonAtlas.V1/scripts/grid/widget-types.js')).types;
  const W = (id, type, col, row, cols, rows) => ({ id, type, col, row, cols, rows });
  const grid = W('grid', 'card-grid', 1, 10, 10, 8);
  const cases = [[true, [grid]], [true, [grid, W('h', 'page-heading', 1, 1, 20, 6)]], [true, [grid, W('n', 'atlas-navigation', 11, 6, 6, 12)]], [false, [grid, W('n', 'atlas-navigation', 11, 7, 6, 12)]], [false, [grid, W('h', 'page-heading', 1, 18, 20, 6)]], [false, [grid, W('h', 'page-heading', 11, 14, 10, 6)]], [true, [grid, W('g', 'card-grid', 11, 10, 10, 8)]], [false, [grid, W('g', 'card-grid', 11, 10, 10, 9)]]];
  for (const [good, widgets] of cases) {
    const comps = {}; widgets.forEach(w => { if (w.type === 'card-grid') comps['games.' + w.id] = { order: [] }; if (w.type === 'page-heading') comps['games.' + w.id] = HEADING; });
    const r = await check('games', { schema: 2, regions: [{ id: 'main', rowHeight: 23.43, widgets }], components: comps });
    if (good) ok(r); else refused(r, 'PT422', /grows with its content/);
    assert.equal(G.validatePage({ regions: [{ id: 'main', rowHeight: 23.43, widgets }] }, TYPES).every(e => e.code !== 'below-growing'), good, J(widgets));
  }
  // Another region is another grid.
  ok(await check('games', { schema: 2, regions: [{ id: 'one', widgets: [grid] }, { id: 'two', widgets: [W('h', 'page-heading', 1, 30, 20, 6)] }], components: { 'games.grid': { order: [] }, 'games.h': HEADING } }));
});
test('the homepage may hold both kinds of card, and references on Featured and Spotlight', async () => {
  const d = content.upgradeDocument(homeDoc());
  d.components['home.carousel.snake'] = { game: 'snake', crop: { scale: 1.5 } };
  d.components['home.featured'] = { game: 'snake', cta: 'Play Now', style: { rules: true }, crop: { focus: { x: 1, y: 1 } } };
  d.components['home.spotlight.saved'] = { order: ['a'] }; d.components['home.spotlight.saved.a'] = { game: 'pong', cta: 'Go' };
  ok(await check('home', d));
  for (const c of [{ game: 'snake' }, { game: 'snake', cta: '' }, { game: 'snake', cta: 'x'.repeat(25) }, { game: 'snake', cta: 'Go', title: 'Mine' }, { game: 'snake', cta: 'Go', style: { rules: 1 } }, { game: null, cta: 'Go' }]) { const x = clone(d); x.components['home.featured'] = c; refused(await check('home', x), 'PT422'); }
  const v1 = homeDoc(); v1.components['home.carousel.snake'] = { game: 'snake' };
  refused(await check('home', v1), 'PT422', /unsupported field|missing field/, 'schema 1 is as it was');
});

// ── References hold ─────────────────────────────────────────────────────────
test('a page draft may use the library’s draft; publishing needs the live library', async () => {
  const { e, a, save, publish, at, see } = await fresh();
  refused(await save('games', gamesPage()), 'PT422', /game "pong" isn't in the Game Library/);
  ok(await save('library', library(GAMES())));
  const s = ok(await save('games', gamesPage()));
  refused(await e.rpc(a, 'publish', 'games', s.draft_id, null), 'PT422', /publish the library first/);
  assert.equal(await see('games'), null, 'and nothing went live');
  assert.equal((await at('games')).draft, s.draft_id, 'the draft is kept');
  ok(await e.rpc(a, 'publish', 'library', (await at('library')).draft, null));
  ok(await e.rpc(a, 'publish', 'games', s.draft_id, null));
  assert.equal((await see('games')).version > 0, true);
  refused(await publish('games', gamesPage(['snake', 'tetris'])), 'PT422', /"tetris" isn't in the Game Library/);
  // A saved (inactive) card's game must exist too.
  const home = content.upgradeDocument(homeDoc()); home.components['home.featured.saved'] = { order: ['x'] }; home.components['home.featured.saved.x'] = { game: 'tetris', cta: 'Go' };
  refused(await save('home', home), 'PT422', /tetris/);
});
test('a page draft outlives the library draft it used: kept whole, savable, never publishable', async () => {
  const { e, a, save, publish, at, see } = await fresh();
  ok(await publish('library', library({ snake: record('snake') })));
  const extra = library({ snake: record('snake'), pong: record('pong') });
  const l = ok(await save('library', extra));
  const doc = gamesPage(['snake', 'pong']);
  doc.components['games.grid.pong'].crop = { scale: 1.4 };
  ok(await save('games', doc));
  ok(await e.rpc(a, 'discard_draft', 'library', l.draft_id));
  // Nothing of the page's draft is lost, and the rest of it can still be saved.
  assert.deepEqual((await at('games')).doc.draft.content, doc);
  const edited = clone(doc); edited.components['games.heading'].title = 'All games';
  ok(await save('games', edited));
  assert.deepEqual((await at('games')).doc.draft.content, edited);
  assert.ok(ok(await e.rpc(a, 'list_game_uses')).some(u => u.game === 'pong' && u.status === 'draft'), 'the editor can tell which');
  // It can't go live, and a refused publish loses nothing.
  refused(await e.rpc(a, 'publish', 'games', (await at('games')).draft, null), 'PT422', /game "pong" isn't in the published Game Library/);
  assert.deepEqual((await at('games')).doc.draft.content, edited);
  assert.equal(await see('games'), null);
  // Only what the draft already had: another unknown game is refused.
  const more = clone(edited); more.components['games.grid'].order.push('tetris'); more.components['games.grid.tetris'] = { game: 'tetris' };
  refused(await save('games', more), 'PT422', /tetris/);
  // Once it has gone from the draft it is a new reference again.
  ok(await save('games', gamesPage(['snake'])));
  refused(await save('games', edited), 'PT422', /pong/);
  // Either way out works: the game comes back, or its card goes.
  ok(await save('library', extra)); ok(await save('games', edited));
  ok(await e.rpc(a, 'publish', 'library', (await at('library')).draft, (await at('library')).live));
  ok(await e.rpc(a, 'publish', 'games', (await at('games')).draft, null));
  assert.deepEqual((await see('games')).content.components['games.grid'].order, ['snake', 'pong']);
});
test('library checks refuse a stricter isolation level; pages without references don’t need it', async () => {
  const { e, a, publish } = await fresh();
  ok(await publish('library', library(GAMES())));
  const at = (level, p, doc) => e.as(e.superuser, async tx => {
    await tx.exec('set transaction isolation level ' + level);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [J({ role: 'authenticated', sub: a.id })]);
    return (await tx.query('select public.save_draft($1, $2, null) as v', [p, J(doc)])).rows[0].v;
  });
  for (const level of ['repeatable read', 'serializable']) {
    refused(await at(level, 'games', gamesPage()), 'PT500', /READ COMMITTED/);
    refused(await at(level, 'library', library(GAMES())), 'PT500', /READ COMMITTED/);
  }
  ok(await at('repeatable read', 'home', homeDoc()));
  ok(await at('read committed', 'games', gamesPage()));
  await e.db.exec('alter role authenticated set default_transaction_isolation = \'repeatable read\'');
  assert.ok((await rows(e, 'verify_0016.sql')).some(r => r.ok === false && /READ COMMITTED/.test(r.check_name)), 'verification notices such a setting');
});
test('a published id stays the same game: its name or its address may change, not both at once', async () => {
  const { e, a, save, publish, at } = await fresh();
  const lib = (snake, more) => library({ snake: record('snake', snake), ...more });
  const PONG = { name: 'Pong', destination: '/games/pong/' };
  // Never published: anything may change.
  ok(await save('library', lib())); ok(await save('library', lib(PONG))); ok(await publish('library', lib()));
  // Another game under its id; and two games swapped.
  refused(await save('library', lib(PONG)), 'PT422', /library\.games\.snake: name and address/);
  refused(await save('library', lib({ ...PONG, availability: 'archived' })), 'PT422', /name and address/);
  ok(await publish('library', lib({}, { pong: record('pong') })));
  refused(await save('library', library({ snake: record('snake', PONG), pong: record('pong', { name: 'Snake', destination: '/games/snake/' }) })), 'PT422', /name and address/);
  // A rename, a new route, new details: free, with anything else about the game.
  ok(await publish('library', lib({ name: 'Serpent', category: 'Classic', description: 'New.' }, { pong: record('pong') })));
  ok(await publish('library', lib({ name: 'Serpent', destination: '/games/breakout/' }, { pong: record('pong') })));
  // In two drafts of one publish it is still both at once.
  ok(await save('library', lib({ name: 'Other', destination: '/games/breakout/' }, { pong: record('pong') })));
  refused(await save('library', lib({ name: 'Other', destination: '/games/battleship/' }, { pong: record('pong') })), 'PT422', /name and address/);
  // Restoring an earlier version may change both back: the address was its own.
  const first = ok(await e.rpc(a, 'list_published_versions', 'library', 20)).pop().content;
  const back = clone(first); back.components['library.games'].order = ['snake', 'pong']; back.components['library.games.pong'] = record('pong');
  ok(await publish('library', back));
  assert.equal((await at('library')).doc.published.content.components['library.games.snake'].name, 'Snake');
});
test('a published game is archived, never removed; its id stays in every later library', async () => {
  const { e, a, save, publish, at } = await fresh();
  ok(await publish('library', library(GAMES())));
  const without = GAMES(); delete without.pong;
  refused(await save('library', library(without)), 'PT422', /library\.games\.pong: a published game can be archived, not removed/);
  // An unpublished one may be removed.
  ok(await save('library', library({ ...GAMES(), tictac: record('tic-tac-toe') })));
  ok(await save('library', library(GAMES())));
  // Saved before another administrator published more: caught when it is published.
  const older = ok(await save('library', library(GAMES())));
  ok(await e.rpc(a, 'publish', 'library', older.draft_id, (await at('library')).live));
  const archived = GAMES(); archived.pong.availability = 'archived';
  ok(await publish('library', library(archived)));
  ok(await publish('games', gamesPage(['snake', 'pong'])), 'a page may still refer to it');
});
test('a draft that lost the race is refused when published, whatever was true when it was saved', async () => {
  const { e, a, publish, at } = await fresh();
  ok(await publish('library', library({ snake: record('snake') })));
  // Administrator A's draft has only Snake; meanwhile B publishes Pong as well.
  const A = ok(await e.rpc(a, 'save_draft', 'library', J(library({ snake: record('snake', { name: 'A' }) })), null, null));
  ok(await e.rpc(a, 'discard_draft', 'library', A.draft_id));
  ok(await publish('library', library({ snake: record('snake'), pong: record('pong') })));
  // The old draft's content can't come back by any route.
  refused(await e.rpc(a, 'publish', 'library', A.draft_id, (await at('library')).live), 'PT409');
  refused(await e.rpc(a, 'save_draft', 'library', J(library({ snake: record('snake', { name: 'A' }) })), null, null), 'PT422', /pong/);
  const live = (await at('library')).live;
  const s = ok(await e.rpc(a, 'save_draft', 'library', J(library({ snake: record('snake'), pong: record('pong'), breakout: record('breakout') })), null, null));
  refused(await e.rpc(a, 'publish', 'library', s.draft_id, live - 1), 'PT409', /live version changed/);
  refused(await e.rpc(a, 'save_draft', 'library', J(library({ snake: record('snake'), pong: record('pong') })), null, null), 'PT409', /someone else/);
});
test('restoring: the library as a draft that keeps later games; a page never takes records with it', async () => {
  const { e, a, save, publish, at, see } = await fresh();
  ok(await publish('library', library({ snake: record('snake', { name: 'First' }) })));
  const first = (await at('library')).live;
  ok(await publish('games', gamesPage(['snake'])));
  const pageOne = (await at('games')).live;
  ok(await publish('library', library({ snake: record('snake', { name: 'Second' }), pong: record('pong') })));
  ok(await publish('games', gamesPage(['snake', 'pong'])));
  const liveLibrary = (await at('library')).live;
  refused(await e.rpc(a, 'rollback', 'library', first, liveLibrary), 'PT422', /restored as a draft/);
  assert.equal((await at('library')).live, liveLibrary);
  // As the dialog does it: the old version's content, plus the games added since.
  const old = ok(await e.rpc(a, 'list_published_versions', 'library', 20)).find(v => v.id === first).content;
  refused(await save('library', old), 'PT422', /pong/);
  const now = (await at('library')).doc.published.content, merged = clone(old);
  now.components['library.games'].order.forEach(id => { if (!merged.components['library.games.' + id]) { merged.components['library.games'].order.push(id); merged.components['library.games.' + id] = now.components['library.games.' + id]; } });
  const s = ok(await save('library', merged));
  assert.equal((await see('games')).library.games.snake.name, 'Second', 'a draft shows nobody anything');
  ok(await e.rpc(a, 'publish', 'library', s.draft_id, liveLibrary));
  assert.equal((await see('games')).library.games.snake.name, 'First');
  // Restoring the page brings back its references, not the records of the time.
  ok(await publish('library', library({ snake: record('snake', { name: 'Third' }), pong: record('pong') })));
  const lib = (await at('library')).live;
  ok(await e.rpc(a, 'rollback', 'games', pageOne, (await at('games')).live));
  const g = await see('games');
  assert.deepEqual([g.content.components['games.grid'].order, g.library.games.snake.name, g.library.version], [['snake'], 'Third', lib]);
  assert.equal((await at('library')).live, lib);
});

// ── What visitors receive ───────────────────────────────────────────────────
test('visitors get the records a page refers to, public ones only, and no trace of the others', async () => {
  const { e, a, publish, see, save } = await fresh();
  ok(await publish('library', library(GAMES())));
  ok(await publish('games', gamesPage(['pong', 'battleship', 'snake', 'blackjack', 'breakout'])));
  const g = await see('games');
  assert.deepEqual(Object.keys(g.library.games).sort(), ['breakout', 'pong', 'snake']);
  assert.deepEqual(g.content.components['games.grid'].order, ['pong', 'snake', 'breakout'], 'in their order');
  assert.ok(!J(g).includes('battleship') && !J(g).includes('blackjack') && !J(g).includes('hidden') && !J(g).includes('archived'));
  assert.deepEqual(g.library.games.snake, record('snake'));
  // A draft of the library shows nobody anything.
  const next = GAMES(); next.snake.name = 'Secret'; next.battleship.availability = 'available'; next.tictac = record('tic-tac-toe', { name: 'Unannounced' });
  ok(await save('library', library(next)));
  assert.equal(J(await see('games')), J(g));
  // Publishing the library alone changes the page's answer; the page's version stays.
  ok(await publish('library', library(next)));
  const h = await see('games');
  assert.deepEqual([h.version, h.library.version > g.library.version, h.library.games.snake.name, h.content.components['games.grid'].order], [g.version, true, 'Secret', ['pong', 'battleship', 'snake', 'breakout']]);
  assert.ok(!J(h).includes('Unannounced'), 'a game no page refers to isn’t served');
  for (const who of [e.anon, await e.createUser('m@example.test'), a]) assert.equal(ok(await e.rpc(who, 'get_published_content', 'library')), null, 'the library itself is never served');
});
test('a hidden game’s Featured or Spotlight card becomes empty; everything else stays', async () => {
  const { publish, see } = await fresh();
  ok(await publish('library', library(GAMES())));
  const d = content.upgradeDocument(homeDoc());
  d.components['home.featured'] = { game: 'battleship', cta: 'Play Now' };
  d.components['home.spotlight'] = { game: 'snake', cta: 'Go', crop: { scale: 1.1 } };
  d.components['home.carousel.pong'] = { game: 'blackjack' };
  d.components['home.featured.saved'] = { order: ['x'] }; d.components['home.featured.saved.x'] = { game: 'pong', cta: 'Saved' };
  d.components['site.sidebar'] = { sections: [{ items: [{ id: 'home', label: 'Home', icon: 'home', href: '/', visible: true }] }] };
  ok(await publish('home', d));
  const h = await see('home'), c = h.content.components;
  assert.deepEqual(c['home.featured'], { game: null });
  assert.deepEqual(c['home.spotlight'], d.components['home.spotlight']);
  assert.deepEqual(c['home.carousel'].order, ['battleship', 'breakout', 'blackjack', 'connect-four', 'snake'], 'its own cards stay; the reference to an archived game goes');
  assert.ok(!('home.carousel.pong' in c) && !Object.keys(c).some(k => /saved/.test(k)));
  assert.deepEqual(c['site.sidebar'], d.components['site.sidebar']);
  assert.deepEqual(Object.keys(h.library.games), ['snake'], 'nor are saved cards’ games served');
});
test('images: a library publish needs them prepared, all or nothing; only public records’ images are named', async () => {
  const { e, a, save, publish, at, see } = await fresh();
  const media = async () => { const up = ok(await e.rpc(a, 'create_media_upload', 'image/webp', 1000)); return up.media_id; };
  const prepare = async (id, n) => ok(await e.rpc(e.service, 'cms_record_prepared_media', id, `media/${String(n).repeat(64)}.webp`, 'image/webp', 1000, 600, 600, String(n).repeat(64)));
  const [one, two, three] = [await media(), await media(), await media()];
  const art = id => ({ source: { media: id }, alt: '' });
  ok(await publish('library', library({ snake: record('snake') })));
  ok(await publish('games', gamesPage(['snake'])));
  const before = await see('games'), live = (await at('library')).live;
  const next = library({ snake: record('snake', { art: art(one), wide: art(two) }), pong: record('pong', { availability: 'hidden', art: art(three) }) });
  const s = ok(await save('library', next));
  await prepare(one, 1);
  refused(await e.rpc(a, 'publish', 'library', s.draft_id, live), 'PT409', /not been prepared/);
  assert.deepEqual([await see('games'), (await at('library')).live, (await at('library')).draft], [before, live, s.draft_id], 'nothing changed');
  await prepare(two, 2); await prepare(three, 3);
  ok(await e.rpc(a, 'publish', 'library', s.draft_id, live));
  const g = await see('games');
  assert.deepEqual(Object.keys(g.media).sort(), [one, two].sort());
  assert.ok(!J(g).includes(three));
  refused(await publish('library', library({ snake: record('snake', { art: art(crypto.randomUUID()) }), pong: record('pong') })), 'PT409', /not been prepared/);
});
test('a page without references is answered as 0014 answers it, key for key', async () => {
  const old = await createEnv({ extra: PRIOR, without: ['later'] }), oldAdmin = await old.createUser('a@example.test', { admin: true });
  const O = on(old, oldAdmin), N = await fresh();
  ok(await N.publish('library', library(GAMES())));
  const saved = homeDoc(); saved.components['home.featured.saved'] = { order: ['s'] }; saved.components['home.featured.saved.s'] = { title: 'S', cta: 'Go', href: '/games/' };
  const two = content.upgradeDocument(saved); two.regions[1].widgets.push({ id: 'carousel-2', type: 'carousel', col: 1, row: 12, cols: 20, rows: 10 }); two.components['home.carousel-2'] = { order: [] };
  for (const doc of [homeDoc(), saved, content.upgradeDocument(homeDoc()), two]) {
    ok(await O.publish('home', doc)); ok(await N.publish('home', doc));
    const x = await O.see('home'), y = await N.see('home');
    ['version', 'published_at'].forEach(k => { delete x[k]; delete y[k]; });
    assert.equal(J(y), J(x));
    assert.ok(!('library' in y));
  }
});

// ── Compatibility ───────────────────────────────────────────────────────────
test('homepage documents, good and bad: 0016 judges them exactly as 0014 did', async () => {
  const old = await createEnv({ extra: PRIOR, without: ['later'] });
  // Deterministic variations of real documents: every value replaced, removed or added to.
  let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const bases = [homeDoc(), content.upgradeDocument(homeDoc())];
  bases[0].components['home.spotlight.saved'] = { order: ['a'] }; bases[0].components['home.spotlight.saved.a'] = { title: 'A', cta: 'Go', href: '/games/', art: { source: { static: '/images/featured/a.webp' }, focus: { x: 1, y: 2 } } };
  bases[1].regions[1].widgets.push({ id: 'featured-2', type: 'feature-hero', col: 1, row: 12, cols: 10, rows: 7 }); bases[1].components['home.featured-2'] = { title: 'Two', cta: 'Go', href: '/games/' };
  bases[1].components['site.sidebar'] = { sections: [{ items: [{ id: 'home', label: 'Home', icon: 'home', href: '/', visible: true }] }] };
  const values = [null, '', 'x', 0, 1, -1, 21, 2.5, true, [], {}, ['x'], '<b>', 'https://x.y/', '/games/snake/', { source: { static: '/images/featured/a.webp' } }, 'feature-hero', 'carousel', 'x'.repeat(70)];
  const spots = d => { const out = []; (function walk(o) { Object.keys(o).forEach(k => { out.push([o, k]); if (o[k] && typeof o[k] === 'object') walk(o[k]); }); })(d); return out; };
  let good = 0, bad = 0;
  for (let i = 0; i < 700; i++) {
    const d = clone(bases[i % 2]);
    for (let n = 1 + rnd(2); n > 0; n--) {
      const all = spots(d), [o, k] = all[rnd(all.length)], how = rnd(4);
      if (how === 0) { if (Array.isArray(o)) o.splice(k, 1); else delete o[k]; }
      else if (how === 1) { if (Array.isArray(o)) o.push(clone(o[k])); else o['extra' + rnd(3)] = clone(values[rnd(values.length)]); }
      else o[k] = clone(values[rnd(values.length)]);
    }
    const [x, y] = [await check('home', d, old), await check('home', d, env)];
    assert.equal(y.error && y.error.code + y.error.message, x.error && x.error.code + x.error.message, J(d).slice(0, 400));
    if (x.error) bad++; else good++;
  }
  assert.ok(good > 40 && bad > 200, `${good} accepted, ${bad} refused`);
});
test('Games pages and libraries, however malformed: accepted or refused with PT422, never an error of another kind', async () => {
  let seed = 11; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const values = [null, '', 'x', 0, -1, 2.5, 1e300, true, [], {}, ['x'], 'game', { game: 'snake' }, { game: null }, 'saved', 'x'.repeat(70), '\u202e', { source: { media: 'x' } }, [[]], { order: 'x' }];
  const spots = d => { const out = []; (function walk(o) { Object.keys(o).forEach(k => { out.push([o, k]); if (o[k] && typeof o[k] === 'object') walk(o[k]); }); })(d); return out; };
  let good = 0, bad = 0;
  for (let i = 0; i < 600; i++) {
    const p = i % 2 ? 'games' : 'library', d = clone(p === 'games' ? gamesPage(['snake', 'pong']) : library(GAMES()));
    for (let n = 1 + rnd(3); n > 0; n--) { const all = spots(d), [o, k] = all[rnd(all.length)]; if (rnd(4) === 0) { if (Array.isArray(o)) o.splice(k, 1); else delete o[k]; } else if (rnd(4) === 0) { if (Array.isArray(o)) o.push(clone(values[rnd(values.length)])); else o[['extra', 'game', 'crop', 'games.grid.saved', 'library.games.x'][rnd(5)]] = clone(values[rnd(values.length)]); } else o[k] = clone(values[rnd(values.length)]); }
    const r = await check(p, d);
    if (r.error) { bad++; assert.equal(r.error.code, 'PT422', `${r.error.code} ${r.error.message} ${J(d).slice(0, 300)}`); } else good++;
  }
  assert.ok(good > 5 && bad > 300, `${good} accepted, ${bad} refused`);
});
test('a database with history: 0016 changes no row, and every version can still be restored', async () => {
  const e = await createEnv({ extra: PRIOR, without: ['later'] }), a = await e.createUser('a@example.test', { admin: true }), { publish, save, at, see } = on(e, a);
  const docs = [homeDoc(), content.upgradeDocument(homeDoc()), homeDoc()]; docs[2].components['home.featured'].title = 'Third';
  for (const d of docs) ok(await publish('home', d));
  ok(await save('home', docs[1]));
  await e.db.exec("insert into public.atlas_visibility_overrides (path, visibility) values ('/games/pong', 'admin'), ('/games/tic-tac-toe', 'public'), ('/tools/x', 'admin')");
  const dump = async () => J([(await e.db.query('select * from public.site_content_versions order by id')).rows, (await e.db.query('select * from public.atlas_visibility_overrides order by path')).rows, (await e.db.query('select * from public.site_media')).rows, (await e.db.query('select * from public.site_content_routes order by path')).rows]);
  const before = await dump(), answer = J(await see('home'));
  await e.db.exec(sql('0016_game_library.sql'));
  assert.equal(await dump(), before, 'no row changed');
  assert.equal(J(await see('home')), answer);
  await e.db.exec(sql('0016_game_library.sql'));                     // harmless twice
  assert.equal(await dump(), before);
  for (const v of ok(await e.rpc(a, 'list_published_versions', 'home', 20)).filter(x => x.status === 'archived').reverse()) ok(await e.rpc(a, 'rollback', 'home', v.id, (await at('home')).live));
  assert.deepEqual((await e.db.query("select distinct page from public.site_content_versions")).rows, [{ page: 'home' }], 'nothing was created for the new pages');
});

// ── Who may ─────────────────────────────────────────────────────────────────
test('authorization: guests, members, forged claims; administrators only', async () => {
  const L = J(library(GAMES())), P = J(gamesPage());
  const forged = { ...user, claims: { sub: user.id, role: 'authenticated', app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } } };
  const other = { role: 'authenticated', id: admin.id, claims: { role: 'authenticated' } };
  for (const who of [env.anon, user, forged, other]) for (const [fn, ...args] of [['save_draft', 'library', L, null, null], ['save_draft', 'games', P, null, null], ['get_draft', 'library'], ['get_draft', 'games'], ['publish', 'library', 1, null], ['rollback', 'games', 1, null], ['discard_draft', 'library', 1], ['list_versions', 'library', 10], ['list_published_versions', 'library', 10], ['list_game_uses']]) {
    const r = await env.rpc(who, fn, ...args);
    assert.ok(r.error && ['42501', 'PT403'].includes(r.error.code), `${who.role} ${fn}: ${J(r)}`);
  }
  assert.equal((await env.db.query('select count(*)::int as n from public.site_content_versions')).rows[0].n, 0, 'nothing was stored');
  ok(await env.rpc(admin, 'list_game_uses'));
  // A demoted administrator stops at once.
  const gone = await env.createUser('gone@example.test', { admin: true });
  ok(await env.rpc(gone, 'list_game_uses'));
  await env.db.query("update public.profiles set role = 'user' where id = $1", [gone.id]);
  refused(await env.rpc(gone, 'list_game_uses'), 'PT403');
});
test('internal functions and tables: nobody through the API', async () => {
  const internal = { cms_game_refs: ['{}'], cms_check_crop: ['{}', 'x'], cms_check_game_ref: ['{}', 'x', false], cms_check_feature: ['{}', 'x', '{}'], cms_check_list_card: ['{}', 'x', '{}'], cms_check_heading: ['{}', 'x'], cms_validate_page: ['games', '{}'], cms_validate_library: ['{}'], cms_require_games: ['games', '{}', true], cms_activate: ['games', '{}', null, null, admin.id], validate_content: ['games', '{}'] };
  for (const who of [env.anon, user, admin]) {
    for (const [fn, args] of Object.entries(internal)) refused(await env.rpc(who, fn, ...args), '42501');
    for (const q of ['select * from public.site_content_versions', 'select * from public.site_pages', "insert into public.site_pages values ('x', 1)", "update public.site_content_versions set content = '{}'", 'delete from public.site_content_versions']) refused(await env.as(who, tx => tx.query(q)), '42501');
  }
  // Every function 0016 made or replaced runs with an empty search_path.
  const rows = (await env.db.query("select proname, proconfig from pg_proc where pronamespace = 'public'::regnamespace and (proname like 'cms_%' or proname in ('validate_content', 'get_published_content', 'save_draft', 'rollback', 'list_game_uses'))")).rows;
  rows.forEach(r => assert.ok((r.proconfig || []).includes('search_path=""'), r.proname));
});
test('where games are used: every page the database has, live and draft, without naming any', async () => {
  const { e, a, publish, save } = await fresh();
  ok(await publish('library', library(GAMES())));
  ok(await publish('games', gamesPage(['snake', 'pong'])));
  ok(await save('games', gamesPage(['snake'])));
  // A page registered later needs one row and no function change.
  await e.db.exec("insert into public.site_pages (page, schema_version) values ('arcade', 2)");
  const later = { schema: 2, regions: [{ id: 'main', widgets: [{ id: 'grid', type: 'card-grid', col: 1, row: 1, cols: 20, rows: 7 }] }], components: { 'arcade.grid': { order: ['x'] }, 'arcade.grid.x': { game: 'battleship' } } };
  ok(await publish('arcade', later));
  assert.deepEqual(ok(await e.rpc(a, 'list_game_uses')), [
    { game: 'battleship', page: 'arcade', status: 'published', cards: ['arcade.grid.x'] },
    { game: 'pong', page: 'games', status: 'published', cards: ['games.grid.pong'] },
    { game: 'snake', page: 'games', status: 'draft', cards: ['games.grid.snake'] },
    { game: 'snake', page: 'games', status: 'published', cards: ['games.grid.snake'] }]);
  const g = ok(await e.rpc(e.anon, 'get_published_content', 'arcade'));
  assert.deepEqual([g.content.components['arcade.grid'].order, g.library.games], [[], {}], 'and its hidden game is left out');
});

// ── Locks ───────────────────────────────────────────────────────────────────
test('locks: a page write shares the library’s after its own; a library write holds it alone', async () => {
  const { e, a, publish } = await fresh();
  ok(await publish('library', library(GAMES())));
  const key = async k => (await e.db.query("select hashtext('pergamon.site_content:' || $1) as h", [k])).rows[0].h;
  const [LIB, PAGE] = [await key('library'), await key('games')];
  const held = fn => e.as(a, async tx => { await fn(tx); await tx.exec('reset role'); return (await tx.query("select objid::bigint as id, mode from pg_locks where locktype = 'advisory' order by mode")).rows; });
  const unsigned = n => (n < 0 ? n + 4294967296 : n);
  const locks = rows => rows.map(r => `${unsigned(r.id) === unsigned(LIB) ? 'library' : unsigned(r.id) === unsigned(PAGE) ? 'page' : r.id} ${r.mode}`).sort();
  assert.deepEqual(locks(ok(await held(tx => tx.query('select public.save_draft($1, $2, null, null)', ['games', J(gamesPage())])))), ['library ShareLock', 'page ExclusiveLock']);
  assert.deepEqual(locks(ok(await held(tx => tx.query('select public.save_draft($1, $2, (select null::bigint), null)', ['library', J(library(GAMES()))])))), ['library ExclusiveLock']);
  assert.deepEqual(locks(ok(await held(tx => tx.query('select public.save_draft($1, $2, null, null)', ['home', J(homeDoc())])))).filter(x => x.startsWith('library')), [], 'a page without references doesn’t need it');
});

// ── The scripts ─────────────────────────────────────────────────────────────
const rows = async (e, f) => (await e.db.query(sql(f))).rows;
const allTrue = (list, what) => { assert.ok(list.length > 6); list.forEach(r => assert.notEqual(r.ok, false, `${what}: ${r.check_name}`)); assert.ok(list.filter(r => r.ok === true).length > 5); };
const note = (list, name) => list.find(r => r.check_name.includes(name)).value;
test('preflight, apply, verify, recover: as they say, and recovery leaves 0015’s database', async () => {
  const e = await createEnv({ extra: PRIOR, without: ['later'] }), a = await e.createUser('a@example.test', { admin: true }), { publish, at } = on(e, a);
  ok(await publish('home', homeDoc())); ok(await publish('home', content.upgradeDocument(homeDoc()))); ok(await publish('home', homeDoc()));
  await e.db.exec("insert into public.atlas_visibility_overrides (path, visibility) values ('/games/pong', 'admin')");
  const functions = async () => J((await e.db.query("select p.oid::regprocedure::text as f, pg_get_functiondef(p.oid) as d, p.proacl::text as acl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1")).rows);
  const before = await functions(), pre = await rows(e, 'preflight_0016.sql');
  allTrue(pre, 'preflight');
  assert.equal(note(pre, 'visibility overrides of games'), '/games/pong → admin');
  await e.db.exec(sql('0016_game_library.sql'));
  const post = await rows(e, 'verify_0016.sql');
  allTrue(post, 'verify');
  ['homepage answer fingerprint', 'fingerprint of every stored version', 'stored versions', 'fingerprint of all visibility overrides', 'live homepage version'].forEach(n => assert.equal(note(post, n), note(pre, n), n));
  assert.ok((await rows(e, 'preflight_0016.sql')).some(r => r.ok === false), 'preflight notices it is already there');
  await e.db.exec(sql('recovery_0016.sql').replace('pg_sleep(10)', 'pg_sleep(0)'));
  assert.equal(await functions(), before, 'every function and its privileges are as they were');
  assert.deepEqual((await e.db.query('select page from public.site_pages')).rows, [{ page: 'home' }]);
  allTrue(await rows(e, 'preflight_0016.sql'), 'preflight after recovery');
  ok(await publish('home', homeDoc()));
  await e.db.exec(sql('0016_game_library.sql'));
  allTrue(await rows(e, 'verify_0016.sql'), 'verify again');
  assert.ok((await at('home')).live);
});
test('verify notices a wrong database', async () => {
  for (const [what, break_] of [['a privilege', "grant execute on function public.cms_validate_library(jsonb) to authenticated"], ['a changed function', "create or replace function public.cms_game_refs(doc jsonb) returns text[] language sql immutable set search_path = '' as $$ select array[]::text[] $$"], ['a table opened', 'grant select on public.site_content_versions to anon'], ['a missing page', "delete from public.site_pages where page = 'games'"]]) {
    const e = await createEnv({ extra: [...PRIOR, '0016_game_library'] }), a = await e.createUser('a@example.test', { admin: true });
    ok(await on(e, a).publish('home', homeDoc()));
    await e.db.exec(break_);
    assert.ok((await rows(e, 'verify_0016.sql').catch(() => [{ ok: false }])).some(r => r.ok === false), what);
  }
});
test('recovery refuses once anything of 0016 has been saved, and changes nothing', async () => {
  const heading = content.upgradeDocument(homeDoc()); heading.regions[1].widgets.push({ id: 'heading', type: 'page-heading', col: 1, row: 12, cols: 20, rows: 6 }); heading.components['home.heading'] = HEADING;
  for (const setup of [async t => ok(await t.save('library', library({}))), async t => ok(await t.save('games', { schema: 2, regions: [{ id: 'm', widgets: [] }], components: {} })), async t => ok(await t.save('home', heading))]) {
    const t = await fresh();
    await setup(t);
    const r = await t.e.as(t.e.superuser, tx => tx.exec(sql('recovery_0016.sql').replace('pg_sleep(10)', 'pg_sleep(0)').replace(/^(begin|commit);\r?$/gm, '')));
    assert.match(r.error.message, /leave 0016 in place/);
    ok(await t.e.rpc(t.a, 'list_game_uses'));
    ok(await check('library', library(GAMES()), t.e));
  }
});
test('0016 refuses a database without what it needs', async () => {
  const e = await createEnv({ extra: ['0013_site_sidebar'], without: ['later'] }).catch(() => null);
  if (!e) return;

  await assert.rejects(e.db.exec(sql('0016_game_library.sql')), /0016 needs/);
  await e.db.exec('rollback').catch(() => {});
  assert.equal((await e.db.query("select to_regprocedure('public.cms_validate_library(jsonb)') as f")).rows[0].f, null);
});
