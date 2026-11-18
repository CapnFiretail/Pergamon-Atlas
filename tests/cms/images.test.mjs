// Card images (scripts/cms/images.js, CMS milestone M5): the image slot in
// the field schema, file checks, desktop / phone framing (independent, in
// schema v1's own fields), the geometry the editor draws, and the
// administrator's image store against a fake Supabase (reserve → upload →
// signed preview; failures change nothing). Plus image edits through the
// workspace: saved with text edits, discarded, and in conflicts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const content = require('../../PergamonAtlas.V1/scripts/cms/content.js');
const images = require('../../PergamonAtlas.V1/scripts/cms/images.js');
const workspace = require('../../PergamonAtlas.V1/scripts/cms/workspace.js');

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../PergamonAtlas.V1/data/home-content.js', import.meta.url), 'utf8'), sandbox);
const DOC = JSON.parse(JSON.stringify(sandbox.window.PergamonHomeContent.document));
const clone = o => JSON.parse(JSON.stringify(o));
const FEATURED = DOC.components['home.featured'].art;
const SPOTLIGHT = DOC.components['home.spotlight'].art;
const ID = '0b0c0d0e-1111-4222-8333-444455556666';
const ID2 = '9f8e7d6c-1111-4222-8333-444455556666';
const PNG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];
const JPEG = [0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0];

// ── Schema ─────────────────────────────────────────────────────────────
test('every card type has one image slot, from the schema, with its own parts', () => {
  const image = id => content.cardFields(id, DOC.components[id]).find(f => f.type === 'image');
  for (const id of ['home.featured', 'home.spotlight', 'home.carousel.pong', 'home.carousel.snake']) {
    const f = image(id);
    assert.ok(f, `${id} has an image slot`);
    assert.equal(f.key, 'art');
    assert.ok(f.parts.some(p => p.key === 'alt' && p.optional && p.max === 140), 'description: optional, server limit 140');
  }
  const edge = image('home.spotlight').parts.find(p => p.key === 'base');
  assert.ok(edge && edge.type === 'color' && edge.fit === 'height', 'the spotlight edge colour is a part shown for height-fitted art');
  assert.ok(!image('home.featured').parts.some(p => p.key === 'base'), 'only the spotlight lists an edge colour');
  assert.ok(image('home.carousel.pong').recommendedWidth < image('home.featured').recommendedWidth);
});

test('image parts are checked like the server checks them', () => {
  const [edge, alt] = content.cardFields('home.spotlight', DOC.components['home.spotlight']).find(f => f.type === 'image').parts;
  assert.equal(content.checkField(alt, ''), null, 'an empty description is allowed (decorative image)');
  assert.equal(content.checkField(alt, 'A knight on a chessboard'), null);
  assert.match(content.checkField(alt, 'x'.repeat(141)), /at most 140/);
  assert.match(content.checkField(alt, 'a <b> tag'), /< and >/);
  assert.equal(content.checkField(edge, '#030916'), null);
  for (const bad of ['', '#03091', '030916', '#03091g', 'red', '#0309166']) assert.ok(content.checkField(edge, bad), `rejects ${bad}`);
});

