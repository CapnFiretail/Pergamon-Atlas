// Publishing (scripts/cms/publish.js, CMS milestone M6): the change summary
// shown before publishing, and the publish sequence against a fake server
// that follows 0008/0009's rules (publish refuses unprepared images and
// stale drafts / live versions; publish-media prepares one image by id).
// Failures at any step must publish nothing; retries skip prepared images.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const content = require('../../PergamonAtlas.V1/scripts/cms/content.js');
const publish = require('../../PergamonAtlas.V1/scripts/cms/publish.js');
const images = require('../../PergamonAtlas.V1/scripts/cms/images.js');
const workspace = require('../../PergamonAtlas.V1/scripts/cms/workspace.js');

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../PergamonAtlas.V1/data/home-content.js', import.meta.url), 'utf8'), sandbox);
const DOC = JSON.parse(JSON.stringify(sandbox.window.PergamonHomeContent.document));
const clone = o => JSON.parse(JSON.stringify(o));
const A = 'aaaaaaaa-1111-4222-8333-444455556666';
const B = 'bbbbbbbb-1111-4222-8333-444455556666';
const C = 'cccccccc-1111-4222-8333-444455556666';

// ── Summary ────────────────────────────────────────────────────────────
test('summary lists each changed card with what changed, and new images', () => {
  const draft = clone(DOC);
  draft.components['home.featured'].title = 'Chess Forge II';
  draft.components['home.featured'].art = images.setFraming(draft.components['home.featured'].art, 'phone', { x: 10, y: 10, zoom: 1.5 }, 'feature');
  draft.components['home.spotlight'].art = images.replaceSource(draft.components['home.spotlight'].art, A, 'cover');
  draft.components['home.spotlight'].art.base = '#112233';
  draft.components['home.carousel.pong'].art = { source: { media: B }, alt: 'Pong art' };
  draft.components['home.carousel.snake'].category = 'Classic';
  const s = publish.summarize(DOC, draft, content, images);
  const by = Object.fromEntries(s.cards.map(c => [c.id, c.changes]));
  assert.deepEqual(by['home.featured'], ['Title', 'Phone framing']);
  assert.deepEqual(by['home.spotlight'], ['New image', 'Edge colour']);
  assert.deepEqual(by['home.carousel.pong'], ['Image added']);
  assert.deepEqual(by['home.carousel.snake'], ['Category']);
  assert.equal(s.cards.length, 4, 'unchanged cards are not listed');
  assert.deepEqual(s.newImages.sort(), [A, B].sort());
  assert.equal(s.cards.find(c => c.id === 'home.featured').title, 'Chess Forge II', 'cards are named by their new title');
  assert.equal(s.cards.find(c => c.id === 'home.carousel.pong').typeLabel, 'Carousel card');
  assert.equal(s.empty, false);
});

test('summary: desktop framing, description, removed image; identical draft is empty; images already live are not new', () => {
  const pub = clone(DOC);
  pub.components['home.carousel.pong'].art = { source: { media: C }, alt: '' };
  const draft = clone(pub);
  draft.components['home.featured'].art = images.setFraming(draft.components['home.featured'].art, 'desktop', { x: 20, y: 20, zoom: 2 }, 'feature');
  draft.components['home.featured'].art.alt = 'A knight';
  delete draft.components['home.carousel.pong'].art;
  const s = publish.summarize(pub, draft, content, images);
  const by = Object.fromEntries(s.cards.map(c => [c.id, c.changes]));
  assert.deepEqual(by['home.featured'], ['Desktop framing', 'Image description']);
  assert.deepEqual(by['home.carousel.pong'], ['Image removed']);
  assert.deepEqual(s.newImages, []);
  const same = publish.summarize(pub, clone(pub), content);
  assert.ok(same.empty && !same.cards.length);
  const first = publish.summarize(null, DOC, content);
  assert.equal(first.cards.length, Object.keys(DOC.components).filter(k => content.cardType(k)).length, 'nothing live yet: every card is new');
  assert.ok(first.cards.every(c => c.changes.join() === 'Added'), 'reported as added');
  assert.deepEqual(first.other, [], 'adding cards alone is not a reorder');
});

