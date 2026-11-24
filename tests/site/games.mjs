// The Games page: what visitors see. Needs the local development server; the
// database and sign-in are stand-ins (lib.mjs).
//
//   node tests/site/games.mjs [folder for pictures]
//
// The eight games with their destinations, artwork and availability, the stored
// visibility overrides, the shared header, sidebar and footer, every width, palette
// and mode, the floating sidebar's height, keyboard, the ad tag, and that nothing of
// the old page or of Admin Mode is loaded.
import { chromium, context, open, SITE } from './lib.mjs';

let bad = 0;
const shots = process.argv[2];
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
const GAMES = [['tic-tac-toe', 'Tic-Tac-Toe', 'Classic'], ['connect-four', 'Connect Four', 'Strategy'], ['chess-forge', 'Chess Forge', 'Strategy'], ['battleship', 'Battleship', 'Strategy'], ['blackjack', 'Blackjack', 'Card'], ['snake', 'Snake', 'Arcade'], ['breakout', 'Breakout', 'Arcade'], ['pong', 'Pong', 'Arcade']];
const nav = { sections: [{ items: [{ id: 'games', label: 'All the games', icon: 'games', href: '/games/', visible: true }] }] };
const links16 = { sections: [0, 1].map(s => ({ items: Array.from({ length: 8 }, (_, i) => ({ id: `l${s}-${i}`, label: `Link ${s}-${i}`, icon: 'home', href: '/settings/', visible: true })) })) };
const homeWith = sidebar => ({ page: 'home', version: 3, schema: 1, media: {}, content: { schema: 1, components: { 'site.sidebar': sidebar } } });
const answer = sidebar => (role, fn, a) => ({ data: fn === 'get_published_content' && a.p_page === 'home' && sidebar ? homeWith(sidebar) : null });
const browser = await chromium.launch();
async function ctx(o = {}) {
  const c = await context(browser, Object.assign({ answer: answer(o.sidebar) }, o));
  if (shots) await c.unroute(/fonts\.g/);
  c.requests = [];
  c.on('request', r => c.requests.push(r.url()));
  if (o.overrides) await c.route(/atlas_visibility_overrides/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(o.overrides) }));
  return c;
}
// The ad tag can't load locally (the server's own policy): expected, and not the page's.
const errs = c => c.errs.filter(e => !/googlesyndication/.test(e));
const see = p => p.evaluate(() => {
  const box = s => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; };
  return {
    cards: [...document.querySelectorAll('.card-grid .home-tile')].map(a => [a.getAttribute('href'), a.querySelector('.home-tile-title').textContent, a.querySelector('.home-tile-category').textContent, (a.querySelector('img') || {}).naturalWidth || 0]),
    count: (document.querySelector('.page-heading-count-num') || {}).textContent, h1: [...document.querySelectorAll('h1')].map(h => h.textContent), state: document.querySelector('.home-region').dataset.atlasState,
    sidebar: box('.pa-sidebar'), region: box('.home-region'), grid: box('.card-grid'), last: [...document.querySelectorAll('.card-grid-item')].pop().getBoundingClientRect().bottom + scrollY, nav: [...document.querySelectorAll('.pa-sidebar-nav a')].map(a => [a.textContent.trim(), a.className]),
    inline: document.querySelector('.pa-sidebar').classList.contains('is-inline'), header: [...document.querySelectorAll('.pa-header a')].map(a => a.getAttribute('href') + (a.getAttribute('aria-current') || '')), footer: document.querySelector('#footer-placeholder').innerText.length > 10, over: document.documentElement.scrollWidth > innerWidth
  };
});
const want = list => JSON.stringify(GAMES.filter(g => list.includes(g[0])).map(([id, n, c]) => [`/games/${id}/`, n, c]));
const got = s => JSON.stringify(s.cards.map(c => c.slice(0, 3)));
const ALL = GAMES.map(g => g[0]);

