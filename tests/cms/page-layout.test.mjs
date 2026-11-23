// 0014_page_layout.sql against the emulated Supabase, and the client mirror
// in scripts/cms/content.js: schema 2 (grid regions of widget instances) —
// what is accepted, what is refused, what visitors receive, and that schema 1
// and rollback keep working. Every case is checked by both the server and
// the client, which must agree.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEnv, homeDoc } from './supabase-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const content = require(path.join(ROOT, 'PergamonAtlas.V1/scripts/cms/content.js'));
const G = require(path.join(ROOT, 'PergamonAtlas.V1/scripts/grid/atlas-grid.js'));
const WT = require(path.join(ROOT, 'PergamonAtlas.V1/scripts/grid/widget-types.js'));
// Every type the homepage draws is placeable (Atlas Navigation from H5.3 Checkpoint C).
const TYPES = Object.fromEntries(Object.entries(WT.types).map(([k, v]) => [k, Object.assign({}, v, { placeable: true })]));

let env, admin;
before(async () => {
  env = await createEnv({ extra: ['0013_site_sidebar', '0014_page_layout'] });
  admin = await env.createUser('admin@example.test', { admin: true });
});

const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
async function current() {
  const d = ok(await env.rpc(admin, 'get_draft', 'home'));
  return { draftId: d.draft ? d.draft.id : null, publishedId: d.published ? d.published.id : null };
}
async function save(doc) { const { draftId } = await current(); return env.rpc(admin, 'save_draft', 'home', doc, draftId, null); }
async function publishDoc(doc) {
  const { publishedId } = await current();
  const s = ok(await save(doc));
  return env.rpc(admin, 'publish', 'home', s.draft_id, publishedId);
}
const page = () => content.upgradeDocument(homeDoc());
const card = title => ({ title, cta: 'Play Now', href: '/games/chess-forge/' });
// Server and client verdicts for one document.
async function verdict(doc) {
  const server = await save(doc);
  return { server: server.error ? server.error.code : 'ok', message: server.error && server.error.message, client: content.validatePageDocument(doc, { grid: { validatePage: G.validatePage, types: TYPES } }) };
}
async function expectValid(doc, what) {
  const v = await verdict(doc);
  assert.equal(v.server, 'ok', `${what}: server refused: ${v.message}`);
  assert.equal(v.client, true, `${what}: client refused`);
}
async function expectInvalid(doc, what, pattern) {
  const v = await verdict(doc);
  assert.equal(v.server, 'PT422', `${what}: server accepted`);
  if (pattern) assert.match(v.message, pattern, what);
  assert.equal(v.client, false, `${what}: client accepted (server said: ${v.message})`);
}

test('upgrading today’s document gives the approved homepage regions, keeping every component', () => {
  const d = page();
  assert.equal(d.schema, 2);
  assert.deepEqual(d.regions.map(r => [r.id, r.frame || null, r.rowHeight]), [['upper', 'sidebar', 23.43], ['lower', null, 23.43]]);
  assert.deepEqual(d.regions[0].widgets.map(w => [w.id, w.type, w.col, w.row, w.cols, w.rows]), [
    ['featured', 'feature-hero', 1, 1, 14, 7], ['spotlight', 'feature-spotlight', 1, 8, 14, 4], ['navigation', 'atlas-navigation', 15, 1, 6, 11]]);
  assert.deepEqual(d.regions[1].widgets.map(w => [w.id, w.type, w.cols, w.rows]), [['carousel', 'carousel', 20, 10]]);
  assert.deepEqual(d.components, homeDoc().components, 'same components, same keys');
  // Fixed rows land on today's heights: 260, 141.7, 417.7.
  const h = rows => rows * 23.43 + (rows - 1) * 16;
  assert.ok(Math.abs(h(7) - 260) < 0.1 && Math.abs(h(4) - 141.72) < 0.1 && Math.abs(h(11) - 417.73) < 0.1);
  assert.equal(content.upgradeDocument(d), d, 'schema 2 is returned as it is');
  assert.equal(content.upgradeDocument({ schema: 9 }), null);
});

test('a schema-2 homepage saves and publishes; schema 1 still does too', async () => {
  await expectValid(page(), 'upgraded homepage');
  ok(await publishDoc(page()));
  const live = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(live.content.schema, 2);
  assert.equal(live.schema, 1, 'the response still reports schema_version 1 (today’s loader requires it)');
  ok(await publishDoc(homeDoc()));                                   // schema 1 is still accepted
  assert.equal(ok(await env.rpc(env.anon, 'get_published_content', 'home')).content.schema, 1);
});