// ── Sequence ───────────────────────────────────────────────────────────
function fakeServer({ draftContent, failPrepare = {}, failPublish = null } = {}) {
  const db = {
    published: { id: 5, content: clone(DOC) },
    draft: { id: 40, content: draftContent || clone(DOC) },
    media: { [A]: { public_path: null }, [B]: { public_path: null }, [C]: { public_path: 'media/' + 'c'.repeat(64) + '.png' } },
    calls: [], versions: 5
  };
  const api = {
    async describe(ids) { db.calls.push(['describe', ids.slice()]); const out = {}; ids.forEach(id => { if (db.media[id]) out[id] = clone(db.media[id]); }); return { data: out, error: null }; },
    async prepare(id) {
      db.calls.push(['prepare', id]);
      if (failPrepare[id]) { failPrepare[id]--; return { error: { status: 502, code: 'upload_failed', message: 'Could not copy the image. Try again.' } }; }
      db.media[id].public_path = 'media/' + id.slice(0, 1).repeat(64) + '.png';
      return { ok: true };
    },
    async publish(page, draftId, expected) {
      db.calls.push(['publish', draftId, expected]);
      if (failPublish) { const e = failPublish; failPublish = null; return { data: null, error: e }; }
      if (!db.draft || db.draft.id !== draftId) return { data: null, error: { code: 'PT409', message: `draft ${draftId} is not the current draft` } };
      if (db.published.id !== expected) return { data: null, error: { code: 'PT409', message: 'the live version changed' } };
      const missing = content.mediaIds(db.draft.content).find(id => !db.media[id] || !db.media[id].public_path);
      if (missing) return { data: null, error: { code: 'PT409', message: `image ${missing} has not been prepared for publishing` } };
      const prev = db.published.id;
      db.published = { id: ++db.versions + 50, content: clone(db.draft.content) };
      db.draft = null;
      return { data: { version: db.published.id, previous_version: prev, published_at: '2026-11-18T12:00:00Z' }, error: null };
    }
  };
  return { db, api };
}
const withImages = () => {
  const d = clone(DOC);
  d.components['home.featured'].art = images.replaceSource(d.components['home.featured'].art, A, 'cover');
  d.components['home.carousel.pong'].art = { source: { media: B }, alt: '' };
  d.components['home.carousel.snake'].art = { source: { media: C }, alt: '' };
  return d;
};
const runWith = (srv, extra = {}) => publish.run(Object.assign({ api: srv.api, page: 'home', draftId: 40, expectedPublishedId: 5, mediaIds: content.mediaIds(srv.db.draft ? srv.db.draft.content : {}) }, extra));

test('text-only publish: no image work, one publish call, the draft goes live', async () => {
  const d = clone(DOC); d.components['home.featured'].title = 'New title';
  const srv = fakeServer({ draftContent: d });
  const steps = [];
  const r = await runWith(srv, { onStep: s => steps.push(s.step) });
  assert.ok(r.ok);
  assert.equal(r.previous, 5);
  assert.deepEqual(srv.db.calls.map(c => c[0]), ['publish']);
  assert.equal(srv.db.published.content.components['home.featured'].title, 'New title');
  assert.deepEqual(steps, ['publish']);
});

test('images: only the draft’s unprepared images are prepared, then published', async () => {
  const srv = fakeServer({ draftContent: withImages() });
  srv.db.media[C.replace('c', 'd')] = { public_path: null };       // an unused upload: never touched
  const r = await runWith(srv);
  assert.ok(r.ok);
  assert.deepEqual(srv.db.calls.filter(c => c[0] === 'prepare').map(c => c[1]).sort(), [A, B].sort(), 'C was already public; the unused upload is never sent');
  assert.equal(srv.db.media[C.replace('c', 'd')].public_path, null);
  assert.deepEqual(srv.db.calls.map(c => c[0]), ['describe', 'prepare', 'prepare', 'publish'], 'publish only after every image is ready');
});

