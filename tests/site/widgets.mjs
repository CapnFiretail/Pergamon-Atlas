// The Page Heading and Card Grid widgets, and widgets that grow, on a page and
// in Admin Mode. Needs the local development server; the page ("sample") exists
// in this browser only, and the database and sign-in are stand-ins (lib.mjs).
//
//   node tests/site/widgets.mjs [folder for pictures]
//
// Drawing (grid, stacked, narrow, every palette and mode), the derived count and
// the heading level, growth as cards and width change, editing both in Content
// and Layout Mode with pointer and keyboard, what is refused under a growing
// widget, undo, saving and publishing; and, on the homepage, adding them to a
// database that doesn't know them yet.
import { chromium, context, database, open, SITE } from './lib.mjs';

let bad = 0;
const shots = process.argv[2];
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
const REGION = { id: 'main', frame: 'sidebar', rowHeight: 23.43, widgets: [
  { id: 'heading', type: 'page-heading', col: 1, row: 1, cols: 20, rows: 5 }, { id: 'spotlight', type: 'feature-spotlight', col: 1, row: 6, cols: 12, rows: 5 }, { id: 'grid', type: 'card-grid', col: 1, row: 13, cols: 20, rows: 7 }] };
const GAMES = [['battleship', 'Battleship', 'Strategy'], ['blackjack', 'Blackjack', 'Card'], ['breakout', 'Breakout', 'Arcade'], ['chess-forge', 'Chess Forge', 'Strategy'], ['connect-four', 'Connect Four', 'Strategy'], ['pong', 'Pong', 'Arcade'], ['snake', 'Snake', 'Arcade'], ['tic-tac-toe', 'Tic-Tac-Toe', 'Classic']];
const doc = () => ({ schema: 2, regions: [JSON.parse(JSON.stringify(REGION))], components: Object.assign({
  'sample.heading': { title: 'Games', subtitle: 'Pergamon Catalogs', emblem: 'games', count: 'cards', countLabel: 'Games' },
  'sample.spotlight': { title: 'A spotlight', cta: 'Go', href: '/games/' },
  'sample.grid': { order: GAMES.map(g => g[0]) } }, Object.fromEntries(GAMES.map(([k, title, category]) => ['sample.grid.' + k, { title, category, href: `/games/${k}/` }]))) });
const html = (await (await fetch(SITE + '/')).text()).replace('data-atlas-page="home"', 'data-atlas-page="sample"').replace('<script src="/scripts/home.js"></script>', '<script src="/sample.js"></script>');
const registry = (await (await fetch(SITE + '/scripts/cms/pages.js')).text()).replace('const PAGES = {', `const PAGES = { sample: { id: 'sample', name: 'Sample page', noun: 'sample page', prefix: 'sample', schemas: [2], schemaVersion: 2, siteNavigation: false, regions: () => [${JSON.stringify(REGION)}] },`);
const script = `PergamonPages.mount({ document: ${JSON.stringify(doc())} });`;
const live = { sample: null };
const server = { draft: null, id: 100, saves: [] };
const answer = (role, fn, a) => {
  if (fn === 'get_published_content') return { data: live[a.p_page] || null };
  if (role !== 'admin') return { error: { code: 'PT403', message: 'forbidden' } };
  if (fn === 'get_draft') return { data: { page: a.p_page, draft: server.draft, published: live.sample ? { id: 200, content: live.sample.content } : null } };
  if (fn === 'save_draft') { server.saves.push(a); server.draft = { id: ++server.id, content: a.p_content, created_at: new Date().toISOString(), based_on_published_id: null }; return { data: { draft_id: server.id } }; }
  if (fn === 'publish') { live.sample = { page: 'sample', version: 200, schema: 2, content: server.draft.content, media: {} }; server.draft = null; return { data: { version: 200, previous_version: null } }; }
  return { data: [] };
};
const browser = await chromium.launch();
async function ctx(o = {}) {
  const c = await context(browser, Object.assign({ answer, storage: { paSidebarCollapsed: '0' } }, o));
  if (shots) await c.unroute(/fonts\.g/);
  await c.route('**/sample/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await c.route('**/sample.js', r => r.fulfill({ contentType: 'text/javascript', body: script }));
  if (!o.home) await c.route('**/scripts/cms/pages.js', r => r.fulfill({ contentType: 'text/javascript', body: registry }));
  return c;
}
const state = p => p.evaluate(() => {
  const box = s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height, b: r.bottom + scrollY }; };
  const slot = id => box(`[data-widget-id="${id}"]`);
  const g = document.querySelector('.card-grid'), last = g && [...g.querySelectorAll('.card-grid-item')].pop();
  return { grid: document.querySelector('.home-region').dataset.atlasState, heading: slot('heading'), spotlight: slot('spotlight'), list: slot('grid'), region: box('.home-region'), cards: document.querySelectorAll('.card-grid-item').length,
    inside: !last || last.getBoundingClientRect().bottom <= g.getBoundingClientRect().bottom + 0.5, count: (document.querySelector('.page-heading-count-num') || {}).textContent, countShown: !!document.querySelector('.page-heading-count:not([hidden])') && getComputedStyle(document.querySelector('.page-heading-count')).display !== 'none',
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent), over: document.documentElement.scrollWidth > innerWidth, footer: box('#footer-placeholder') };
});
const close = (a, b, d = 1) => Math.abs(a - b) <= d;