let c = await ctx({ size: [1440, 1000], storage: { paSidebarCollapsed: '0' }, sidebar: nav }), p = await open(c, '/games/', 'guest', 1500);
await p.evaluate(() => document.querySelectorAll('.card-grid img').forEach(i => { i.loading = 'eager'; })); await p.waitForTimeout(600);
let s = await see(p);
ok(got(s) === want(ALL), 'the eight games, in their order, with their destinations and categories');
ok(s.cards.every(x => x[3] === 640), 'each with its artwork');
ok(s.count === '8' && s.h1.join() === 'Games', 'the heading is the h1 and counts them');
ok(s.inline && s.nav.length === 1 && s.nav[0][0] === 'All the games' && /active/.test(s.nav[0][1]), 'the inline sidebar, with the published Site Navigation, marking this page');
ok(s.header.some(h => /^\/games\/page/.test(h)) && s.footer, 'the shared header marks Games; the footer is there');
ok(Math.abs(s.sidebar.y - s.region.y) < 1 && Math.abs(s.sidebar.h - 417.73) < 1 && s.region.h > 600, `the sidebar is a 418px panel at the top (${s.sidebar.h})`);
ok(s.state === 'grid' && s.last <= s.grid.y + s.grid.h, 'nothing is clipped');
ok(await p.evaluate(() => getComputedStyle(document.body).fontFamily.includes('Manrope')), 'the site’s type, not the old page’s');
const own = c.requests.filter(u => u.startsWith(SITE)).map(u => u.slice(SITE.length));
ok(!own.some(u => /main\.css|legacy-frame|cms\/(admin|loader|workspace)|handbook\/|studio\//.test(u)), 'nothing of the old page or of Admin Mode is loaded');
ok(c.calls.join() === 'guest get_published_content home', 'one content request: Site Navigation');
ok(await p.evaluate(() => document.head.querySelector('script[async]').src.includes('adsbygoogle.js?client=ca-pub-4717716734064612')), 'the ad tag is where it was');
if (shots) await p.screenshot({ path: shots + '/games-1440.png', fullPage: true });
for (const [id] of GAMES) { const r = await p.request.get(`${SITE}/games/${id}/`); if (r.status() !== 200) ok(false, id + ' answers ' + r.status()); }
await p.click('.home-tile[href="/games/snake/"]'); await p.waitForTimeout(500);
ok(new URL(p.url()).pathname === '/games/snake/', 'a card opens its game');
ok(!errs(c).filter(e => !/snake/.test(e)).length, 'no errors ' + errs(c)); await c.close();

// Availability and stored overrides: the same answer the old page gave.
const entry = (p1, v) => ({ path: p1, visibility: v });
for (const [role, overrides, list, what] of [
  ['guest', [entry('/games/pong', 'admin')], ALL.filter(g => g !== 'pong'), 'a game an administrator hid isn’t listed, and isn’t counted'],
  ['user', [entry('/games/pong', 'admin'), entry('/games/snake', 'admin')], ALL.filter(g => g !== 'pong' && g !== 'snake'), 'nor for members'],
  ['guest', [], ALL, 'without overrides, the records decide']
]) {
  c = await ctx({ overrides }); p = await open(c, '/games/', role, 1500); s = await see(p);
  ok(got(s) === want(list) && s.count === String(list.length), what); ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();
}
c = await ctx(); await c.route(/atlas_visibility_overrides/, r => r.abort()); p = await open(c, '/games/', 'guest', 1500);
ok(got(await see(p)) === want(ALL), 'when they can’t be read, the records decide'); await c.close();
c = await ctx(); await c.route('**/data/entries.js', async r => { const t = await (await r.fetch()).text(); r.fulfill({ contentType: 'text/javascript', body: t.replace("game('pong', 'Pong', 'Arcade')", "game('pong', 'Pong', 'Arcade', { availability: 'hidden' })").replace("game('snake', 'Snake', 'Arcade')", "game('snake', 'Snake', 'Arcade', { availability: 'archived' })").replace("    game('blackjack', 'Blackjack', 'Card'),\n", '').replace("    game('blackjack', 'Blackjack', 'Card'),\r\n", '') }); });
p = await open(c, '/games/', 'guest', 1500); s = await see(p);
ok(got(s) === want(ALL.filter(g => !['pong', 'snake', 'blackjack'].includes(g))) && s.count === '5', 'hidden, archived and missing records leave the rest of the page as it is'); ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();

// Widths.
for (const collapsed of ['0', '1']) {
  c = await ctx({ storage: { paSidebarCollapsed: collapsed } }); p = await open(c, '/games/');
  for (const w of [1920, 1440, 1280, 1000, 901, 900, 768, 560, 390, 320]) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(300); s = await see(p);
    const columns = await p.evaluate(() => getComputedStyle(document.querySelector('.card-grid-list')).gridTemplateColumns.split(' ').length);
    ok(!s.over && s.last <= s.grid.y + s.grid.h + 1 && s.cards.length === 8 && (w > 900 ? s.state === 'grid' && Math.abs(s.sidebar.h - 417.73) < 1 : true) && (w > 640 || s.state === 'stack') && columns >= (w > 320 ? 2 : 1), `${w}px, sidebar ${collapsed === '1' ? 'collapsed' : 'expanded'}: ${s.state}, ${columns} columns`);
    if (shots && collapsed === '0' && [1000, 768, 390].includes(w)) await p.screenshot({ path: `${shots}/games-${w}.png`, fullPage: true });
  }
  await c.close();
}
// Themes, and the sidebar with more links than it has room for.
for (const palette of ['obsidian', 'sapphire', 'emerald', 'copper']) for (const mode of ['dark', 'light']) {
  c = await ctx({ size: [1440, 1000], theme: mode, storage: { 'pa-appearance': JSON.stringify({ palette, mode }), 'sb-aaaaaaaaaaaaaaaaaaaa-auth-token': '{}' } }); p = await open(c, '/games/', 'user');
  ok(await p.evaluate(([pal, m]) => { const r = document.documentElement, v = n => { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }; const bg = q => getComputedStyle(document.querySelector(q)).backgroundColor; return r.dataset.palette === pal && r.dataset.mode === m && bg('body') === v('--color-background') && bg('.card-grid') === v('--color-surface') && bg('.page-heading-emblem') === v('--color-accent'); }, [palette, mode]), `${palette} ${mode}`);
  if (shots && (palette + mode === 'obsidianlight' || palette + mode === 'sapphiredark')) await p.screenshot({ path: `${shots}/games-${palette}-${mode}.png`, fullPage: true });
  await c.close();
}
for (const url of ['/games/', '/']) for (const collapsed of ['0', '1']) {
  c = await ctx({ size: [1440, 1000], storage: { paSidebarCollapsed: collapsed }, sidebar: links16 });
  if (url === '/') await c.route(/get_published_content/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(Object.assign(homeWith(links16), { content: { schema: 1, components: { 'home.featured': { title: 'A', cta: 'B', href: '/games/' }, 'home.spotlight': { title: 'A', cta: 'B', href: '/games/' }, 'home.carousel': { order: [] }, 'site.sidebar': links16 } } })) }));
  p = await open(c, url);
  ok(await p.evaluate(() => { const b = document.querySelector('.pa-sidebar').getBoundingClientRect(), t = document.querySelector('.pa-sidebar-toggle').getBoundingClientRect(); return document.querySelectorAll('.pa-sidebar-nav a').length === 16 && t.bottom <= b.bottom && b.height > 500; }), `${url} sixteen links, ${collapsed === '1' ? 'collapsed' : 'expanded'}: the sidebar is taller, nothing spills`); await c.close();
}
// Keyboard.
c = await ctx({ size: [1440, 1000] }); p = await open(c, '/games/');
await p.locator('.home-tile').first().focus();
const order = []; for (let i = 0; i < 8; i++) { order.push(await p.evaluate(() => document.activeElement.getAttribute('href'))); await p.keyboard.press('Tab'); }
ok(order.join() === ALL.map(g => `/games/${g}/`).join(), 'Tab goes through the games in order');
await c.close();
await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