test('a failed image publishes nothing; trying again skips prepared images and succeeds', async () => {
  const srv = fakeServer({ draftContent: withImages(), failPrepare: { [B]: 1 } });
  const r = await runWith(srv);
  assert.equal(r.error.stage, 'images');
  assert.equal(r.error.mediaId, B);
  assert.equal(r.error.prepared + 1 <= r.error.total, true);
  assert.equal(srv.db.published.id, 5, 'the live version is unchanged');
  assert.ok(srv.db.draft && srv.db.draft.id === 40, 'the draft is kept');
  assert.ok(!srv.db.calls.some(c => c[0] === 'publish'), 'publish never called');
  srv.db.calls.length = 0;
  const again = await runWith(srv);
  assert.ok(again.ok);
  assert.deepEqual(srv.db.calls.filter(c => c[0] === 'prepare').map(c => c[1]), [B], 'only the failed image is prepared again');
});

test('stale draft or live version: refused as stale, nothing changes', async () => {
  const srv = fakeServer();
  srv.db.published.id = 6;                                           // someone published (or restored) meanwhile
  const r = await runWith(srv);
  assert.ok(r.stale);
  assert.equal(srv.db.draft.id, 40);
  const srv2 = fakeServer();
  srv2.db.draft.id = 41;                                             // someone saved a newer draft
  assert.ok((await runWith(srv2)).stale);
  assert.equal(srv2.db.published.id, 5);
});

test('repeated publish: the second attempt is refused by the server, never a second version', async () => {
  const srv = fakeServer();
  const [a, b] = await Promise.all([runWith(srv), runWith(srv)]);
  const oks = [a, b].filter(r => r.ok).length;
  assert.equal(oks, 1);
  assert.ok([a, b].some(r => r.stale));
  assert.equal(srv.db.versions, 6, 'exactly one new version');
});

test('server errors and missing images are reported with their stage', async () => {
  const srv = fakeServer({ failPublish: { code: 'PT403', message: 'administrator access required' } });
  const r = await runWith(srv);
  assert.deepEqual([r.error.stage, r.error.code], ['publish', 'PT403']);
  const d = withImages(); d.components['home.carousel.battleship'].art = { source: { media: 'eeeeeeee-1111-4222-8333-444455556666' }, alt: '' };
  const srv2 = fakeServer({ draftContent: d });
  const r2 = await runWith(srv2);
  assert.equal(r2.error.code, 'missing');
  assert.ok(!srv2.db.calls.some(c => c[0] === 'prepare' || c[0] === 'publish'));
  const srv3 = fakeServer({ draftContent: withImages() });
  srv3.api.prepare = async () => { throw new Error('Failed to fetch'); };
  const r3 = await runWith(srv3);
  assert.equal(r3.error.stage, 'images');
  assert.equal(srv3.db.published.id, 5);
});

// ── Workspace after publishing ─────────────────────────────────────────
const memory = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
test('after publishing, the draft is the published version; excluded unsaved edits stay unsaved', async () => {
  let draft = null;
  const api = {
    async getDraft() { return { data: { draft: draft && { id: draft.id, content: clone(draft.content), created_at: 'x', based_on_published_id: 5 }, published: { id: 5, content: clone(DOC) } }, error: null }; },
    async saveDraft(page, doc) { draft = { id: 41, content: clone(doc) }; return { data: { draft_id: 41 }, error: null }; }
  };
  const ws = workspace.create({ page: 'home', api, storage: memory(), scope: 'x', validate: content.validateDocument, fallbackDoc: DOC });
  await ws.load();
  ws.setField('home.featured', 'title', 'Saved title');
  assert.ok((await ws.save()).ok);
  assert.equal(ws.draft().basedOn, 5);
  ws.setField('home.spotlight', 'title', 'Unsaved title');           // not part of the publish
  ws.markPublished(77);
  assert.equal(ws.published().id, 77);
  assert.equal(ws.draft(), null);
  assert.equal(ws.basedOnDraft(), null);
  assert.equal(ws.cardStatus('home.featured'), 'published');
  assert.equal(ws.cardStatus('home.spotlight'), 'unsaved');
  assert.deepEqual(ws.unsavedCards(), ['home.spotlight']);
});
