// A second page on the shared page code: a made-up page ("sample") is added to
// the registry in this browser only, and drawn and edited by the same scripts
// as the homepage. Needs the local development server; the database is a small
// stand-in here, and the sign-in another (lib.mjs).
//
//   node tests/site/second-page.mjs
//
// Checks that the page keeps its own content, cache and draft, uses its own
// component ids, takes Site Navigation from the homepage's document (and can't
// edit it), and that nothing of it reaches the homepage.
import { chromium, context, open, SITE } from './lib.mjs';

let bad = 0;
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
const html = (await (await fetch(SITE + '/')).text()).replace('data-atlas-page="home"', 'data-atlas-page="sample"').replace('<script src="/scripts/home.js"></script>', '<script src="/sample.js"></script>');
const registry = (await (await fetch(SITE + '/scripts/cms/pages.js')).text()).replace('const PAGES = {', `const PAGES = {
    sample: { id: 'sample', name: 'Sample page', noun: 'sample page', prefix: 'sample', schemas: [2], schemaVersion: 2, siteNavigation: false,
      regions: () => [{ id: 'main', frame: 'sidebar', rowHeight: 23.43, widgets: [{ id: 'spotlight', type: 'feature-spotlight', col: 1, row: 1, cols: 20, rows: 5 }, { id: 'carousel', type: 'carousel', col: 1, row: 6, cols: 20, rows: 11 }] }] },`);
const doc = title => ({ schema: 2, regions: [{ id: 'main', frame: 'sidebar', rowHeight: 23.43, widgets: [{ id: 'spotlight', type: 'feature-spotlight', col: 1, row: 1, cols: 20, rows: 5 }, { id: 'carousel', type: 'carousel', col: 1, row: 6, cols: 20, rows: 11 }] }],
  components: { 'sample.spotlight': { title, cta: 'Go', href: '/games/' }, 'sample.carousel': { order: ['snake'] }, 'sample.carousel.snake': { title: 'Snake', category: 'Arcade', href: '/games/snake/' } } });