// ── What visitors see ──
let c = await ctx({ size: [1440, 1000] }), p = await open(c, '/sample/');
let s = await state(p);
ok(s.grid === 'grid' && s.cards === 8 && s.inside, 'eight cards, all inside the grid');
ok(s.count === '8' && s.countShown, 'the count is derived');
ok(s.h1.join() === 'Games', 'the heading is the page’s h1');
ok(close(s.heading.h, 5 * 23.43 + 4 * 16) && close(s.spotlight.h, 5 * 23.43 + 4 * 16), 'the other widgets keep exactly their rectangles');
ok(s.list.h > 7 * 23.43 + 6 * 16 + 20 && close(s.region.b, s.list.b) && s.footer.y >= s.region.b, 'the card grid has grown, and the page with it');
if (shots) await p.screenshot({ path: shots + '/page-dark.png', fullPage: true });
for (const w of [1920, 1280, 1000]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(250); const v = await state(p); ok(v.grid === 'grid' ? v.inside && !v.over : v.grid === 'stack' && !v.over, `${w}px: ${v.grid}, nothing clipped or overflowing`); }
for (const w of [900, 768, 390, 320]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(250); const v = await state(p); ok(v.grid === 'stack' && v.inside && !v.over && v.heading.b <= v.spotlight.y + 1 && v.spotlight.b <= v.list.y + 1, `${w}px: stacked in order, nothing overflowing`); if (shots && w === 390) await p.screenshot({ path: shots + '/page-390.png', fullPage: true }); }
ok(!c.errs.length, 'no errors ' + c.errs); await c.close();
const looks = new Set();
for (const palette of ['obsidian', 'sapphire', 'emerald', 'copper']) for (const mode of ['dark', 'light']) {
  c = await ctx({ size: [1440, 1000], theme: mode, storage: { 'pa-appearance': JSON.stringify({ palette, mode }), paSidebarCollapsed: '0', 'sb-aaaaaaaaaaaaaaaaaaaa-auth-token': '{}' } });
  p = await open(c, '/sample/', 'user');
  const v = await p.evaluate(() => { const st = (q, k) => getComputedStyle(document.querySelector(q))[k]; const a = document.createElement('i'); a.style.color = 'var(--color-accent)'; document.body.append(a); return { got: document.documentElement.dataset.palette + document.documentElement.dataset.mode, accent: getComputedStyle(a).color, emblem: st('.page-heading-emblem', 'backgroundColor'), title: st('.page-heading-title', 'color') + st('.page-heading', 'backgroundImage') }; });
  ok(v.got === palette + mode && v.accent === v.emblem, `${palette} ${mode}: the emblem is the accent`);
  looks.add(v.title);
  if (shots && palette !== 'obsidian' && mode === 'dark' || shots && palette === 'obsidian' && mode === 'light') await p.locator('.page-heading').screenshot({ path: `${shots}/heading-${palette}-${mode}.png` });
  await c.close();
}
ok(looks.size === 8, 'and the surface follows every palette and mode');

