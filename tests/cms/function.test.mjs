// publish-media Edge Function: handler + byte checks, with in-memory fakes
// for Auth, the database and Storage. Node runs the .ts files directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../../supabase/functions/publish-media/handler.ts';
import { inspectImage, ImageError, MAX_BYTES } from '../../supabase/functions/publish-media/media.ts';

const fx = name => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const ORIGIN = 'https://www.pergamonatlas.com';
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', token: 'admin-token' };
const USER = { id: '22222222-2222-4222-8222-222222222222', token: 'user-token' };

function world() {
  const media = new Map();
  const drafts = new Map();
  const pub = new Map();
  const calls = { upload: 0, record: 0 };
  const deps = {
    allowedOrigins: [ORIGIN],
    async getUser(t) { return t === ADMIN.token ? { id: ADMIN.id } : t === USER.token ? { id: USER.id } : null; },
    async isAdmin(id) { return id === ADMIN.id; },
    async getMedia(id) { return media.get(id) || null; },
    async downloadDraft(path, max) { const b = drafts.get(path); return b ? (b.length > max + 1 ? b.subarray(0, max + 1) : b) : null; },
    async uploadPublic(path, bytes) { calls.upload++; if (pub.has(path)) return 'exists'; pub.set(path, bytes); return 'created'; },
    async recordPrepared(a) {
      calls.record++;
      const row = media.get(a.id);
      if (row.public_path && row.public_path !== a.publicPath) throw new Error('conflict');
      Object.assign(row, { public_path: a.publicPath, mime: a.mime, bytes: a.bytes, width: a.width, height: a.height });
    }
  };
  function addMedia(mime, bytes, { path } = {}) {
    const id = crypto.randomUUID();
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime] || 'png';
    const draft_path = path || `uploads/${id}.${ext}`;
    media.set(id, { id, draft_path, declared_mime: mime, public_path: null, width: null, height: null, mime: null, bytes: null });
    if (bytes) drafts.set(draft_path, bytes);
    return id;
  }
  return { deps, media, drafts, pub, calls, addMedia };
}

const call = (deps, { token = ADMIN.token, body, origin = ORIGIN, method = 'POST' } = {}) => handle(new Request('https://fn.example/publish-media', {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' },
  body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
}), deps);
const json = async r => ({ status: r.status, body: await r.json() });

// ── Byte checks ──────────────────────────────────────────────────────────

test('real PNG, JPEG (baseline + progressive) and WebP (lossy, lossless, extended) are identified with dimensions', () => {
  for (const [f, mime] of [['img-37x21.png', 'image/png'], ['img-37x21.jpg', 'image/jpeg'], ['img-37x21-progressive.jpg', 'image/jpeg'],
                           ['img-37x21-lossy.webp', 'image/webp'], ['img-37x21-lossless.webp', 'image/webp'], ['img-37x21-alpha.webp', 'image/webp']]) {
    const info = inspectImage(fx(f));
    assert.deepEqual([info.mime, info.width, info.height], [mime, 37, 21], f);
  }
  const site = new Uint8Array(readFileSync(new URL('../../PergamonAtlas.V1/images/featured/connect-four.webp', import.meta.url)));
  assert.deepEqual([inspectImage(site).width, inspectImage(site).height], [2172, 724], 'site artwork');
});

test('rejects SVG, GIF, HTML, executables, empty, truncated, oversized and absurd dimensions', () => {
  const enc = s => new TextEncoder().encode(s);
  const bad = {
    svg: enc('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
    gif: enc('GIF89a\x01\x00\x01\x00\x00\x00\x00;'),
    html: enc('<!doctype html><script>alert(1)</script>'),
    exe: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, ...new Array(60).fill(0)]),
    empty: new Uint8Array(0),
    truncatedPng: fx('img-37x21.png').subarray(0, 20),
    pngBadIhdr: (() => { const b = fx('img-37x21.png').slice(); b[12] = 0x58; return b; })(),
    jpegNoFrame: new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]),
    hugePng: (() => { const b = fx('img-37x21.png').slice(); b.set([0, 0, 0x4e, 0x21], 16); return b; })(),   // 20001 wide
    bombPng: (() => { const b = fx('img-37x21.png').slice(); b.set([0, 0, 0x27, 0x10], 16); b.set([0, 0, 0x27, 0x10], 20); return b; })(), // 10000x10000
    oversized: (() => { const b = new Uint8Array(MAX_BYTES + 1); b.set(fx('img-37x21.png')); return b; })()
  };
  for (const [name, bytes] of Object.entries(bad)) {
    assert.throws(() => inspectImage(bytes), ImageError, name);
  }
});

// ── Handler ──────────────────────────────────────────────────────────────

