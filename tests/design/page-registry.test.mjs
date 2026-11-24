// The page and widget registries (scripts/cms/pages.js, widgets.js): every part
// that knows about pages or widget types agrees with them, nothing shared names
// a page or a type, every widget type is in the Handbook, and the same code
// serves a page that isn't the homepage.
//   node --test tests/design/page-registry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V1 = path.join(ROOT, 'PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const read = p => readFileSync(path.join(V1, p), 'utf8');
const script = p => require(path.join(V1, 'scripts', p));
const pages = script('cms/pages.js');
const widgets = script('cms/widgets.js');
const content = script('cms/content.js');
const workspace = script('cms/workspace.js');
const gridTypes = script('grid/widget-types.js').types;
const G = script('grid/atlas-grid.js');
const E = script('grid/editor.js');
const sorted = a => a.slice().sort();
// Code without its comments.
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// A page only these tests have.
const SAMPLE = { id: 'sample', name: 'Sample', noun: 'sample page', prefix: 'sample', schemas: [2], schemaVersion: 2, siteNavigation: false,
  regions: () => [{ id: 'main', rowHeight: 23.43, widgets: [{ id: 'spotlight', type: 'feature-spotlight', col: 1, row: 1, cols: 20, rows: 5 }] }] };
const get = pages.get;
pages.get = id => (id === 'sample' ? SAMPLE : get(id));
const sample = content.forPage('sample');
const CARD = { title: 'A card', cta: 'Go', href: '/games/' };
const DOC = { schema: 2, regions: SAMPLE.regions(), components: { 'sample.spotlight': CARD } };
const clone = o => JSON.parse(JSON.stringify(o));

test('widget types: the registry, the grid contracts, the adapters and the server list the same', () => {
  assert.deepEqual(sorted(widgets.types), sorted(Object.keys(gridTypes).filter(t => gridTypes[t].placeable)));
  const adapters = [...code(read('scripts/page-widgets.js')).split('function create(env)').pop().matchAll(/^ {6}'([a-z-]+)':/gm)].map(m => m[1]);
  assert.deepEqual(sorted(adapters), sorted(widgets.types));
  // The newest migration that lists the types; a type it doesn't know says which one it waits for.
  const dir = path.join(ROOT, 'supabase/proposed');
  const sql = readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort().map(f => readFileSync(path.join(dir, f), 'utf8')).filter(s => /t not in \(('[a-z-]+'(, )?)+\)/.test(s)).pop();
  const stored = [...sql.match(/t not in \(([^)]*)\)/)[1].matchAll(/'([a-z-]+)'/g)].map(m => m[1]);
  assert.deepEqual(sorted(stored), sorted(widgets.types.filter(t => !widgets.get(t).needs)));
  widgets.types.filter(t => widgets.get(t).needs).forEach(t => assert.ok(!widgets.offered(t), t + ': offered on the local server only'));
});

test('every widget type has its names, and a kind of card it can have', () => {
  const ids = new Set();
  widgets.types.forEach(t => {
    const w = widgets.get(t);
    assert.ok(w.name && w.baseId && ['card', 'list', 'single', 'none'].includes(w.content), t);
    assert.ok(!ids.has(w.baseId), t + ': its own base id'); ids.add(w.baseId);
    if (w.content === 'none') return;
    assert.ok(widgets.cards[w.card], t);
    if (w.content === 'single') { assert.ok(w.starter && w.starter.title && w.edit, t); return; }
    (w.content === 'card' ? ['cards', 'one', 'manage', 'order', 'starter'] : ['cards', 'one', 'manage', 'order', 'intro', 'empty', 'hint']).forEach(k => assert.ok(w[k], `${t}.${k}`));
  });
});

test('every widget type is in the Handbook, with its type', () => {
  const src = read('scripts/handbook/widgets-page.js');
  widgets.types.forEach(t => assert.ok(new RegExp(`\\['Widget type', [^\\n]*'${t}'`).test(src), `widgets-page.js: no entry says ['Widget type', … '${t}' …]`));
});

test('every page has what the shared code asks for, and a valid built-in layout', () => {
  pages.all().forEach(p => {
    ['id', 'name', 'noun', 'prefix'].forEach(k => assert.ok(typeof p[k] === 'string' && p[k], `${p.id}.${k}`));
    assert.ok(p.schemas.length && Number.isInteger(p.schemaVersion) && typeof p.siteNavigation === 'boolean', p.id);
    assert.deepEqual(G.validatePage({ regions: p.regions() }, gridTypes), [], p.id);
    const marker = `data-atlas-page="${p.id}"`;
    const html = ['index.html', ...readdirSync(V1, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name + '/index.html')].filter(f => { try { return read(f).includes(marker); } catch (e) { return false; } });
    assert.equal(html.length, 1, `one HTML page is ${p.id}`);
  });
  assert.equal(pages.all().filter(p => p.siteNavigation).length, 1, 'one page’s document holds Site Navigation');
});

