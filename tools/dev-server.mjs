#!/usr/bin/env node
// The local development server: this repository's working files, uncommitted
// changes included, at http://localhost:4173 (docs/DEVELOPMENT.md). Node only,
// no dependencies. Read-only: it never writes to the repository.
//
//   loopback   listens on 127.0.0.1 and ::1 only, and answers only requests
//              addressed to localhost (no other site can reach it by rebinding
//              a name); 127.0.0.1 and [::1] redirect to localhost, the address
//              staging sign-in allows
//   staging    supabase-config.js is generated: the working copy's values if
//              they are the staging project's, otherwise "unconfigured" (no
//              accounts). An enforced content policy also keeps pages from
//              reaching the production project or the games' ad scripts (the one
//              other outside host is lichess1.org, the chess piece images)
//   Vercel     the redirects and headers of vercel.json, report-only policy
//              included, so a missing CSP hash shows here too
//   refresh    each page gets dev-reload.js, which hears about changed files
//              over /__dev/changes and decides what to do (its header)
//
// Usage: node tools/dev-server.mjs [--port 4173] [--log <file>]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, renderConfig } from './write-supabase-config.mjs';

export const PORT = 4173;
export const STAGING_REF = 'rambkiswuigtjfgdxexk';
const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(TOOLS);
const CONFIG = '/operation/scripts/auth/supabase-config.js';
const POLL_MS = 500;                   // only while a visible page is listening
const PING_MS = 25000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
};

// ── Staging only ────────────────────────────────────────────────────────
const STAGING = `https://${STAGING_REF}.supabase.co`;
export const POLICY = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com', `img-src 'self' data: blob: ${STAGING} https://lichess1.org`, `connect-src 'self' ${STAGING} wss://${STAGING_REF}.supabase.co`,
  "frame-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'"
].join('; ');