const script = `PergamonPages.mount({ heading: 'Sample', document: ${JSON.stringify(doc('Built in'))}, settings: { explore: { sections: [{ id: 'games', title: 'Games here', icon: 'games', component: 'sample.carousel' }] } } });`;
const nav = { sections: [{ items: [{ id: 'home', label: 'From the homepage', icon: 'home', href: '/', visible: true }] }] };
const home = { schema: 1, components: { 'home.featured': { title: 'Home card', cta: 'Play', href: '/games/' }, 'home.spotlight': { title: 'Home second', cta: 'Play', href: '/games/' }, 'home.carousel': { order: [] }, 'site.sidebar': nav } };
const live = { home: { page: 'home', version: 3, schema: 1, content: home, media: {} }, sample: null };
const server = { draft: null, id: 100, saves: [] };
const answer = (role, fn, a) => {
  if (fn === 'get_published_content') return { data: live[a.p_page] || null };
  if (role !== 'admin') return { error: { code: 'PT403', message: 'forbidden' } };
  const published = live[a.p_page] ? { id: live[a.p_page].version, content: live[a.p_page].content } : null;
  if (fn === 'get_draft') return { data: { page: a.p_page, draft: server.draft, published } };
  if (fn === 'save_draft') { server.saves.push(a); server.draft = { id: ++server.id, content: a.p_content, created_at: new Date().toISOString(), based_on_published_id: null }; return { data: { draft_id: server.id } }; }
  if (fn === 'publish') { live[a.p_page] = { page: a.p_page, version: 200, schema: 2, content: server.draft.content, media: {} }; server.draft = null; return { data: { version: 200, previous_version: null } }; }
  return { data: [] };
};
const browser = await chromium.launch();
async function ctx(o = {}) {
  const c = await context(browser, Object.assign({ answer, storage: { paSidebarCollapsed: '0' } }, o));
  await c.route('**/sample/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await c.route('**/sample.js', r => r.fulfill({ contentType: 'text/javascript', body: script }));
  await c.route('**/scripts/cms/pages.js', r => r.fulfill({ contentType: 'text/javascript', body: registry }));
  return c;
}
const text = p => p.evaluate(() => document.querySelector('.home').innerText.replace(/\s+/g, ' '));
const links = p => p.evaluate(() => [...document.querySelectorAll('.pa-sidebar-nav a')].map(a => a.textContent.trim()));

let c = await ctx(), p = await open(c, '/sample/');
ok(/Built in/.test(await text(p)) && /Games here/.test(await text(p)) && /Snake/.test(await text(p)), 'a guest sees the built-in page');
ok(c.calls.includes('guest get_published_content sample') && c.calls.includes('guest get_published_content home'), 'its content and Site Navigation are both asked for');
ok((await links(p)).join() === 'From the homepage', 'Site Navigation is the homepage’s');
ok(await p.evaluate(() => document.querySelector('.home').firstElementChild.textContent === 'Sample' && !!document.querySelector('.home > .pa-sidebar.is-inline')), 'its own heading, and the inline sidebar');
live.sample = { page: 'sample', version: 9, schema: 2, content: doc('Published'), media: {} };
await p.reload(); await p.waitForTimeout(900);
ok(/Published/.test(await text(p)), 'published content is drawn');
ok(await p.evaluate(() => Object.keys(localStorage).some(k => k.indexOf('pa-cms-sample:') === 0)) && !await p.evaluate(() => Object.keys(localStorage).some(k => k.indexOf('pa-cms-home:') === 0)), 'and kept in its own cache');
live.sample.content = home;                                        // a schema it may not have
await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(900);
ok(/Built in/.test(await text(p)), 'a document of another page (or schema) is refused');
live.sample = null;
await p.goto(SITE + '/'); await p.waitForTimeout(900);
ok(/Home card/.test(await text(p)) && !/Built in|Published/.test(await text(p)), 'the homepage is untouched');
ok(!c.errs.length, 'no errors ' + c.errs); await c.close();

c = await ctx(); p = await open(c, '/sample/', 'admin', 1800);
await p.click('#cms-admin-button'); await p.click('.cms-admin-switch'); await p.waitForTimeout(900);
const panel = await p.locator('#cms-admin-panel').innerText();
ok(/sample page/.test(panel) && !/homepage|Site Navigation/i.test(panel), 'Admin Mode names this page, without Site Navigation');
await p.click('#cms-admin-button');
ok(await p.locator('.cms-nav-pencil').count() === 0, 'no Site Navigation pencil');
const labels = await p.locator('.cms-edit-pencil, .cms-manage-button, .cms-add-tile').evaluateAll(n => n.map(b => b.getAttribute('aria-label')));
ok(['Edit spotlight card: Built in', 'Edit carousel card: Snake', 'Manage spotlight cards (0 saved)', 'Manage carousel cards (1)', 'Add carousel card'].every(l => labels.includes(l)), 'its widgets have their controls');
await p.click('.cms-edit-pencil[data-cms-edit="sample.spotlight"]'); await p.fill('.cms-drawer [name="title"]', 'Edited'); await p.click('.cms-drawer-primary[type="submit"]'); await p.waitForTimeout(700);
ok(server.saves.length === 1 && server.saves[0].p_page === 'sample' && server.saves[0].p_content.components['sample.spotlight'].title === 'Edited', 'a card is saved to this page’s draft');
await p.click('.cms-drawer-close'); await p.waitForTimeout(300);
await p.click('#cms-admin-button'); await p.click('button[data-mode="layout"]'); await p.waitForTimeout(900);
await p.selectOption('.cms-layout-type', 'feature-hero'); await p.click('.cms-layout-bar button:text-is("Add widget")'); await p.waitForTimeout(500);
await p.click('.cms-layout-bar button:text-is("Save Draft")'); await p.waitForTimeout(800);
const saved = server.saves[1] && server.saves[1].p_content;
ok(saved && !!saved.components['sample.featured'] && saved.regions[0].widgets.length === 3, 'Layout Mode adds a widget with this page’s ids');
ok(!Object.keys(saved.components).some(k => !k.startsWith('sample.')), 'and nothing of another page’s');
await p.click('.cms-layout-bar button:text-is("Done")'); await p.waitForTimeout(300);
await p.click('#cms-admin-button'); await p.waitForTimeout(400); await p.click('.cms-admin-publish'); await p.waitForTimeout(800);
const review = await p.locator('.cms-publish-dialog:visible').innerText();
ok(/sample page/.test(review) && !/homepage/.test(review), 'the review names this page');
const box = p.locator('.cms-publish-dialog input[type="checkbox"]:visible'); if (await box.count()) await box.first().check();
await p.click('.cms-publish-dialog button:text-is("Publish now")'); await p.waitForTimeout(1200);
ok(live.sample && live.sample.version === 200 && live.home.version === 3, 'publishing publishes this page only');
ok((await links(p)).join() === 'From the homepage', 'and leaves Site Navigation alone');
ok(!(await p.evaluate(() => Object.keys(sessionStorage).some(k => /:home$/.test(k)))), 'no working copy of the homepage');
ok(!c.errs.length, 'no errors ' + c.errs); await c.close();

await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
