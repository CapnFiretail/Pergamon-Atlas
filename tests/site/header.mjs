// The shared header on every page, for guests, members and administrators. Needs
// the local development server; the database and sign-in are stand-ins (lib.mjs).
//
//   node tests/site/header.mjs [folder for pictures]
//
// The administrator controls (Studio, Handbook, Admin Mode): the same on every
// page, only after the server's answer, gone at sign-out; Admin Mode by what the
// page can do; every width; and that visitors get the header, requests and
// downloads they had.
import { chromium, context, open, SITE } from './lib.mjs';

let bad = 0;
const shots = process.argv[2];
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
const GAMES = ['battleship', 'blackjack', 'breakout', 'chess-forge', 'connect-four', 'pong', 'snake', 'tic-tac-toe'];
const PAGES = ['/', '/games/', ...GAMES.map(g => `/games/${g}/`), '/handbook/', '/studio/', '/settings/', '/account/', '/account/reset-password/', '/suggestions/', '/achievements/', '/leaderboards/', '/updates/'];
const NO_CLIENT = ['/suggestions/', '/achievements/', '/leaderboards/', '/updates/'];
const answer = (role, fn) => (fn === 'get_draft' ? { data: { draft: null, published: null } } : { data: fn === 'get_published_content' ? null : [] });
const TOKEN = { 'sb-aaaaaaaaaaaaaaaaaaaa-auth-token': '{}' };          // how theme.js knows someone is signed in, before asking
const browser = await chromium.launch();
async function ctx(role, o = {}) {
  const c = await context(browser, Object.assign({ answer, storage: role === 'guest' ? {} : TOKEN }, o));
  c.requests = [];
  c.on('request', r => { if (r.url().startsWith(SITE)) c.requests.push(new URL(r.url()).pathname); });
  return c;
}
const errs = c => c.errs.filter(e => !/googlesyndication/.test(e));
const head = p => p.evaluate(() => ({
  actions: [...document.querySelectorAll('.pa-header .pa-actions > *')].map(n => n.id || (n.className.match(/pa-(studio|handbook)-link|pa-search|pa-settings|pa-profile/) || [''])[0]),
  boxes: [...document.querySelectorAll('.pa-header .pa-actions > *')].map(n => { const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(); }),
  labels: [...document.querySelectorAll('.pa-admin-control')].map(n => [n.getAttribute('aria-label'), n.dataset.tip, n.getAttribute('aria-disabled') || '', n.getAttribute('aria-current') || '', n.getAttribute('href') || ''].join('|')),
  icons: [...document.querySelectorAll('.pa-admin-control')].map(n => n.querySelector('svg').innerHTML).join(' '),
  over: document.documentElement.scrollWidth > innerWidth, spill: (() => { const h = document.querySelector('.pa-header').getBoundingClientRect(); return [...document.querySelectorAll('.pa-header *')].some(n => { const r = n.getBoundingClientRect(); return r.width && r.right > h.right + 0.5 && !n.closest('.pa-nav'); }); })()
}));
const SITE_ACTIONS = ['pa-search', 'pa-settings', 'pa-profile'], ADMIN_ACTIONS = ['pa-studio-link', 'pa-handbook-link', 'cms-admin-button', ...SITE_ACTIONS];

// Guests and members.
for (const role of ['guest', 'user']) for (const url of PAGES) {
  const c = await ctx(role), p = await open(c, url, role, 900), h = await head(p);
  const admin = c.requests.filter(u => /admin-header|cms\/(?!content|library\.js|loader|pages|widgets|admin\.js)|studio\/(?!gate)|handbook\/(?!gate)/.test(u) && !u.endsWith('/'));
  const guestAccess = role === 'guest' && c.requests.some(u => u.endsWith('/admin-access.js')) && !['/', '/games/', '/handbook/', '/studio/'].includes(url);
  const guestClient = role === 'guest' && NO_CLIENT.includes(url) && c.requests.some(u => /vendor|auth\/auth/.test(u));
  const text = await p.evaluate(() => /\b(Studio|Handbook|Admin Mode)\b/.test(document.body.innerText));
  if (h.actions.join() !== SITE_ACTIONS.join() || admin.length || guestAccess || guestClient || text || errs(c).length) ok(false, `${role} ${url}: ${h.actions} ${admin} ${guestAccess} ${guestClient} ${text} ${errs(c)}`);
  await c.close();
}
ok(true, `guests and members: the site's own header on ${PAGES.length} pages, nothing of the controls shown or downloaded; guests download nothing more than before`);