// ── Files ──────────────────────────────────────────────────────────────
test('file type comes from the bytes, not the name; size and pixels are limited', () => {
  assert.equal(images.sniff(PNG), 'image/png');
  assert.equal(images.sniff(JPEG), 'image/jpeg');
  assert.equal(images.sniff(WEBP), 'image/webp');
  assert.equal(images.sniff(GIF), 'image/gif');
  assert.equal(images.sniff([0x3C, 0x73, 0x76, 0x67]), null);
  assert.deepEqual(images.checkFile({ name: 'a.png', type: 'image/png', size: 1000 }, PNG), { mime: 'image/png' });
  assert.deepEqual(images.checkFile({ name: 'renamed.png', type: 'image/png', size: 1000 }, JPEG), { mime: 'image/jpeg' }, 'a JPEG named .png is uploaded as a JPEG');
  assert.match(images.checkFile({ name: 'a.gif', type: 'image/gif', size: 10 }, GIF).error, /GIF/);
  assert.match(images.checkFile({ name: 'a.svg', type: 'image/svg+xml', size: 10 }, [0x3C, 0x73]).error, /SVG/);
  assert.match(images.checkFile({ name: 'a.png', type: 'image/png', size: 10 }, [0x74, 0x65, 0x78, 0x74]).error, /isn’t a PNG, JPEG or WebP/);
  assert.match(images.checkFile({ name: 'a.png', type: 'image/png', size: 0 }, []).error, /empty/);
  assert.match(images.checkFile({ name: 'a.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }, PNG).error, /limit is 5 MB/);
  assert.ok(!images.checkFile({ name: 'a.png', type: 'image/png', size: 5 * 1024 * 1024 }, PNG).error, 'exactly 5 MB is allowed');
  assert.match(images.checkPixels(0, 0, 10).error, /couldn’t be read/);
  assert.match(images.checkPixels(10001, 50, 10).error, /10,000/);
  assert.deepEqual(images.checkPixels(1800, 1000, 50000, 1600).warnings, []);
  const w = images.checkPixels(300, 200, 3 * 1024 * 1024, 1600).warnings;
  assert.equal(w.length, 2, 'warns about a small and a heavy image, without refusing them');
});

// ── Framing ────────────────────────────────────────────────────────────
test('framing reads schema v1: focus / scale for desktop, the narrow fields for phone', () => {
  assert.deepEqual(images.framing(FEATURED, 'desktop', 'feature'), { fit: 'cover', x: 78, y: 5, offset: 0, zoom: 1, follows: false });
  assert.deepEqual(images.framing(FEATURED, 'phone', 'feature'), { fit: 'cover', x: 88, y: 12, offset: 0, zoom: 1, follows: false });
  assert.deepEqual(images.framing(SPOTLIGHT, 'desktop', 'spotlight'), { fit: 'height', x: 50, y: 50, offset: -60, zoom: 1.3, follows: false });
  assert.deepEqual(images.framing(SPOTLIGHT, 'phone', 'spotlight'), { fit: 'height', x: 100, y: 50, offset: -139, zoom: 1, follows: false });
  // No art settings: the CSS defaults (featured cover focus 75% 25%, tiles centred).
  assert.deepEqual(images.framing({ source: { media: ID } }, 'desktop', 'feature'), { fit: 'cover', x: 75, y: 25, offset: 0, zoom: 1, follows: false });
  const tile = { source: { media: ID }, focus: { x: 20, y: 30 }, scale: 1.5 };
  assert.deepEqual(images.framing(tile, 'phone', 'tile'), { fit: 'cover', x: 20, y: 30, offset: 0, zoom: 1.5, follows: true }, 'phone follows desktop until it has its own');
});

test('phone framing never overwrites desktop framing, and desktop changes leave a custom phone framing alone', () => {
  // Featured: phone has its own focus but no own zoom (it shares the desktop zoom).
  const phoneMoved = images.setFraming(FEATURED, 'phone', { x: 10, y: 90, zoom: 2 }, 'feature');
  assert.deepEqual(phoneMoved.focus, FEATURED.focus, 'desktop focus untouched');
  assert.equal(phoneMoved.scale, undefined, 'desktop zoom untouched');
  assert.deepEqual(phoneMoved.focusNarrow, { x: 10, y: 90 });
  assert.equal(phoneMoved.scaleNarrow, 2);
  const deskZoomed = images.setFraming(FEATURED, 'desktop', { x: 60, y: 40, zoom: 2.5 }, 'feature');
  assert.deepEqual(images.framing(deskZoomed, 'phone', 'feature'), images.framing(FEATURED, 'phone', 'feature'), 'the phone still shows exactly what it showed');
  assert.equal(deskZoomed.scaleNarrow, 1, 'its shared zoom was written out first');
  assert.equal(deskZoomed.scale, 2.5);
  // Spotlight: same in both directions, in anchor / anchorNarrow.
  const spotPhone = images.setFraming(SPOTLIGHT, 'phone', { x: 70, y: 40, offset: -139, zoom: 0.8 }, 'spotlight');
  assert.deepEqual(spotPhone.anchor, SPOTLIGHT.anchor);
  assert.equal(spotPhone.scale, SPOTLIGHT.scale);
  assert.deepEqual(spotPhone.anchorNarrow, { x: 70, offset: -139, y: 40 });
  const spotDesk = images.setFraming(SPOTLIGHT, 'desktop', { x: 30, y: 60, offset: 0, zoom: 2 }, 'spotlight');
  assert.deepEqual(images.framing(spotDesk, 'phone', 'spotlight'), images.framing(SPOTLIGHT, 'phone', 'spotlight'));
  assert.deepEqual(spotDesk.anchor, { x: 30, y: 60 });
  // A phone that follows desktop keeps following it.
  const follow = { source: { media: ID }, focus: { x: 50, y: 50 } };
  const moved = images.setFraming(follow, 'desktop', { x: 20, y: 20, zoom: 1.4 }, 'tile');
  assert.ok(images.follows(moved));
  assert.deepEqual(images.framing(moved, 'phone', 'tile'), { fit: 'cover', x: 20, y: 20, offset: 0, zoom: 1.4, follows: true });
});

test('framing stays in the server’s ranges; reset and match desktop', () => {
  const wild = images.setFraming(FEATURED, 'desktop', { x: -40, y: 140, zoom: 9 }, 'feature');
  assert.deepEqual(wild.focus, { x: 0, y: 100 });
  assert.equal(wild.scale, 3, 'cover zoom at most 3');
  const low = images.setFraming(FEATURED, 'desktop', { x: 50, y: 50, zoom: 0.2 }, 'feature');
  assert.equal(low.scale, undefined, 'cover zoom at least 1 (1 is the default, so it is left out)');
  const spotLow = images.setFraming(SPOTLIGHT, 'desktop', { x: 50, y: 50, offset: 9999, zoom: 0.1 }, 'spotlight');
  assert.equal(spotLow.scale, 0.5, 'height-fitted art may shrink to 0.5');
  assert.equal(spotLow.anchor.offset, 600, 'offset within ±600');
  const tidy = images.setFraming(FEATURED, 'desktop', { x: 33.333333, y: 66.666666, zoom: 1.23456 }, 'feature');
  assert.deepEqual(tidy.focus, { x: 33.3, y: 66.7 });
  assert.equal(tidy.scale, 1.23);
  const reset = images.resetFraming(FEATURED, 'desktop', 'feature');
  assert.deepEqual(reset.focus, { x: 50, y: 50 });
  assert.deepEqual(reset.focusNarrow, FEATURED.focusNarrow, 'resetting desktop leaves the phone framing');
  const phoneReset = images.resetFraming(FEATURED, 'phone', 'feature');
  assert.deepEqual(phoneReset.focus, FEATURED.focus, 'resetting phone leaves the desktop framing');
  assert.deepEqual(phoneReset.focusNarrow, { x: 50, y: 50 });
  const matched = images.matchDesktop(SPOTLIGHT);
  assert.ok(images.follows(matched));
  assert.equal(matched.anchorNarrow, undefined);
  assert.equal(matched.scaleNarrow, undefined);
  assert.deepEqual(matched.anchor, SPOTLIGHT.anchor);
  for (const art of [wild, low, spotLow, tidy, reset, phoneReset, matched]) {
    const doc = clone(DOC); doc.components['home.featured'].art = art.fit ? FEATURED : art; doc.components['home.spotlight'].art = art.fit ? art : SPOTLIGHT;
    assert.ok(content.validateDocument(doc));
  }
});

test('a replacement keeps the slot’s drawing, starts centred and clears the old description', () => {
  const spot = images.replaceSource({ ...SPOTLIGHT, alt: 'Old board' }, ID, 'cover');
  assert.deepEqual(spot, { source: { media: ID }, alt: '', fit: 'height', base: '#030916', anchor: { x: 50, y: 50 } });
  const feat = images.replaceSource(FEATURED, ID, 'cover');
  assert.deepEqual(feat, { source: { media: ID }, alt: '', focus: { x: 50, y: 50 } });
  assert.ok(images.follows(feat), 'the phone follows the new desktop framing');
  assert.deepEqual(images.replaceSource(undefined, ID, 'cover'), { source: { media: ID }, alt: '', focus: { x: 50, y: 50 } }, 'a placeholder tile gets cover art');
});

test('geometry matches the homepage CSS, and dragging follows the pointer', () => {
  const box = { width: 896, height: 260 }, natural = { width: 1619, height: 971 };
  // object-fit: cover → 896 wide, 537.4 tall; focus y 5% → top = 0.05 * (260 - 537.4)
  const r = images.imageRect({ fit: 'cover', x: 78, y: 5, zoom: 1 }, box, natural);
  assert.ok(Math.abs(r.width - 896) < 0.01 && Math.abs(r.height - 537.38) < 0.1);
  assert.ok(Math.abs(r.top - 0.05 * (260 - r.height)) < 1e-9 && Math.abs(r.left) < 1e-9);
  // Zoom 2 around the focus: twice the size, the focus point stays put.
  const z = images.imageRect({ fit: 'cover', x: 50, y: 50, zoom: 2 }, box, natural);
  assert.ok(Math.abs(z.left + z.width / 2 - 448) < 1e-9 && Math.abs(z.top + z.height / 2 - 130) < 1e-9);
  // Dragging 40px down moves the picture 40px down (until it reaches an edge).
  const f = { fit: 'cover', x: 50, y: 50, offset: 0, zoom: 1 };
  const before = images.imageRect(f, box, natural), after = images.imageRect(images.moved(f, 0, 40, box, natural), box, natural);
  assert.ok(Math.abs(after.top - before.top - 40) < 1e-6);
  assert.equal(images.moved(f, 500, 0, box, natural).x, 50, 'cover art as wide as the card cannot move sideways');
  assert.equal(images.moved(f, 0, 5000, box, natural).y, 0, 'clamped at the edge');
  // Height-fitted: 1.3 × 140 tall, centred at 50% - 60px.
  const s = { fit: 'height', x: 50, y: 50, offset: -60, zoom: 1.3 };
  const sr = images.imageRect(s, { width: 896, height: 140 }, { width: 2172, height: 724 });
  assert.ok(Math.abs(sr.height - 182) < 1e-9 && Math.abs(sr.left + sr.width / 2 - (448 - 60)) < 1e-9 && Math.abs(sr.top - (70 - 91)) < 1e-9);
  const sm = images.moved(s, 89.6, 0, { width: 896, height: 140 }, { width: 2172, height: 724 });
  assert.ok(Math.abs(sm.x - 60) < 1e-9 && sm.offset === -60, 'sideways moves change x and keep the offset');
});

// ── Store (fake Supabase) ───────────────────────────────────────────────
const BASE = 'https://staging-ref.supabase.co';
function fakeSupabase(opts = {}) {
  const calls = [];
  const media = {};                // id → row
  const objects = {};
  let n = 0;
  const api = {
    async reserve(mime, bytes) {
      calls.push(['reserve', mime, bytes]);
      if (opts.reserveError) return { data: null, error: opts.reserveError };
      const id = `0b0c0d0e-1111-4222-8333-${String(++n).padStart(12, '0')}`;
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
      media[id] = { draft_path: `uploads/${id}.${ext}`, public_path: null, width: null, height: null };
      return { data: { media_id: id, bucket: opts.bucket || 'site-media-drafts', path: opts.path || media[id].draft_path }, error: null };
    },
    async upload(path, file, mime) {
      calls.push(['upload', path, mime]);
      if (opts.uploadError) return { data: null, error: { statusCode: '500', message: 'boom' } };
      objects[path] = file;
      return { data: { path }, error: null };
    },
    async describe(ids) {
      calls.push(['describe', ids.slice()]);
      if (opts.describeError) return { data: null, error: { code: 'PT403', message: 'admin only' } };
      const out = {};
      ids.forEach(id => { if (media[id]) out[id] = media[id]; });
      return { data: out, error: null };
    },
    async sign(paths, seconds) {
      calls.push(['sign', paths.slice(), seconds]);
      if (opts.signError) return { data: null, error: { message: 'nope' } };
      return { data: paths.map(p => ({ path: p, error: null, signedUrl: (opts.signBase || BASE) + `/storage/v1/object/sign/site-media-drafts/${p}?token=t${calls.length}` })), error: null };
    }
  };
  return { api, calls, media, objects };
}
const FILE = { name: 'art.webp', type: 'image/webp', size: 20000 };
const makeStore = (fake, extra = {}) => images.createStore(Object.assign({
  api: fake.api, base: BASE, head: async () => WEBP, decode: async () => ({ width: 1800, height: 1000 })
}, extra));

test('upload: reserve, upload to the issued private path, preview through a signed URL', async () => {
  const fake = fakeSupabase();
  const store = makeStore(fake);
  const r = await store.upload(FILE, 1600);
  assert.ok(r.mediaId && !r.error);
  assert.deepEqual([r.width, r.height, r.warnings], [1800, 1000, []]);
  assert.deepEqual(fake.calls.map(c => c[0]), ['reserve', 'upload', 'sign']);
  assert.deepEqual(fake.calls[0], ['reserve', 'image/webp', 20000]);
  assert.equal(fake.calls[1][1], `uploads/${r.mediaId}.webp`, 'uploaded only to the path the server issued');
  assert.equal(fake.calls[2][2], 3600, 'previews expire after an hour');
  const m = store.map()[r.mediaId];
  assert.ok(m.url.startsWith(`${BASE}/storage/v1/object/sign/site-media-drafts/`));
  assert.ok(!m.url.includes('/object/public/'), 'never a public URL for a draft image');
});

test('upload refuses bad files before contacting the server', async () => {
  for (const [file, head, decode, pattern] of [
    [{ name: 'a.gif', type: 'image/gif', size: 100 }, GIF, null, /GIF/],
    [{ name: 'a.png', type: 'image/png', size: 6 * 1024 * 1024 }, PNG, null, /5 MB/],
    [{ name: 'fake.png', type: 'image/png', size: 40 }, [0x74, 0x65, 0x78, 0x74], null, /isn’t a PNG/],
    [{ name: 'broken.png', type: 'image/png', size: 400 }, PNG, async () => { throw new Error('decode'); }, /couldn’t be read/],
    [{ name: 'giant.png', type: 'image/png', size: 400 }, PNG, async () => ({ width: 12000, height: 300 }), /10,000/]
  ]) {
    const fake = fakeSupabase();
    const store = makeStore(fake, { head: async () => head, decode: decode || (async () => ({ width: 100, height: 100 })) });
    const r = await store.upload(file, 400);
    assert.match(r.error, pattern);
    assert.equal(fake.calls.length, 0, `${file.name}: nothing sent`);
  }
});

test('failed or refused uploads report clearly and leave nothing to show', async () => {
  const cases = [
    [{ reserveError: { code: 'PT403', message: 'admins only' } }, /no longer upload/, ['reserve']],
    [{ reserveError: { code: 'PT429', message: 'limit' } }, /limit for today/, ['reserve']],
    [{ reserveError: { code: 'PT422', message: 'images must be at most 5 MB' } }, /didn’t accept this image: images must/, ['reserve']],
    [{ reserveError: { message: 'Failed to fetch' } }, /Couldn’t reach the server/, ['reserve']],
    [{ uploadError: true }, /upload didn’t finish/, ['reserve', 'upload']],
    [{ signError: true }, /preview couldn’t be loaded/, ['reserve', 'upload', 'sign']],
    [{ path: 'uploads/../../site-media/media/x.png' }, /unexpected answer/, ['reserve']],
    [{ bucket: 'site-media' }, /unexpected answer/, ['reserve']],
    [{ signBase: 'https://evil.example' }, /preview couldn’t be loaded/, ['reserve', 'upload', 'sign']]
  ];
  for (const [opts, pattern, steps] of cases) {
    const fake = fakeSupabase(opts);
    const store = makeStore(fake);
    const r = await store.upload(FILE, 1600);
    assert.match(r.error, pattern, JSON.stringify(opts));
    assert.equal(r.mediaId, undefined);
    assert.deepEqual(fake.calls.map(c => c[0]), steps);
    assert.deepEqual(store.map(), {});
  }
});

test('resolve: draft images get signed previews, published ones their public URL, unknown ones nothing', async () => {
  const fake = fakeSupabase();
  const hash = 'a'.repeat(64);
  fake.media[ID] = { draft_path: `uploads/${ID}.png`, public_path: null, width: null, height: null };
  fake.media[ID2] = { draft_path: `uploads/${ID2}.jpg`, public_path: `media/${hash}.jpg`, width: 800, height: 600 };
  const unknown = '11111111-2222-4333-8444-555555555555';
  let clock = 1_000_000;
  const store = makeStore(fake, { now: () => clock });
  assert.deepEqual(await store.resolve([ID, ID2, unknown, 'not-a-uuid']), { ok: true });
  const map = store.map();
  assert.ok(map[ID].url.startsWith(`${BASE}/storage/v1/object/sign/site-media-drafts/uploads/${ID}.png`));
  assert.equal(map[ID2].url, `${BASE}/storage/v1/object/public/site-media/media/${hash}.jpg`);
  assert.deepEqual([map[ID2].width, map[ID2].height], [800, 600]);
  assert.equal(map[unknown], undefined);
  assert.ok(store.get(unknown).missing);
  assert.deepEqual(fake.calls[0], ['describe', [ID, ID2, unknown]], 'only real ids are looked up');
  // Nothing new to look up → no requests; near expiry → re-signed.
  const before = fake.calls.length;
  await store.resolve([ID, ID2, unknown]);
  assert.equal(fake.calls.length, before);
  clock += 55 * 60 * 1000;
  await store.resolve([ID, ID2]);
  assert.deepEqual(fake.calls.slice(before).map(c => c[0] === 'describe' ? c : c[0]), [['describe', [ID]], 'sign'], 'only the draft image is re-signed');
});

test('resolve: a refused lookup (not an admin) shows nothing and is not retried in a loop', async () => {
  const fake = fakeSupabase({ describeError: true });
  fake.media[ID] = { draft_path: `uploads/${ID}.png`, public_path: null };
  let clock = 0;
  const store = makeStore(fake, { now: () => clock });
  const r = await store.resolve([ID]);
  assert.equal(r.error.code, 'PT403');
  assert.deepEqual(store.map(), {});
  await store.resolve([ID]);
  assert.equal(fake.calls.length, 1, 'waits before asking again');
  clock += 31 * 1000;
  await store.resolve([ID]);
  assert.equal(fake.calls.length, 2);
});

test('resolve rejects unexpected storage paths', async () => {
  const fake = fakeSupabase();
  fake.media[ID] = { draft_path: '../secrets/x.png', public_path: 'https://evil.example/x.png' };
  const store = makeStore(fake);
  await store.resolve([ID]);
  assert.deepEqual(store.map(), {});
  assert.ok(store.get(ID).missing);
  assert.ok(!fake.calls.some(c => c[0] === 'sign'));
});

// ── Image edits through the workspace ──────────────────────────────────
function fakeServer() {
  let nextId = 100;
  const db = { published: { id: 5, content: clone(DOC) }, draft: null };
  return {
    db,
    api: {
      async getDraft() { return { data: { draft: db.draft && { id: db.draft.id, content: clone(db.draft.content), created_at: '2026-11-18T10:00:00Z' }, published: clone(db.published) }, error: null }; },
      async saveDraft(page, doc, expected) {
        if (!content.validateDocument(doc)) return { data: null, error: { code: 'PT422', message: 'invalid' } };
        const cur = db.draft ? db.draft.id : null;
        if (cur !== expected) return { data: null, error: { code: 'PT409', message: 'changed' } };
        db.draft = { id: ++nextId, content: clone(doc) };
        return { data: { draft_id: db.draft.id }, error: null };
      }
    },
    otherAdminSaves(mutate) { const d = clone(db.draft ? db.draft.content : db.published.content); mutate(d); db.draft = { id: ++nextId, content: d }; }
  };
}
const memory = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
const newWorkspace = (server, storage) => workspace.create({ page: 'home', api: server.api, storage: storage || memory(), scope: 'x', validate: content.validateDocument, fallbackDoc: DOC });

test('image and text edits are saved together; reload and reopen shows them', async () => {
  const server = fakeServer();
  const ws = newWorkspace(server);
  await ws.load();
  ws.setField('home.carousel.pong', 'art', images.replaceSource(undefined, ID, 'cover'));
  ws.setField('home.carousel.pong', 'title', 'Pong Deluxe');
  const framed = images.setFraming(ws.component('home.featured').art, 'phone', { x: 30, y: 70, zoom: 1.6 }, 'feature');
  ws.setField('home.featured', 'art', framed);
  assert.deepEqual(ws.unsavedCards().sort(), ['home.carousel.pong', 'home.featured']);
  assert.ok((await ws.save()).ok);
  const saved = server.db.draft.content.components;
  assert.equal(saved['home.carousel.pong'].art.source.media, ID);
  assert.equal(saved['home.carousel.pong'].title, 'Pong Deluxe');
  assert.deepEqual(saved['home.featured'].art.focusNarrow, { x: 30, y: 70 });
  assert.deepEqual(saved['home.featured'].art.focus, FEATURED.focus, 'desktop framing saved unchanged');
  assert.deepEqual(saved['home.spotlight'], DOC.components['home.spotlight'], 'other cards preserved');
  // A new browser session (reload, reopen): the draft comes back with its images.
  const again = newWorkspace(server);
  await again.load();
  assert.equal(again.component('home.carousel.pong').art.source.media, ID);
  assert.equal(again.cardStatus('home.carousel.pong'), 'draft');
  assert.deepEqual(content.mediaIds(again.working()), [ID]);
});

test('discard and revert restore the saved image; removing art from a tile works', async () => {
  const server = fakeServer();
  const ws = newWorkspace(server);
  await ws.load();
  ws.setField('home.carousel.snake', 'art', images.replaceSource(undefined, ID, 'cover'));
  assert.ok((await ws.save()).ok);
  ws.setField('home.carousel.snake', 'art', images.replaceSource(ws.component('home.carousel.snake').art, ID2, 'cover'));
  assert.equal(ws.cardStatus('home.carousel.snake'), 'unsaved');
  assert.equal(ws.savedComponent('home.carousel.snake').art.source.media, ID, 'the previous image is the saved one');
  ws.setField('home.carousel.snake', 'art', ws.savedComponent('home.carousel.snake').art);   // Revert image
  assert.equal(ws.cardStatus('home.carousel.snake'), 'draft');
  ws.setField('home.featured', 'art', images.resetFraming(ws.component('home.featured').art, 'desktop', 'feature'));
  ws.discardCard('home.featured');
  assert.deepEqual(ws.component('home.featured').art, FEATURED);
  // A tile without saved art: reverting removes the image again.
  ws.setField('home.carousel.pong', 'art', images.replaceSource(undefined, ID2, 'cover'));
  ws.setField('home.carousel.pong', 'art', (ws.savedComponent('home.carousel.pong') || {}).art);
  assert.ok(!('art' in ws.component('home.carousel.pong')));
  assert.equal(ws.cardStatus('home.carousel.pong'), 'published');
});

test('conflicting image edits never overwrite another administrator', async () => {
  const server = fakeServer();
  const ws = newWorkspace(server);
  await ws.load();
  ws.setField('home.spotlight', 'art', images.setFraming(ws.component('home.spotlight').art, 'desktop', { x: 20, y: 50, offset: 0, zoom: 2 }, 'spotlight'));
  server.otherAdminSaves(d => { d.components['home.carousel.pong'].art = { source: { media: ID2 }, alt: '' }; });
  const r = await ws.save();
  assert.ok(r.conflict && r.conflict.overlap.length === 0, 'refused, nothing overlapping');
  assert.equal(server.db.draft.content.components['home.carousel.pong'].art.source.media, ID2, 'their image is still there');
  const combined = await ws.combine(r.conflict);
  assert.ok(combined.ok);
  const saved = server.db.draft.content.components;
  assert.equal(saved['home.carousel.pong'].art.source.media, ID2, 'their image kept');
  assert.deepEqual(saved['home.spotlight'].art.anchor, { x: 20, y: 50 }, 'my framing applied');
  // Both change the same card's image: reported as an overlap before anything is saved.
  ws.setField('home.featured', 'art', images.replaceSource(ws.component('home.featured').art, ID, 'cover'));
  server.otherAdminSaves(d => { d.components['home.featured'].art.alt = 'Their description'; });
  const r2 = await ws.save();
  assert.deepEqual(r2.conflict.overlap, ['home.featured']);
  assert.equal(server.db.draft.content.components['home.featured'].art.alt, 'Their description');
});