test('admin publishes a draft image: content-addressed public copy, recorded, idempotent', async () => {
  const w = world();
  const id = w.addMedia('image/webp', fx('img-37x21-lossy.webp'));
  const r = await json(await call(w.deps, { body: { media_id: id } }));
  assert.equal(r.status, 200);
  assert.match(r.body.public_path, /^media\/[0-9a-f]{64}\.webp$/);
  assert.deepEqual([r.body.width, r.body.height, r.body.mime], [37, 21, 'image/webp']);
  assert.ok(w.pub.has(r.body.public_path));
  assert.ok(w.drafts.has(`uploads/${id}.webp`), 'original kept');
  const again = await json(await call(w.deps, { body: { media_id: id } }));
  assert.equal(again.body.already_prepared, true);
  assert.equal(w.calls.upload, 1);
});

test('same file uploaded twice maps to the same public object without overwriting', async () => {
  const w = world();
  const a = w.addMedia('image/png', fx('img-37x21.png'));
  const b = w.addMedia('image/png', fx('img-37x21.png'));
  const ra = await json(await call(w.deps, { body: { media_id: a } }));
  const rb = await json(await call(w.deps, { body: { media_id: b } }));
  assert.equal(ra.body.public_path, rb.body.public_path);
  assert.equal(w.pub.size, 1);
});

test('authentication and authorisation', async () => {
  const w = world();
  const id = w.addMedia('image/png', fx('img-37x21.png'));
  assert.equal((await call(w.deps, { token: null, body: { media_id: id } })).status, 401);
  assert.equal((await call(w.deps, { token: 'forged', body: { media_id: id } })).status, 401);
  assert.equal((await call(w.deps, { token: USER.token, body: { media_id: id } })).status, 403);
  assert.equal(w.calls.upload, 0);
  // A failing role lookup is treated as "not admin".
  const broken = { ...w.deps, isAdmin: async () => { throw new Error('db down'); } };
  assert.equal((await call(broken, { body: { media_id: id } })).status, 403);
});

test('origins, methods and request shape', async () => {
  const w = world();
  const id = w.addMedia('image/png', fx('img-37x21.png'));
  assert.equal((await call(w.deps, { origin: 'https://evil.example', body: { media_id: id } })).status, 403);
  const pre = await call(w.deps, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal((await call(w.deps, { method: 'OPTIONS', origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(w.deps, { method: 'GET' })).status, 405);
  for (const body of ['not json', [], { media_id: id, path: 'uploads/x.png' }, { media_id: '../../etc' }, { id }, 'x'.repeat(2000)]) {
    const r = await call(w.deps, { body });
    assert.ok([400, 413].includes(r.status), JSON.stringify(body).slice(0, 40));
  }
  assert.equal(w.calls.upload, 0);
});

test('never trusts locations: unknown ids, tampered draft paths and missing uploads', async () => {
  const w = world();
  assert.equal((await call(w.deps, { body: { media_id: crypto.randomUUID() } })).status, 404);
  const tampered = w.addMedia('image/png', fx('img-37x21.png'), { path: 'uploads/../../site-media/media/x.png' });
  assert.equal((await call(w.deps, { body: { media_id: tampered } })).status, 409);
  const otherFile = w.addMedia('image/png', fx('img-37x21.png'), { path: `uploads/${crypto.randomUUID()}.png` });
  assert.equal((await call(w.deps, { body: { media_id: otherFile } })).status, 409, 'path must be derived from the id');
  const notUploaded = w.addMedia('image/png', null);
  assert.equal((await call(w.deps, { body: { media_id: notUploaded } })).status, 409);
  assert.equal(w.calls.upload, 0);
});

test('invalid contents and type mismatches are refused before copying', async () => {
  const w = world();
  const svgAsPng = w.addMedia('image/png', new TextEncoder().encode('<svg onload="alert(1)"/>'));
  const jpegAsPng = w.addMedia('image/png', fx('img-37x21.jpg'));
  const big = new Uint8Array(MAX_BYTES + 10); big.set(fx('img-37x21.png'));
  const oversized = w.addMedia('image/png', big);
  for (const id of [svgAsPng, jpegAsPng, oversized]) {
    const r = await json(await call(w.deps, { body: { media_id: id } }));
    assert.equal(r.status, 422, r.body.message);
  }
  assert.equal(w.calls.upload, 0);
});

test('failed copy or record is reported, retry-safe, and leaves the draft', async () => {
  const w = world();
  const id = w.addMedia('image/png', fx('img-37x21.png'));
  const flakyUpload = { ...w.deps, uploadPublic: async () => { throw new Error('storage 500'); } };
  assert.equal((await call(flakyUpload, { body: { media_id: id } })).status, 502);
  assert.equal(w.media.get(id).public_path, null);
  const flakyRecord = { ...w.deps, recordPrepared: async () => { throw new Error('db 500'); } };
  const r = await json(await call(flakyRecord, { body: { media_id: id } }));
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes('db 500'), 'internal errors are not echoed');
  assert.equal(w.media.get(id).public_path, null, 'not recorded, so content publish will refuse it');
  const retry = await json(await call(w.deps, { body: { media_id: id } }));
  assert.equal(retry.status, 200, 'retry succeeds; existing public object reused');
  assert.ok(w.drafts.has(`uploads/${id}.png`));
});