// Administrators: the same on every page.
let first = null;
for (const url of PAGES) {
  const c = await ctx('admin'), p = await open(c, url, 'admin', 1900), h = await head(p);
  const here = { '/studio/': 0, '/handbook/': 1 }[url];
  const same = JSON.stringify([h.icons, h.boxes]);
  first = first || same;
  const admin = h.labels[2] || '';
  const right = h.actions.join() === ADMIN_ACTIONS.join() && same === first && h.labels[0].startsWith('Atlas Studio|Atlas Studio|') && h.labels[0].endsWith('|/studio/') && h.labels[1].startsWith('Atlas Handbook|Atlas Handbook|') && h.labels[1].endsWith('|/handbook/') &&
    [0, 1].every(i => h.labels[i].includes('|page|') === (here === i)) &&
    (['/', '/games/'].includes(url) ? admin.startsWith('Admin Mode: off|Admin Mode: off||') : admin.startsWith('Admin Mode: not available on this page|Admin Mode: not available on this page|true|'));
  if (!right || errs(c).length) ok(false, `${url}: ${JSON.stringify(h.labels)} ${h.actions} ${same === first} ${errs(c)}`);
  if (shots && ['/', '/games/', '/games/pong/', '/settings/'].includes(url)) await p.locator('.pa-header').screenshot({ path: `${shots}/header${url.replace(/\//g, '-')}.png` });
  await c.close();
}
ok(true, `administrators: Studio, Handbook, Admin Mode, in that order, place and look, on all ${PAGES.length} pages; Admin Mode is the editor's on the homepage and the Games page, unavailable elsewhere`);