// The working copy's supabase-config.js, if it names the staging project.
export function stagingConfig(source) {
  const value = name => (new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`).exec(source) || [])[1] || '';
  try {
    const cfg = buildConfig({ VERCEL_ENV: 'development', PERGAMON_SUPABASE_URL: value('PERGAMON_SUPABASE_URL'), PERGAMON_SUPABASE_PUBLISHABLE_KEY: value('PERGAMON_SUPABASE_ANON_KEY') });
    if (cfg.url === STAGING) return renderConfig(cfg);
  } catch (e) { /* not usable: unconfigured */ }
  return renderConfig({ target: 'development', url: null, key: null });
}

// ── vercel.json ─────────────────────────────────────────────────────────
// Only the two source forms it uses: "/name/:path*{/}?" and plain patterns.
function vercelRules(repo) {
  const read = () => { try { return JSON.parse(readFileSync(path.join(repo, 'vercel.json'), 'utf8')); } catch (e) { return {}; } };
  return pathname => {
    const { redirects = [], headers = [] } = read();
    const redirect = redirects.find(r => {
      const base = /^(\/.+)\/:path\*\{\/\}\?$/.exec(r.source);
      return base && (pathname === base[1] || pathname.startsWith(base[1] + '/'));
    });
    const out = {};
    headers.forEach(h => { if (new RegExp(`^${h.source}$`).test(pathname)) h.headers.forEach(x => { out[x.key.toLowerCase()] = x.value; }); });
    return { redirect: redirect && redirect.destination, headers: out };
  };
}

// ── Changed files ───────────────────────────────────────────────────────
// When each file last changed, by size and modification time (so a sync client
// touching other attributes is not a change). Scanned when asked, not watched:
// it can't miss an event or go stale over a long run.
export function createFiles(site) {
  const known = new Map();             // '/path' → { stamp, at }
  function scan(first) {
    const now = Date.now(), seen = new Set();
    let entries;
    try { entries = readdirSync(site, { recursive: true, withFileTypes: true }); } catch (e) { return now; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const file = path.join(e.parentPath, e.name);
      let s;
      try { s = statSync(file); } catch (err) { continue; }
      const p = '/' + path.relative(site, file).replace(/\\/g, '/'), stamp = `${s.mtimeMs}:${s.size}`;
      seen.add(p);
      const k = known.get(p);
      if (!k || k.stamp !== stamp) known.set(p, { stamp, at: first ? s.mtimeMs : now });
    }
    known.forEach((k, p) => { if (!seen.has(p) && k.stamp !== 'gone') known.set(p, { stamp: 'gone', at: now }); });
    return now;
  }
  scan(true);
  return { scan: () => scan(false), since: t => [...known].filter(([, k]) => k.at > t).map(([p]) => p) };
}

// ── The server ──────────────────────────────────────────────────────────
export function createDevServer({ repo = REPO, port = PORT, log = () => {} } = {}) {
  const site = realpathSync.native(path.join(repo, 'PergamonAtlas.V1'));
  const rules = vercelRules(repo);
  const files = createFiles(site);
  const clients = new Set();           // { res, at }
  let poll = null, ping = null;

  // What changed since each page was last told. One scan for all of them.
  function tell(list) {
    const now = files.scan();
    list.forEach(c => {
      const changed = files.since(c.at);
      c.at = now;
      if (changed.length) c.res.write(`id: ${now}\ndata: ${JSON.stringify(changed)}\n\n`);
    });
  }
  function listen(req, res, url) {
    const since = Number(req.headers['last-event-id'] || url.searchParams.get('since'));
    const c = { res, at: since > 0 ? since : Date.now() };
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.write(`retry: 2000\nid: ${c.at}\ndata: []\n\n`);
    clients.add(c);
    tell([c]);
    poll = poll || setInterval(() => tell(clients), POLL_MS);
    ping = ping || setInterval(() => clients.forEach(x => x.res.write(':\n\n')), PING_MS);
    res.on('close', () => {
      clients.delete(c);
      if (!clients.size) { clearInterval(poll); clearInterval(ping); poll = ping = null; }
    });
  }

  // The file on disk for a path: inside the site, and spelled exactly (Vercel
  // is case-sensitive, Windows isn't).
  function locate(pathname) {
    const parts = pathname.split('/').slice(1);
    if (parts.some(p => p.startsWith('.') || /[\\:\0]/.test(p))) return null;
    const file = path.join(site, ...parts).replace(/[\\/]+$/, '');
    if (file !== site && !file.startsWith(site + path.sep)) return null;
    try { return realpathSync.native(file) === file ? { file, dir: statSync(file).isDirectory() } : null; } catch (e) { return null; }
  }

  async function handle(req, res) {
    const send = (status, body, headers) => {
      res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const text = (status, body, headers) => send(status, body, { 'content-type': 'text/plain; charset=utf-8', ...headers });
    const host = String(req.headers.host || '').toLowerCase();
    if (host === `127.0.0.1:${port}` || host === `[::1]:${port}`) {
      const to = /^\/(?![/\\])/.test(req.url) ? req.url : '/';
      return text(302, 'Use localhost.', { location: `http://localhost:${port}${to}` });
    }
    if (host !== `localhost:${port}`) return text(403, 'This server answers localhost only.');
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Read-only.', { allow: 'GET, HEAD' });
    let url, pathname;
    try { url = new URL(`http://localhost:${port}${req.url}`); pathname = decodeURIComponent(url.pathname); } catch (e) { return text(400, 'Bad request'); }

    if (pathname === '/__dev/changes') return req.method === 'HEAD' ? text(200, '') : listen(req, res, url);
    if (pathname === '/__dev/reload.js') return send(200, await readFile(path.join(TOOLS, 'dev-reload.js')), { 'content-type': TYPES['.js'] });

    const rule = rules(pathname);
    if (rule.redirect) return text(307, 'Redirecting', { location: rule.redirect });
    let at = locate(pathname);
    if (at && at.dir) {
      if (!pathname.endsWith('/')) return text(308, 'Redirecting', { location: url.pathname.replace(/^\/+/, '/') + '/' + url.search });
      at = locate(pathname + 'index.html');
    } else if (pathname.endsWith('/')) at = null;
    if (!at || at.dir) return text(404, 'Not found');

    const headers = { ...rule.headers, 'content-security-policy': POLICY, 'content-type': TYPES[path.extname(at.file).toLowerCase()] || 'application/octet-stream' };
    if (pathname === CONFIG) return send(200, stagingConfig(await readFile(at.file, 'utf8')), headers);
    if (path.extname(at.file) !== '.html') return send(200, await readFile(at.file), headers);
    // Scan first: what changed before this page was read isn't news to it.
    const since = files.scan();
    const html = await readFile(at.file, 'utf8');
    send(200, html.replace(/<head>/i, m => `${m}\n  <script src="/__dev/reload.js" data-since="${since}" defer></script>`), headers);
  }

  const answer = (req, res) => handle(req, res).catch(e => {
    log(`${req.method} ${req.url}: ${e.message}`);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Error: see the log');
  });
  const servers = ['127.0.0.1', '::1'].map(address => ({ address, server: http.createServer(answer) }));
  return {
    // Both loopback addresses; a computer without IPv6 has only the first.
    start: () => Promise.all(servers.map(({ address, server }) => new Promise((resolve, reject) => {
      server.on('error', e => (address === '::1' && (e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT') ? resolve(null) : reject(e)));
      server.listen(port, address, () => resolve(address));
    }))),
    stop: () => Promise.all(servers.map(({ server }) => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); })))
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const port = Number(arg('--port')) || PORT, file = arg('--log');
  if (file) { mkdirSync(path.dirname(file), { recursive: true }); if (existsSync(file) && statSync(file).size > 1e6) writeFileSync(file, ''); }
  const log = m => { const line = `${new Date().toISOString()} ${m}`; console.log(line); if (file) try { appendFileSync(file, line + '\n'); } catch (e) {} };
  createDevServer({ port, log }).start().then(
    () => log(`http://localhost:${port}/ serving ${REPO} (process ${process.pid})`),
    e => { log(e.code === 'EADDRINUSE' ? `Port ${port} is already in use` : `Could not start: ${e.message}`); process.exit(1); });
}