test('two Featured instances, each with its own content and saved cards', async () => {
  const d = page();
  d.regions[1].widgets.push({ id: 'featured-2', type: 'feature-hero', col: 1, row: 12, cols: 10, rows: 7 });
  d.components['home.featured-2'] = { title: 'Connect Four', cta: 'Play Now', href: '/games/connect-four/' };
  d.components['home.featured-2.saved'] = { order: ['summer'] };
  d.components['home.featured-2.saved.summer'] = card('Summer Cup');
  d.components['home.featured.saved'] = { order: ['winter'] };
  d.components['home.featured.saved.winter'] = card('Winter Cup');
  await expectValid(d, 'two featured instances');
  ok(await publishDoc(d));
  const live = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(live.content.components['home.featured'].title, 'Chess Forge');
  assert.equal(live.content.components['home.featured-2'].title, 'Connect Four');
  assert.ok(!Object.keys(live.content.components).some(k => /\.saved/.test(k)), 'visitors get no instance’s saved cards');
  const draft = ok(await env.rpc(admin, 'get_draft', 'home'));
  assert.ok(draft.published.content.components['home.featured-2.saved.summer'], 'administrators still have them');
});

test('two carousels keep their own cards; card keys are per carousel', async () => {
  const d = page();
  d.regions[1].widgets.push({ id: 'tools', type: 'carousel', col: 1, row: 12, cols: 20, rows: 10 });
  d.components['home.tools'] = { order: ['pong'] };
  d.components['home.tools.pong'] = { title: 'Pong (tools)', category: 'Arcade', href: '/games/pong/' };
  await expectValid(d, 'second carousel');
  const bad = structuredClone(d);
  bad.components['home.tools.snake'] = { title: 'Snake', category: 'Arcade', href: '/games/snake/' };
  await expectInvalid(bad, 'unlisted card in the second carousel', /not listed/);
});

test('layout rules: overlaps, bounds, spans, ids, types, regions', async () => {
  const cases = [
    ['overlap in a region', d => { d.regions[0].widgets[1].row = 7; }, /overlap/],
    ['past column 20', d => { d.regions[0].widgets[2].col = 16; }, /column 20/],
    ['fractional span', d => { d.regions[1].widgets[0].rows = 9.5; }, /whole number/],
    ['zero span', d => { d.regions[1].widgets[0].cols = 0; }, /whole number/],
    ['same instance in two regions', d => { d.regions[1].widgets.push({ id: 'featured', type: 'feature-hero', col: 1, row: 12, cols: 14, rows: 7 }); }, /placed twice/],
    ['unknown widget type', d => { d.regions[1].widgets.push({ id: 'ad', type: 'banner-ad', col: 1, row: 12, cols: 4, rows: 4 }); }, /unsupported type/],
    ['upper-case instance id', d => { d.regions[1].widgets[0].id = 'Carousel'; }, /invalid widget id/],
    ['extra field on a widget', d => { d.regions[1].widgets[0].z = 1; }, null],
    ['duplicate region id', d => { d.regions[1].id = 'upper'; }, /used twice/],
    ['unknown frame', d => { d.regions[1].frame = 'footer'; }, /frame/],
    ['row height too small', d => { d.regions[0].rowHeight = 4; }, /rowHeight/],
    ['no regions', d => { d.regions = []; }, /1 to 4 regions/],
    ['five regions', d => { for (let i = 0; i < 3; i++) d.regions.push({ id: 'r' + i, widgets: [] }); }, /1 to 4 regions/],
    ['stack missing a widget', d => { d.regions[0].stack = ['featured', 'spotlight']; }, /stack/],
    ['stack naming a widget of another region', d => { d.regions[0].stack = ['featured', 'spotlight', 'carousel']; }, /stack/],
    ['stack listing a widget twice', d => { d.regions[0].stack = ['featured', 'featured', 'navigation']; }, /stack/],
    ['stack not a list', d => { d.regions[0].stack = 'featured'; }, /stack/],
    ['25 widgets', d => { for (let i = 0; i < 21; i++) d.regions.push && d.regions[1].widgets.push({ id: 'n' + i, type: 'atlas-navigation', col: 1, row: 20 + i * 5, cols: 4, rows: 4 }); }, /at most 24/]
  ];
  for (const [what, change, pattern] of cases) { const d = page(); change(d); await expectInvalid(d, what, pattern); }
});