// Unavailable is said, and does nothing.
let c = await ctx('admin'), p = await open(c, '/settings/', 'admin', 1500);
await p.click('#cms-admin-button', { force: true }); await p.waitForTimeout(150);
ok(await p.textContent('.pa-admin-note') === 'This page can’t be edited in Admin Mode yet.' && !(await p.locator('#cms-admin-panel').count()), 'pressed where there is no editor: says so, opens nothing');
await p.keyboard.press('Escape'); ok(await p.locator('.pa-admin-note').count() === 0, 'Escape closes it');
await p.focus('#cms-admin-button'); await p.keyboard.press('Enter'); ok(await p.locator('.pa-admin-note').count() === 1, 'by keyboard too');
await p.mouse.click(700, 700); ok(await p.locator('.pa-admin-note').count() === 0, 'and a press elsewhere closes it');
await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400); await p.click('#cms-admin-button', { force: true }); await p.waitForTimeout(150);
ok(await p.evaluate(() => { const r = document.querySelector('.pa-admin-note').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'on a phone it is on screen');
await p.click('.pa-studio-link'); await p.waitForTimeout(700); ok(new URL(p.url()).pathname === '/studio/', 'the Studio opens from any page');
await p.click('.pa-handbook-link'); await p.waitForTimeout(700); ok(new URL(p.url()).pathname === '/handbook/', 'and the Handbook');
ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();

// Only after the answer, and only for as long as it holds.
c = await ctx('admin');
await c.addInitScript(() => { window.__hold = new Promise(r => { window.__answer = r; }); });
await c.route(/auth\/supabase\.js/, async r => { const t = `(function(){var c=window.supabase.createClient(window.PERGAMON_SUPABASE_URL,window.PERGAMON_SUPABASE_ANON_KEY);c.auth.getSession=function(){return Promise.resolve({data:{session:{user:{id:'u'}}}})};c.auth.onAuthStateChange=function(){return{data:{subscription:{unsubscribe:function(){}}}}};var real=c.rpc.bind(c);c.rpc=function(n,a){return n==='is_admin'?window.__hold.then(function(){return{data:true}}):real(n,a)};window.PergamonSupabaseClient=c})();`; r.fulfill({ contentType: 'text/javascript', body: t }); });
for (const url of ['/', '/games/', '/suggestions/']) {
  p = await open(c, url, 'admin', 1300); const before = await head(p);
  const asked = !c.requests.some(u => /admin-header/.test(u));
  await p.evaluate(() => window.__answer()); await p.waitForTimeout(1500);
  ok(before.actions.join() === SITE_ACTIONS.join() && asked && (await head(p)).actions.join() === ADMIN_ACTIONS.join(), `${url}: nothing shown or downloaded before the answer`);
  c.requests.length = 0; await p.close();
}
await c.close();
for (const url of ['/', '/settings/', '/updates/']) {
  c = await ctx('admin'); p = await open(c, url, 'admin', 1800);
  await p.evaluate(() => window.__role('user')); await p.waitForTimeout(500);
  const demoted = (await head(p)).actions.join();
  await p.evaluate(() => window.__role('admin')); await p.waitForTimeout(1500);
  const back = await head(p);
  await p.evaluate(() => window.__role('guest')); await p.waitForTimeout(500);
  ok(demoted === SITE_ACTIONS.join() && back.actions.join() === ADMIN_ACTIONS.join() && (await head(p)).actions.join() === SITE_ACTIONS.join(), `${url}: another account, back, signed out`);
  if (url === '/') { await p.evaluate(() => window.__role('admin')); await p.waitForTimeout(1800); await p.click('#cms-admin-button'); await p.waitForTimeout(300); ok(await p.locator('#cms-admin-panel').isVisible() && await p.locator('#cms-admin-button').count() === 1, 'and Admin Mode works again after signing back in'); }
  ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();
}
// Signing in on a page shows them without a reload.
c = await context(browser, { answer }); c.requests = []; p = await open(c, '/account/', 'guest', 900);
await p.evaluate(() => window.__role('admin')); await p.waitForTimeout(1500);
ok((await head(p)).actions.join() === ADMIN_ACTIONS.join(), 'signing in shows them without a reload'); await c.close();
// The editor can't load: said, and the links still work.
c = await ctx('admin'); await c.route('**/scripts/cms/workspace.js', r => r.abort()); p = await open(c, '/', 'admin', 1800);
ok((await head(p)).labels[2].startsWith('Admin Mode: couldn’t load|'), 'an editor that couldn’t load is said'); await c.close();

// Every width.
for (const url of ['/', '/games/', '/games/pong/', '/handbook/']) {
  c = await ctx('admin'); p = await open(c, url, 'admin', 1800);
  const out = [];
  for (const w of [1920, 1280, 1100, 1000, 901, 900, 768, 601, 600, 490, 489, 420, 390, 360, 320]) { await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(80); const h = await head(p); if (h.spill || h.boxes.some(b => +b.split(',')[3] < 32) || (url !== '/games/pong/' && h.over)) out.push(w); if (shots && url === '/games/' && [1000, 600, 390, 320].includes(w)) await p.locator('.pa-header').screenshot({ path: `${shots}/header-games-${w}.png` }); }
  ok(!out.length, `${url}: the header fits at every width ${out}`); await c.close();
}
for (const role of ['guest', 'admin']) { c = await ctx(role, { size: [320, 800] }); p = await open(c, '/games/', role, 1500); ok(!(await head(p)).spill, `320px, ${role}`); await c.close(); }
await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
