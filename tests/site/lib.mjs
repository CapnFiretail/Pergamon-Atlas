// Browser checks of the site on the local development server
// (http://localhost:4173, docs/DEVELOPMENT.md), used by snapshot.mjs and
// admin.mjs. Playwright isn't a dependency of this repository: give the folder
// of an installed copy in PLAYWRIGHT_DIR, or it is found in npx's cache.
//
// Nothing leaves the machine: every Supabase request is answered here by an
// emulated PostgREST over the CMS tests' in-process Postgres with the real
// migrations. Sign-in is replaced by a stand-in (a role in sessionStorage), so
// this says nothing about real authentication; the database's own checks are
// the real ones.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SITE = 'http://localhost:4173';

function playwright() {
  const cache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'npm-cache/_npx');
  const dirs = [process.env.PLAYWRIGHT_DIR, ...(existsSync(cache) ? readdirSync(cache).map(d => path.join(cache, d, 'node_modules/playwright')) : [])];
  const dir = dirs.find(d => d && existsSync(path.join(d, 'package.json')));
  if (!dir) throw new Error('Playwright not found: set PLAYWRIGHT_DIR to its folder.');
  return createRequire(path.join(dir, 'index.js'))(dir);
}
export const { chromium } = playwright();

const IMAGE = readFileSync(path.join(ROOT, 'PergamonAtlas.V1/images/featured/chess-forge-960.webp'));
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-role, apikey, authorization, content-type, x-client-info, content-profile, accept-profile, prefer, x-supabase-api-version, x-retry-count', 'access-control-allow-methods': '*' };
const ARGS = {
  get_published_content: ['p_page'], get_draft: ['p_page'], save_draft: ['p_page', 'p_content', 'p_expected_draft_id', 'p_note'],
  publish: ['p_page', 'p_draft_id', 'p_expected_published_id'], rollback: ['p_page', 'p_version_id', 'p_expected_published_id'],
  list_published_versions: ['p_page', 'p_limit'], get_media: ['p_ids']
};
const plain = v => (v === undefined ? null : v && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
// The emulated database, with every migration and two administrators.
export async function database() {
  const { createEnv } = await import('../cms/supabase-env.mjs');
  const env = await createEnv({ extra: ['0013_site_sidebar', '0014_page_layout', '0015_studio_documents'] });
  const who = { admin: await env.createUser('a@x.test', { admin: true }), second: await env.createUser('b@x.test', { admin: true }), user: await env.createUser('u@x.test'), guest: env.anon };
  return { env, answer: (role, fn, args) => env.rpc(who[role], fn, ...ARGS[fn].map(n => plain(args[n]))) };
}

const stub = `(function(){
  var cbs=[], role=function(){return sessionStorage.getItem('role')||'guest'};
  var c=window.supabase.createClient(window.PERGAMON_SUPABASE_URL, window.PERGAMON_SUPABASE_ANON_KEY);
  var real=c.rpc.bind(c);
  c.auth.getSession=function(){return Promise.resolve({data:{session:role()==='guest'?null:{user:{id:'u'}}}})};
  c.auth.onAuthStateChange=function(f){cbs.push(f);return {data:{subscription:{unsubscribe:function(){}}}}};
  c.rpc=function(n,a){ if(n==='is_admin')return Promise.resolve({data:role()==='admin'||role()==='second'}); return real(n,a).setHeader('x-role',role()); };
  window.PergamonSupabaseClient=c;
  window.__role=function(r){sessionStorage.setItem('role',r);cbs.forEach(function(f){f(r==='guest'?'SIGNED_OUT':'SIGNED_IN',r==='guest'?null:{})})};
})();`;

// A browser context whose Supabase is `answer(role, fn, args)` → { data } | { error },
// or null for no answer (the network is down).
export async function context(browser, { size = [1440, 900], answer, storage = {}, theme } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce', colorScheme: theme || 'dark' });
  ctx.errs = []; ctx.calls = [];
  await ctx.route(/fonts\.g/, r => r.fulfill({ contentType: 'text/css', body: '' }));
  await ctx.route(/auth\/supabase\.js/, r => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await ctx.route(/googlesyndication/, r => r.abort());
  await ctx.route(/supabase\.co/, async r => {
    const q = r.request(), url = new URL(q.url());
    if (url.host !== 'rambkiswuigtjfgdxexk.supabase.co') ctx.errs.push('not staging: ' + q.url());
    if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    if (url.pathname.startsWith('/storage/')) return r.fulfill({ contentType: 'image/webp', headers: CORS, body: IMAGE });
    const json = (status, body) => r.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
    const fn = (url.pathname.match(/rpc\/(\w+)/) || [])[1];
    if (!ARGS[fn]) return json(200, []);
    const args = q.method() === 'GET' ? Object.fromEntries(url.searchParams) : q.postDataJSON();
    const role = q.headers()['x-role'] || 'guest';
    ctx.calls.push([role, fn, args.p_page || ''].join(' '));
    const res = await answer(role, fn, args);
    if (!res) return r.abort('internetdisconnected');
    if (!res.error) return json(200, res.data);
    const m = /^PT(\d{3})$/.exec(res.error.code);
    return json(m ? +m[1] : 400, { code: res.error.code, message: res.error.message, details: null, hint: null });
  });
  await ctx.addInitScript(t => { try { for (const k in t) if (localStorage.getItem(k) === null) localStorage.setItem(k, t[k]); } catch (e) {} }, storage);
  return ctx;
}
export async function open(ctx, url = '/', role = 'guest', settle = 900) {
  const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  p.on('pageerror', e => ctx.errs.push(e.message));
  p.on('console', m => { if ((m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) || /Content Security/.test(m.text())) ctx.errs.push(m.text().slice(0, 200)); });
  await p.addInitScript(r => { if (!sessionStorage.getItem('role')) sessionStorage.setItem('role', r); }, role);
  await p.goto(SITE + url, { waitUntil: 'load' });
  await p.waitForTimeout(settle);
  return p;
}