// ── Admin Mode ──
c = await ctx({ size: [1440, 1000] }); p = await open(c, '/sample/', 'admin', 1800);
const click = async (q, wait = 300) => { await p.locator(q).filter({ visible: true }).first().click(); await p.waitForTimeout(wait); };
const status = () => p.locator('.cms-layout-status').innerText();
await click('#cms-admin-button'); await click('.cms-admin-switch', 900); await click('#cms-admin-button');
const labels = async () => p.locator('.cms-edit-pencil, .cms-manage-button, .cms-add-tile').evaluateAll(n => n.map(b => b.getAttribute('aria-label')));
let l = await labels();
ok(['Edit page heading: Games', 'Edit grid card: Snake', 'Manage grid cards (8)', 'Add grid card'].every(x => l.includes(x)) && !l.some(x => /Manage.*heading/i.test(x)), 'Content Mode: their controls');
if (shots) await p.screenshot({ path: shots + '/content-mode.png', fullPage: true });
await click('.cms-edit-pencil[data-cms-edit="sample.heading"]');
const fields = await p.locator('.cms-drawer .cms-field-label').evaluateAll(n => n.map(x => x.firstChild.textContent));
ok(fields.join() === 'Title,Subtitle,Emblem,Count,Count label', 'the heading’s fields');
if (shots) await p.screenshot({ path: shots + '/heading-editor.png' });
await p.fill('.cms-drawer [name="title"]', 'All games'); await p.fill('.cms-drawer [name="subtitle"]', ''); await p.selectOption('.cms-drawer [name="emblem"]', 'compass'); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.querySelector('h1').textContent === 'All games' && document.querySelector('.page-heading-sub').hidden && !!document.querySelector('.page-heading-emblem svg')), 'edits show on the page at once');
await p.selectOption('.cms-drawer [name="count"]', 'none'); await p.waitForTimeout(200);
ok(!(await state(p)).countShown, 'the count can be left out');
await p.selectOption('.cms-drawer [name="count"]', 'cards'); await p.fill('.cms-drawer [name="title"]', ''); await p.waitForTimeout(200);
ok(await p.locator('.cms-drawer-primary[type="submit"]').isDisabled(), 'a heading needs a title');
await p.fill('.cms-drawer [name="title"]', 'All games'); await click('.cms-drawer-primary[type="submit"]', 800);
ok(server.saves.length === 1 && JSON.stringify(Object.keys(server.saves[0].p_content.components['sample.heading']).sort()) === '["count","countLabel","emblem","title"]', 'saved; the emptied subtitle is left out');
await click('.cms-drawer-close');
await click('.cms-edit-pencil[data-cms-edit="sample.grid.snake"]'); await p.fill('.cms-drawer [name="title"]', 'Snake, again'); await p.waitForTimeout(200);
ok(await p.locator('.home-tile-title', { hasText: 'Snake, again' }).count() === 1, 'a grid card is edited in place');
await click('.cms-drawer-secondary:text-is("Discard Changes")'); await click('.cms-drawer-close');
const before = await state(p);
await click('.cms-manage-button[data-cms-manage="sample.grid"]');
ok(/Grid cards/.test(await p.locator('.cms-publish-dialog:visible').innerText()), 'Manage cards');
await click('[data-action="delete"]'); await click('.cms-manage-danger'); await click('.cms-publish-dialog button:text-is("Done")');
ok((await state(p)).count === '7', 'deleting a card changes the count');
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
ok((await state(p)).count === '8', 'and undo brings it back');
await click('.cms-add-tile'); await click('.cms-drawer-close'); if (await p.locator('[data-choice="save"]').isVisible()) await click('[data-choice="save"]', 800);
s = await state(p);
ok(s.count === '9' && s.inside, 'adding one too');

