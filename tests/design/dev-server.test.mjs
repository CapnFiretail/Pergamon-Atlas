// The local development server (tools/dev-server.mjs), on a copy of a small
// site: working files as they are, staging only, loopback only, change notices.
//   node --test tests/design/dev-server.test.mjs
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDevServer, POLICY, stagingConfig, STAGING_REF } from '../../tools/dev-server.mjs';
import { PRODUCTION_REF } from '../../tools/write-supabase-config.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = 'operation/scripts/auth/supabase-config.js';
const KEY = 'sb_publishable_aaaaaaaaaaaaaaaa';
const configFor = (ref, key = KEY) => `window.PERGAMON_SUPABASE_URL = "https://${ref}.supabase.co";\nwindow.PERGAMON_SUPABASE_ANON_KEY = "${key}";\n`;
let repo, server, port;
const put = (p, text) => { const f = path.join(repo, 'PergamonAtlas.V1', p); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); };
const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

function get(pathname, { host = `localhost:${port}`, method = 'GET', address = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: address, port, path: pathname, method, headers: { host } }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  repo = mkdtempSync(path.join(tmpdir(), 'pa-dev-'));
  writeFileSync(path.join(repo, 'secret.txt'), 'outside the site');
  writeFileSync(path.join(repo, 'vercel.json'), readFileSync(path.join(REPO, 'vercel.json')));
  put('index.html', '<!doctype html><html><head><title>One</title></head></html>');
  put('studio/index.html', '<!doctype html><html><head></head></html>');
  put('styles/a.css', 'a{}');
  put(CONFIG, configFor(STAGING_REF));
  port = await freePort();
  server = createDevServer({ repo, port });
  await server.start();
});
after(async () => { await server.stop(); rmSync(repo, { recursive: true, force: true }); });

test('working files are served as they are now, never cached', async () => {
  assert.match((await get('/')).body, /<title>One<\/title>/);
  put('index.html', '<!doctype html><html><head><title>Two</title></head></html>');
  const r = await get('/');
  assert.match(r.body, /<title>Two<\/title>/);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(r.body, /<head>\s*<script src="\/__dev\/reload\.js" data-since="\d+" defer>/);
  assert.equal((await get('/styles/a.css')).body, 'a{}');
});

test('addresses behave as on Vercel: folders, redirects, headers, exact spelling', async () => {
  const folder = await get('/studio?x=1');
  assert.equal(folder.status, 308);
  assert.equal(folder.headers.location, '/studio/?x=1');
  assert.equal((await get('/studio/')).status, 200);
  assert.equal((await get('/tools/anything')).headers.location, '/games/');
  assert.match((await get('/')).headers['content-security-policy-report-only'], /sha256-/);
  for (const p of ['/Styles/a.css', '/styles/a.css/', '/styles/', '/nothing']) assert.equal((await get(p)).status, 404, p);
});

test('only the site is served, read-only', async () => {
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/..%5csecret.txt', '/styles/..%2f..%2fsecret.txt', '/index.html::$DATA', '/index.html.', '/.git/config', '//secret.txt'])
    assert.notEqual((await get(p)).status, 200, p);
  assert.equal((await get('/%')).status, 400);
  assert.equal((await get('/', { method: 'POST' })).status, 405);
});

test('loopback only: other hosts are refused, other interfaces do not answer', async () => {
  assert.equal((await get('/', { host: 'evil.example' })).status, 403);
  assert.equal((await get('/', { host: `evil.example:${port}` })).status, 403);
  assert.equal((await get('/a?b', { host: `127.0.0.1:${port}` })).headers.location, `http://localhost:${port}/a?b`);
  assert.equal((await get('//evil.example', { host: `127.0.0.1:${port}` })).headers.location, `http://localhost:${port}/`);
  const outside = Object.values(networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal);
  if (outside) await assert.rejects(Promise.race([get('/', { address: outside.address }), new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 3000))]));
});

test('staging only: production, secret keys and anything unknown become "unconfigured"', async () => {
  assert.match((await get('/' + CONFIG)).body, new RegExp(`${STAGING_REF}.*\\n.*${KEY}`));
  for (const source of [configFor(PRODUCTION_REF), configFor('a'.repeat(20)), configFor(STAGING_REF, 'sb_secret_aaaaaaaaaaaaaaaa'), '', 'window.PERGAMON_SUPABASE_URL = null;']) {
    const out = stagingConfig(source);
    assert.match(out, /PERGAMON_SUPABASE_URL = null/);
    assert.doesNotMatch(out, /supabase\.co"|sb_/);
  }
  put(CONFIG, configFor(PRODUCTION_REF));
  assert.doesNotMatch((await get('/' + CONFIG)).body, new RegExp(PRODUCTION_REF));
  // The repository's own copy is usable.
  assert.match(stagingConfig(readFileSync(path.join(REPO, 'PergamonAtlas.V1', CONFIG), 'utf8')), new RegExp(STAGING_REF));
});

test('the enforced policy names staging and no production service', async () => {
  assert.equal((await get('/')).headers['content-security-policy'], POLICY);
  assert.match(POLICY, new RegExp(`connect-src 'self' https://${STAGING_REF}`));
  assert.doesNotMatch(POLICY, new RegExp(`${PRODUCTION_REF}|pergamonatlas|googlesyndication|https:(?!//)|\\*`));
});

test('changes reach a listening page, including those made while it was not', async () => {
  const since = Number(/data-since="(\d+)"/.exec((await get('/')).body)[1]);
  const listen = () => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/__dev/changes?since=' + since, headers: { host: `localhost:${port}` } }, res => {
      let text = '';
      const timer = setTimeout(() => { req.destroy(); reject(new Error('no change heard: ' + text)); }, 5000);
      res.on('data', d => {
        text += d;
        const all = [...text.matchAll(/data: (\[.*\])\n/g)].flatMap(m => JSON.parse(m[1]));
        if (all.length) { clearTimeout(timer); req.destroy(); resolve(all); }
      });
    });
    req.on('error', () => {});
  });
  const live = listen();
  await new Promise(r => setTimeout(r, 200));
  put('styles/a.css', 'a{color:red}');
  assert.deepEqual(await live, ['/styles/a.css']);
  put('studio/new.js', '1');
  assert.deepEqual((await listen()).sort(), ['/studio/new.js', '/styles/a.css']);
});

test('nothing of it is in the site', () => {
  assert.doesNotMatch(readFileSync(path.join(REPO, 'PergamonAtlas.V1/index.html'), 'utf8') + readFileSync(path.join(REPO, 'PergamonAtlas.V1/studio/index.html'), 'utf8'), /__dev|dev-reload/);
});
