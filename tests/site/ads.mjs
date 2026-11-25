// Advertising on the nine pages that have it (scripts/ads.js). Needs the local
// development server; the database and sign-in are stand-ins (lib.mjs), and the ad
// script itself never loads (the server's policy): what is checked is whether a page
// asks for it.
//
//   node tests/site/ads.mjs
//
// Guests and members get ads, administrators none, and nobody does while the question
// is open or when it can't be answered; sign-in and sign-out on the page; that no page
// has the tag in its HTML; that the other pages have none.
import { chromium, context, open, SITE } from './lib.mjs';

let bad = 0;
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
const PAGES = ['/games/', ...['battleship', 'blackjack', 'breakout', 'chess-forge', 'connect-four', 'pong', 'snake', 'tic-tac-toe'].map(g => `/games/${g}/`)];
const OTHER = ['/', '/settings/', '/account/', '/updates/', '/handbook/', '/studio/'];
const TOKEN = { 'sb-aaaaaaaaaaaaaaaaaaaa-auth-token': '{}' };
const answer = (role, fn) => (fn === 'get_draft' ? { data: { draft: null, published: null } } : { data: fn === 'get_published_content' ? null : [] });
const browser = await chromium.launch();
const ctx = (role, o = {}) => context(browser, Object.assign({ answer, storage: role === 'guest' ? {} : TOKEN }, o));
const ads = p => p.evaluate(() => [...document.querySelectorAll('script[src*="googlesyndication"]')].map(s => s.src + (s.async ? ' async' : '') + ' ' + s.crossOrigin));
const TAG = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4717716734064612 async anonymous';

for (const url of PAGES) {
  const html = await (await fetch(SITE + url)).text();
  ok(!/googlesyndication/.test(html) && (html.match(/<script defer src="\/scripts\/ads\.js" data-client="ca-pub-4717716734064612"><\/script>/g) || []).length === 1, `${url}: the one tag, ours`);
  for (const [role, want] of [['guest', 1], ['user', 1], ['admin', 0]]) {
    const c = await ctx(role), p = await open(c, url, role, role === 'guest' ? 900 : 1400), got = await ads(p);
    ok(got.length === want && got.every(s => s === TAG), `${url} ${role}: ${want ? 'the same ad script as before, once' : 'none'}`);
    const errs = c.errs.filter(e => !/googlesyndication|lichess/.test(e));
    if (errs.length) ok(false, `${url} ${role}: ${errs}`);
    await c.close();
  }
}
for (const url of OTHER) { const c = await ctx('guest'), p = await open(c, url, 'guest', 900); ok(!(await ads(p)).length && !(await p.evaluate(() => [...document.scripts].some(s => /ads\.js/.test(s.src)))), `${url}: no ads, as before`); await c.close(); }

// Who is here, when that can't be told.
const broken = async (what, role, script, want, wait = 1500) => {
  const c = await ctx(role);
  await c.addInitScript(script);
  const p = await open(c, '/games/pong/', role, wait), got = await ads(p);
  ok(got.length === want, `${what}: ${want ? 'ads' : 'none'}`);
  await c.close();
};
const over = body => `(() => { let client; Object.defineProperty(window, 'PergamonSupabaseClient', { configurable: true, get: () => client, set: c => { client = c; ${body} } }); })();`;
await broken('the administrator check fails (an error)', 'user', over("const r = c.rpc; c.rpc = (n, a) => n === 'is_admin' ? Promise.resolve({ error: { message: 'no' } }) : r(n, a);"), 0);
await broken('the administrator check never arrives (a rejection)', 'user', over("const r = c.rpc; c.rpc = (n, a) => n === 'is_admin' ? Promise.reject(new Error('offline')) : r(n, a);"), 0);
await broken('it is never answered', 'user', over("const r = c.rpc; c.rpc = (n, a) => n === 'is_admin' ? new Promise(() => {}) : r(n, a);"), 0);
await broken('an odd answer', 'user', over("const r = c.rpc; c.rpc = (n, a) => n === 'is_admin' ? Promise.resolve({ data: null }) : r(n, a);"), 0);
await broken('the session can’t be read (an error)', 'guest', over("c.auth.getSession = () => Promise.resolve({ data: { session: null }, error: { message: 'x' } });"), 0);
await broken('the session is never reported', 'guest', over('c.auth.getSession = () => new Promise(() => {});'), 0);
await broken('no auth client', 'guest', "Object.defineProperty(window, 'PergamonAuth', { get: () => undefined, set() {} });", 0);
await broken('an administrator’s stored claim changes nothing', 'admin', "try { sessionStorage.setItem('pa-cms-admin', 'x'); localStorage.setItem('role', 'guest'); } catch (e) {}", 0);

// Signing in and out on the page.
let c = await ctx('admin'), p = await open(c, '/games/', 'admin', 1500);
ok(!(await ads(p)).length, 'an administrator: none');
await p.evaluate(() => window.__role('guest')); await p.waitForTimeout(900);
ok((await ads(p)).length === 1, 'signed out: the next visitor of this page is a guest');
await p.evaluate(() => window.__role('admin')); await p.waitForTimeout(900);
ok((await ads(p)).length === 1, 'signed in again: never a second time');
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500);
ok(!(await ads(p)).length, 'and none from the next page on'); await c.close();
// Admin Mode’s previews show the page, not ads.
c = await ctx('admin', { size: [1440, 900] }); p = await open(c, '/games/', 'admin', 1800);
await p.click('#cms-admin-button'); await p.click('.cms-admin-switch'); await p.waitForTimeout(900); await p.click('.cms-admin-view[data-view="guest"]'); await p.waitForTimeout(900);
ok(!(await ads(p)).length, 'View as Guest: none, it is an administrator'); await c.close();

await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