// ── Layout Mode ──
await click('#cms-admin-button', 400); await click('button[data-mode="layout"]', 900);
ok((await p.locator('.cms-layout-type option').allTextContents()).join().includes('Page Heading,Card Grid'), 'both are offered (local server)');
if (shots) await p.screenshot({ path: shots + '/layout-mode.png' });
const hit = id => p.locator(`.atlas-edit-hit[data-widget-id="${id}"]`);
ok(await p.evaluate(() => { const a = document.querySelector('.atlas-edit-hit[data-widget-id="grid"]').getBoundingClientRect(), b = document.querySelector('[data-widget-id="grid"].atlas-grid-slot').getBoundingClientRect(); return Math.abs(a.height - b.height) < 1; }), 'the grown widget’s outline covers all of it');
await hit('grid').focus(); await p.waitForTimeout(200);
ok(/grows with its content/.test(await p.locator('.cms-layout-info').innerText()), 'the inspector says it grows');
await hit('spotlight').focus(); for (let i = 0; i < 9; i++) await p.keyboard.press('ArrowDown');
await p.waitForTimeout(200);
ok(/would overlap Card Grid/.test(await status()), 'a widget can’t be moved onto it');
// By pointer, to below everything: refused, with the reason, and nothing moved.
const where = async id => (await p.evaluate(i => document.querySelector(`.atlas-edit-hit[data-widget-id="${i}"]`).getAttribute('aria-label'), id));
async function drag(id, dy, grab = 0.5) { await hit(id).scrollIntoViewIfNeeded(); const b = await hit(id).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height * grab; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x, y + 6); await p.mouse.move(x, y + dy / 2, { steps: 4 }); await p.mouse.move(x, y + dy, { steps: 6 }); await p.waitForTimeout(200); const preview = await p.evaluate(() => { const n = document.querySelector('.atlas-edit-preview'); return n && !n.hidden ? n.dataset.state + ' ' + n.textContent : ''; }); await p.mouse.up(); await p.waitForTimeout(300); return preview; }
const at = await where('spotlight');
const list = await hit('grid').boundingBox(), spot = await hit('spotlight').boundingBox();
const pv = await drag('spotlight', list.y + list.height + 30 - spot.y);
ok(/^invalid/.test(pv) && await where('spotlight') === at, 'dragged under a growing widget: shown as refused, not moved');
ok(/grows with its content, so nothing can go below it/.test(await status()), 'and said why: ' + (await status()).slice(0, 60));
const w0 = await where('grid');
const row = t => +/row (\d+)/.exec(t)[1], rows = t => +/by (\d+)/.exec(t)[1];
await p.setViewportSize({ width: 1440, height: 2000 }); await p.waitForTimeout(400);   // no automatic scrolling
const px = await p.evaluate(() => { const n = document.querySelector('.atlas-edit-canvas'); return (23.43 + 16) * n.getBoundingClientRect().width / n.offsetWidth; });
await drag('grid', px * 3, 0.9);
const w1 = await where('grid');
ok(row(w1) === row(w0) + 3, 'grabbed in its grown part, it follows the pointer by whole rows: ' + w1);
// Its bottom handle is at its grown edge; dragging it down makes it taller.
await hit('grid').focus(); await p.waitForTimeout(150);
const handle = await p.locator('.atlas-edit-selection .atlas-edit-handle[data-handle="bottom"]').boundingBox(), whole = await hit('grid').boundingBox();
ok(Math.abs(handle.y + handle.height / 2 - whole.y - whole.height) < 12, 'its handles are on its grown edge');
await p.mouse.move(handle.x + 4, handle.y + handle.height / 2); await p.mouse.down(); await p.mouse.move(handle.x + 4, handle.y + handle.height / 2 + px * 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300);
ok(rows(await where('grid')) === rows(w1) + 2 && row(await where('grid')) === row(w1), 'resized from there: ' + await where('grid'));
await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
await p.selectOption('.cms-layout-type', 'feature-hero'); await click('.cms-layout-bar button:text-is("Add widget")', 500);
ok(/Not allowed|no room/i.test(await status()) && /Move it down first/.test(await status()), 'no room above: said what to do');
await hit('grid').focus(); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowDown'); await p.waitForTimeout(200);
await click('.cms-layout-bar button:text-is("Add widget")', 500);
ok(/^Added Featured Game/.test(await status()), 'after moving it down, there is room above');
await p.selectOption('.cms-layout-type', 'page-heading'); await hit('grid').focus(); for (let i = 0; i < 12; i++) await p.keyboard.press('ArrowDown'); await click('.cms-layout-bar button:text-is("Add widget")', 500);
ok(/^Added Page Heading/.test(await status()) && await p.locator('.cms-layout-bar button:text-is("Edit heading")').isEnabled() && await p.locator('.cms-layout-bar button:text-is("Manage cards")').isDisabled(), 'a second heading is added; it has fields, not cards');
ok((await p.evaluate(() => [...document.querySelectorAll('.page-heading-title')].map(h => h.tagName).sort().join())) === 'H1,H2', 'and is an h2');
await hit('heading-2').focus(); for (let i = 0; i < 4; i++) await p.keyboard.press('Shift+ArrowLeft'); await p.waitForTimeout(200);
ok(/16 × /.test(await p.locator('.cms-layout-info').innerText()), 'resized by keyboard');
for (let i = 0; i < 20; i++) await p.keyboard.press('Shift+ArrowLeft'); await p.waitForTimeout(200);
const cells = /(\d+) × (\d+) cells/.exec(await p.locator('.cms-layout-info').innerText());
ok(+cells[1] >= 5 && +cells[1] < 16, 'down to its minimum: ' + cells[0]);
await hit('heading-2').focus(); await click('.cms-layout-bar button:text-is("Remove widget")', 400);
ok(await hit('heading-2').count() === 0, 'removed');
await click('.cms-layout-float button', 400);
ok(await hit('heading-2').count() === 1, 'undo brings it back');
await click('.cms-layout-bar button:text-is("Save Draft")', 900);
ok(/Draft saved/.test(await status()), 'saved');
await click('.cms-layout-bar button:text-is("Done")');
await click('#cms-admin-button', 500); await click('.cms-admin-publish', 900);
const review = await p.locator('.cms-publish-dialog:visible').innerText();
ok(/Page heading/i.test(review) && /Card Grid/.test(review), 'the review lists them');
const box = p.locator('.cms-publish-dialog input[type="checkbox"]').filter({ visible: true }); if (await box.count()) await box.first().check();
await click('.cms-publish-dialog button:text-is("Publish now")', 1300);
ok(!!live.sample, 'published'); ok(!c.errs.length, 'no errors ' + c.errs); await c.close();
c = await ctx({ size: [1440, 1000] }); p = await open(c, '/sample/');
s = await state(p);
ok(s.h1.join() === 'All games' && s.count === '9' && s.inside, 'a guest sees the published page'); await c.close();