test('the shared code names no page, and components know neither pages nor games', () => {
  ['scripts/page.js', 'scripts/cms/loader.js', 'scripts/cms/admin.js', 'scripts/cms/workspace.js', 'scripts/cms/drawer.js', 'scripts/cms/image-editor.js', 'scripts/cms/layout-mode.js', 'scripts/cms/manage.js',
    'scripts/cms/publish.js', 'scripts/cms/publish-dialog.js', 'scripts/cms/history.js'].forEach(f => {
    // (The schema-1 lists, and where Site Navigation is kept, are the homepage's by definition.)
    const names = [...code(read(f)).replace(/const LISTS = \[.*\];/, '').replace('Published with the homepage.', '').matchAll(/'home(\.[a-z.]*)?'|"home"|homepage|'(feature-hero|feature-spotlight|carousel|atlas-navigation|page-heading|card-grid)'/gi)].map(m => m[0]);
    assert.deepEqual(names, [], f);
  });
  readdirSync(path.join(V1, 'scripts/components')).forEach(f => assert.doesNotMatch(code(read('scripts/components/' + f)), /PergamonCMS|PergamonPage|atlasEntries/, f));
});

test('a document belongs to its page', () => {
  assert.ok(sample.validateDocument(DOC));
  assert.ok(!content.validateDocument(DOC), 'not the homepage’s');
  assert.ok(!sample.validateDocument({ schema: 1, components: { 'home.featured': CARD, 'home.spotlight': CARD, 'home.carousel': { order: [] } } }), 'schema 1 is the homepage’s');
  assert.ok(!sample.validateDocument(Object.assign(clone(DOC), { components: { 'sample.spotlight': CARD, 'home.featured': CARD } })), 'no other page’s parts');
  assert.ok(!sample.validateDocument(Object.assign(clone(DOC), { components: { 'sample.spotlight': CARD, 'site.sidebar': { sections: [] } } })), 'Site Navigation is the homepage’s');
  assert.equal(sample.upgradeDocument({ schema: 1, components: {} }), null);
  assert.equal(sample.toModel(DOC).instances.spotlight.card.id, 'sample.spotlight');
  assert.deepEqual(sample.ownerOf('sample.spotlight.saved.a', DOC), { instance: 'spotlight', type: 'feature-spotlight', part: 'saved-card' });
  assert.equal(sample.ownerOf('home.spotlight', DOC), null);
  assert.throws(() => content.forPage('nowhere'), /unknown page/);
});

test('editing another page: cards, saved cards, widgets, undo and saving use its own ids', async () => {
  const saves = [];
  const ws = workspace.create({
    page: 'sample', content: sample, validate: sample.validateDocument, fallbackDoc: DOC, createHistory: E.createHistory, starter: t => sample.starterContent(t),
    api: { getDraft: async () => ({ data: { draft: null, published: null } }), saveDraft: async (p, doc, expected) => { saves.push([p, doc, expected]); return { data: { draft_id: 1 } }; } }
  });
  await ws.load();
  ws.setField('sample.spotlight', 'title', 'Edited');
  assert.equal(ws.addCard('sample.spotlight.saved', 'kept', CARD), 'sample.spotlight.saved.kept');
  assert.ok(ws.activate('sample.spotlight.saved.kept', 'edited'));
  assert.equal(ws.component('sample.spotlight').title, 'A card');
  const region = ws.region('main'), p = E.proposeAdd(region, { id: sample.newInstanceId('carousel', ...ws.docs()), type: 'carousel' }, { types: gridTypes, width: 1217 });
  assert.ok(ws.addInstance(p.layout, 'carousel', sample.starterContent('carousel')));
  assert.equal(ws.addCard('sample.carousel', 'snake', { title: 'Snake', category: 'Arcade', href: '/games/snake/' }), 'sample.carousel.snake');
  assert.deepEqual(sorted(ws.unsavedCards()), ['page.layout', 'sample.carousel', 'sample.carousel.snake', 'sample.spotlight.saved', 'sample.spotlight.saved.edited'].sort());
  const done = clone(ws.working());
  ws.undo();
  assert.equal(ws.component('sample.carousel.snake'), undefined);
  ws.redo();
  assert.deepEqual(ws.working(), done);
  assert.ok((await ws.save()).ok);
  assert.equal(saves[0][0], 'sample');
  assert.ok(sample.validateDocument(saves[0][1]) && Object.keys(saves[0][1].components).every(k => k.startsWith('sample.')));
  assert.ok(ws.removeInstance(E.proposeRemove(ws.region('main'), 'carousel', { types: gridTypes, width: 1217 }).layout, 'carousel'));
  assert.ok(!Object.keys(ws.working().components).some(k => k.startsWith('sample.carousel')));
});