test('a region may omit its stack order (reading order) or give any complete order', async () => {
  const d = page(); delete d.regions[0].stack; await expectValid(d, 'no stack order');
  const e = page(); e.regions[0].stack = ['navigation', 'spotlight', 'featured']; await expectValid(e, 'another complete order');
});

test('touching edges and empty rows are fine', async () => {
  const d = page();
  d.regions[1].widgets.push({ id: 'more', type: 'carousel', col: 1, row: 11, cols: 20, rows: 10 });   // directly below the first carousel
  d.regions[1].widgets.push({ id: 'far', type: 'feature-hero', col: 5, row: 60, cols: 10, rows: 7 });  // rows 21–59 empty
  d.components['home.more'] = { order: [] };
  d.components['home.far'] = card('Far down');
  await expectValid(d, 'touching and empty rows');
});

test('content belongs to instances: missing, orphaned or misplaced components are refused', async () => {
  const cases = [
    ['feature instance without its card', d => { delete d.components['home.spotlight']; }, /missing "home.spotlight"/],
    ['carousel without its list', d => { delete d.components['home.carousel']; }, /missing "home.carousel"/],
    ['component of no widget', d => { d.components['home.ghost'] = card('Ghost'); }, /belongs to no widget/],
    ['content for Atlas Navigation', d => { d.components['home.navigation'] = card('Nav'); }, /not part of/],
    ['a saved card without a saved list (it would go unchecked)', d => { d.components['home.featured.saved.x'] = card('X'); }, /not listed/],
    ['a saved card the list leaves out', d => { d.components['home.spotlight.saved'] = { order: [] }; d.components['home.spotlight.saved.x'] = card('X'); }, /not listed/],
    ['saved cards on a carousel', d => { d.components['home.carousel.saved'] = { order: [] }; }, null],
    ['a carousel card named "saved"', d => { d.components['home.carousel'].order.push('saved'); d.components['home.carousel.saved'] = { title: 'S', category: 'Arcade', href: '/games/pong/' }; }, /reserved/],
    ['invalid card content', d => { d.components['home.featured'].title = ''; }, null],
    ['unknown top-level component', d => { d.components['footer.links'] = {}; }, /unsupported component/],
    ['unknown document field', d => { d.layout = {}; }, null]
  ];
  for (const [what, change, pattern] of cases) { const d = page(); change(d); await expectInvalid(d, what, pattern); }
});

test('Site Navigation still travels with the homepage document', async () => {
  const d = page();
  d.components['site.sidebar'] = { sections: [{ items: [{ id: 'home', label: 'Home', icon: 'home', href: '/', visible: true }] }] };
  await expectValid(d, 'with site.sidebar');
});

test('rollback restores a complete earlier page, schema 1 or 2', async () => {
  ok(await publishDoc(homeDoc()));                                    // v1 live
  const v1 = (await current()).publishedId;
  const d = page();
  d.regions[0].widgets[0].rows = 8; d.regions[0].widgets[1].row = 9;  // a schema-2 change
  ok(await publishDoc(d));
  const v2 = (await current()).publishedId;
  ok(await publishDoc(homeDoc({})));                                  // archive v2
  const live = (await current()).publishedId;
  ok(await env.rpc(admin, 'rollback', 'home', v2, live));
  let now = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(now.content.schema, 2);
  assert.equal(now.content.regions[0].widgets[0].rows, 8, 'the whole layout came back');
  ok(await env.rpc(admin, 'rollback', 'home', v1, (await current()).publishedId));
  now = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(now.content.schema, 1, 'and back to a schema-1 version');
});

test('the new checkers are not callable through the API', async () => {
  for (const fn of ['cms_validate_home_v2', 'cms_validate_home_v1']) {
    const r = await env.rpc(admin, fn, page());
    assert.ok(r.error, `${fn} is callable`);
  }
});

test('client grid rules agree with the server on region overlaps and add the content floors', () => {
  const d = page();
  assert.deepEqual(G.validatePage(d, TYPES), []);
  // A region's widgets that only touch the other region's rows don't collide (regions are separate grids).
  d.regions[1].widgets[0].row = 1;
  assert.deepEqual(G.validatePage(d, TYPES), []);
  // The client also knows the content floors at a width; the server can't.
  const upper = d.regions[0];
  assert.deepEqual(G.checkFit(upper, TYPES, 1156).map(e => e.code).filter(c => c !== 'below-min-height'), []);
});