// ── The homepage, with the database as it is now (0014's types) ──
const db = await database();
c = await context(browser, { size: [1440, 1000], answer: db.answer, storage: { paSidebarCollapsed: '0' } }); p = await open(c, '/', 'admin', 1800);
await click('#cms-admin-button'); await click('.cms-admin-switch', 900); await click('button[data-mode="layout"]', 900);
await p.selectOption('.cms-layout-type', 'card-grid'); await p.selectOption('.cms-layout-region', 'lower'); await click('.cms-layout-bar button:text-is("Add widget")', 500);
ok(/^Added Card Grid/.test(await status()), 'homepage: it can be tried');
await click('.cms-layout-bar button:text-is("Save Draft")', 900);
ok(/can’t store one of the added widgets yet/.test(await status()), 'homepage: saving says the server can’t store it, and stores nothing');
ok((await db.env.db.query('select count(*)::int as n from public.site_content_versions')).rows[0].n === 0, 'nothing was stored');
await click('.cms-layout-float button', 400);
ok(await p.locator('.card-grid').count() === 0, 'undo leaves the homepage as it was');
ok(!c.errs.length, 'no errors ' + c.errs); await c.close();
// Anywhere but the local server they aren't offered.
c = await context(browser, { size: [1440, 1000], answer: db.answer }); await c.addInitScript(() => Object.defineProperty(window, 'PERGAMON_ENV', { value: 'preview', writable: false })); p = await open(c, '/', 'admin', 1800);
await click('#cms-admin-button'); await click('.cms-admin-switch', 900); await click('button[data-mode="layout"]', 900);
ok(!(await p.locator('.cms-layout-type option').allTextContents()).some(t => /Page Heading|Card Grid/.test(t)), 'staging and production don’t offer them'); await c.close();

await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