// ── Page Heading and Card Grid (P1) ─────────────────────────────────────────
const HEADING = { title: 'Games', subtitle: 'Pergamon Catalogs', emblem: 'games', count: 'cards', countLabel: 'Games' };
const TILE = { title: 'Snake', category: 'Arcade', href: '/games/snake/' };
const NEW = { schema: 2, regions: [{ id: 'main', rowHeight: 23.43, widgets: [{ id: 'heading', type: 'page-heading', col: 1, row: 1, cols: 20, rows: 5 }, { id: 'grid', type: 'card-grid', col: 1, row: 6, cols: 20, rows: 7 }] }],
  components: { 'sample.heading': HEADING, 'sample.grid': { order: ['snake'] }, 'sample.grid.snake': TILE } };
const withHeading = h => Object.assign(clone(NEW), { components: Object.assign(clone(NEW.components), { 'sample.heading': h }) });

test('a heading has only its own fields, each valid; the grid keeps the list rules', () => {
  assert.ok(sample.validateDocument(NEW));
  assert.ok(sample.validateDocument(withHeading({ title: 'Only', emblem: 'none', count: 'none' })), 'subtitle and label are optional');
  const h = o => Object.assign({}, HEADING, o);
  [{ emblem: 'none', count: 'none' }, h({ title: '' }), h({ title: 'x'.repeat(41) }), h({ title: '<b>' }), h({ subtitle: '' }), h({ emblem: 'url(x)' }), h({ count: 8 }), h({ countLabel: 'x'.repeat(17) }), h({ href: '/games/' }), [], null]
    .forEach(x => assert.ok(!sample.validateDocument(withHeading(x)), JSON.stringify(x)));
  const d = clone(NEW); d.components['sample.heading.saved'] = { order: [] };
  assert.ok(!sample.validateDocument(d), 'no saved headings');
  const e = clone(NEW); e.components['sample.grid'].order.push('gone');
  assert.ok(!sample.validateDocument(e), 'every listed card exists');
  // The emblems the editor offers are the component's.
  const emblems = [...read('scripts/components/page-heading.js').replace(/\r\n/g, '\n').split('const EMBLEMS = {')[1].split('\n  };')[0].matchAll(/^    ([a-z]+): \{/gm)].map(m => m[1]);
  const field = sample.cardFields('sample.heading', HEADING, NEW).find(f => f.key === 'emblem');
  assert.deepEqual(sorted(field.options.map(o => o.value)), sorted(emblems.concat('none')));
});

test('editing them: fields, optional fields, cards, names in the editor, a server without the types', async () => {
  const ws = workspace.create({
    page: 'sample', content: sample, validate: sample.validateDocument, fallbackDoc: NEW, createHistory: E.createHistory, starter: t => sample.starterContent(t),
    api: { getDraft: async () => ({ data: { draft: null, published: null } }), saveDraft: async () => ({ error: { code: 'PT422', message: 'widgets: "heading" has an unsupported type' } }) }
  });
  await ws.load();
  ws.setField('sample.heading', 'subtitle', undefined);
  assert.deepEqual(ws.unsavedCards(), ['sample.heading']);
  assert.ok(sample.validateDocument(ws.working()));
  ws.discardCard('sample.heading');
  assert.deepEqual(ws.component('sample.heading'), HEADING);
  assert.equal(ws.addCard('sample.grid', 'pong', TILE), 'sample.grid.pong');
  assert.ok(ws.moveCard('sample.grid.pong', 0) && ws.removeCard('sample.grid.snake'));
  assert.deepEqual(ws.order('sample.grid'), ['pong']);
  assert.equal(sample.cardLabel('sample.heading', NEW), 'Page heading');
  assert.equal(sample.cardLabel('sample.grid.snake', NEW), 'Grid card');
  assert.equal(content.cardLabel('home.carousel.x'), 'Carousel card');
  assert.equal(sample.slotOf('sample.heading', NEW), null, 'nothing to switch between');
  const r = await ws.save();
  assert.match(r.error.message, /can’t store one of the added widgets yet/);
  assert.ok(ws.unsavedCards().length, 'and nothing is lost');
  assert.equal(sample.newInstanceId('page-heading', ...ws.docs()), 'heading-2');
  assert.ok(sample.validateDocument(withHeading(sample.starterContent('page-heading'))), 'what a new one starts with is valid');
  assert.deepEqual(sample.toModel(NEW).instances.grid.cards.map(c => [c.id, c.type]), [['sample.grid.snake', 'tile']]);
});
