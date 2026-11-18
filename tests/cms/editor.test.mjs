// Card editor logic: the declarative field schema (scripts/cms/content.js)
// and the published / draft / working states (scripts/cms/workspace.js),
// including conflicting saves. The RPCs are a fake in-memory server that
// follows save_draft's rules (PT409 when the expected draft id is stale).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const content = require('../../PergamonAtlas.V1/scripts/cms/content.js');
const workspace = require('../../PergamonAtlas.V1/scripts/cms/workspace.js');

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../PergamonAtlas.V1/data/home-content.js', import.meta.url), 'utf8'), sandbox);
const DOC = JSON.parse(JSON.stringify(sandbox.window.PergamonHomeContent.document));
const clone = o => JSON.parse(JSON.stringify(o));

// ── Field schema ───────────────────────────────────────────────────────
test('every card type gets its own fields from one schema, in order', () => {
  const keys = id => content.cardFields(id, DOC.components[id]).map(f => f.key);
  assert.deepEqual(keys('home.featured'), ['title', 'cta', 'href']);
  assert.deepEqual(keys('home.spotlight'), ['title', 'cta', 'href']);
  for (const id of DOC.components['home.carousel'].order) assert.deepEqual(keys('home.carousel.' + id), ['title', 'category', 'href']);
  assert.deepEqual(content.cardFields('home.carousel', DOC.components['home.carousel']), [], 'the order list is not a card');
  assert.deepEqual(content.cardFields('home.unknown', {}), []);
});

test('description appears only for a card that already has one', () => {
  const withDescription = { ...DOC.components['home.featured'], description: 'A strategy classic.' };
  assert.deepEqual(content.cardFields('home.featured', withDescription).map(f => f.key), ['title', 'description', 'cta', 'href']);
});

test('limits match the server: titles 60 (cards) / 40 (tiles), button 24, categories fixed', () => {
  const field = (id, key) => content.cardFields(id, DOC.components[id]).find(f => f.key === key);
  assert.equal(field('home.featured', 'title').max, 60);
  assert.equal(field('home.carousel.pong', 'title').max, 40);
  assert.equal(field('home.spotlight', 'cta').max, 24);
  assert.deepEqual(field('home.carousel.pong', 'category').options, ['Strategy', 'Arcade', 'Classic', 'Card']);
  assert.equal(field('home.carousel.pong', 'href').gamesOnly, true);
  assert.equal(field('home.featured', 'href').gamesOnly, false);
});

test('checkField accepts good values and explains bad ones', () => {
  const [title, , href] = content.cardFields('home.featured', DOC.components['home.featured']);
  const category = content.cardFields('home.carousel.pong', DOC.components['home.carousel.pong'])[1];
  assert.equal(content.checkField(title, 'Chess Forge'), null);
  assert.match(content.checkField(title, ''), /can’t be empty/);
  assert.match(content.checkField(title, 'x'.repeat(61)), /at most 60/);
  assert.match(content.checkField(title, 'Chess <b>'), /< and >/);
  assert.match(content.checkField(title, 'Chess‮Forge'), /control characters/);
  assert.match(content.checkField(title, 'Line\nbreak'), /control characters/);
  assert.equal(content.checkField(href, '/games/pong/'), null);
  for (const bad of ['', 'https://evil.example/', '//evil.example/', '/games/pong', '/Games/', 'javascript:alert(1)', '/games/../x/', '/games/?q=1'])
    assert.ok(content.checkField(href, bad), `rejects ${JSON.stringify(bad)}`);
  assert.equal(content.checkField(category, 'Arcade'), null);
  assert.ok(content.checkField(category, 'Puzzle'));
});

// ── Workspace ──────────────────────────────────────────────────────────
function fakeServer(published) {
  let nextId = 100;
  const db = { published: published ? { id: 5, content: clone(published) } : null, draft: null, saves: 0 };
  return {
    db,
    api: {
      async getDraft() {
        return { data: { page: 'home', draft: db.draft && { id: db.draft.id, content: clone(db.draft.content), created_at: '2026-11-17T12:00:00Z' }, published: db.published && clone(db.published) }, error: null };
      },
      async saveDraft(page, doc, expected) {
        if (!content.validateDocument(doc)) return { data: null, error: { code: 'PT422', message: 'invalid' } };
        const cur = db.draft ? db.draft.id : null;
        if (cur !== expected) return { data: null, error: { code: 'PT409', message: `the draft was changed by someone else (current ${cur}, expected ${expected})` } };
        db.draft = { id: ++nextId, content: clone(doc) };
        db.saves++;
        return { data: { page, draft_id: db.draft.id, previous_draft_id: cur }, error: null };
      }
    },
    // Another administrator saves directly.
    otherAdminSaves(edit) { const doc = clone(db.draft ? db.draft.content : db.published.content); edit(doc); db.draft = { id: ++nextId, content: doc }; }
  };
}
function memoryStorage() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m }; }
const make = (server, storage) => workspace.create({ page: 'home', api: server.api, storage: storage || memoryStorage(), validate: content.validateDocument, fallbackDoc: DOC });

test('three states: published, saved draft and the local working copy stay separate', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  assert.equal(ws.published().id, 5);
  assert.equal(ws.draft(), null);
  assert.equal(ws.cardStatus('home.featured'), 'published');

  ws.setField('home.featured', 'title', 'Chess Forge Live');
  assert.equal(ws.component('home.featured').title, 'Chess Forge Live');
  assert.equal(ws.cardStatus('home.featured'), 'unsaved');
  assert.deepEqual(ws.unsavedCards(), ['home.featured']);
  assert.equal(ws.published().doc.components['home.featured'].title, 'Chess Forge', 'published copy untouched');
  assert.equal(server.db.saves, 0, 'nothing sent before Save Draft');

  const r = await ws.save();
  assert.ok(r.ok);
  assert.equal(ws.draft().id, r.draftId);
  assert.equal(ws.cardStatus('home.featured'), 'draft');
  assert.equal(ws.cardStatus('home.spotlight'), 'published');
  assert.deepEqual(ws.unsavedCards(), []);
  assert.equal(server.db.published.content.components['home.featured'].title, 'Chess Forge', 'saving never publishes');
});

test('saving keeps every other card of the document as it was', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  ws.setField('home.carousel.pong', 'title', 'Pong Deluxe');
  await ws.save();
  const saved = server.db.draft.content;
  const expected = clone(DOC); expected.components['home.carousel.pong'].title = 'Pong Deluxe';
  assert.deepEqual(saved, expected);
});

test('editing starts from the saved draft when there is one', async () => {
  const server = fakeServer(DOC);
  server.otherAdminSaves(d => { d.components['home.spotlight'].cta = 'Play Today'; });
  const ws = make(server);
  await ws.load();
  assert.equal(ws.component('home.spotlight').cta, 'Play Today');
  assert.equal(ws.cardStatus('home.spotlight'), 'draft');
});

test('discarding one card restores it from its base and leaves other edits', async () => {
  const ws = make(fakeServer(DOC));
  await ws.load();
  ws.setField('home.featured', 'title', 'A');
  ws.setField('home.spotlight', 'title', 'B');
  ws.discardCard('home.featured');
  assert.equal(ws.component('home.featured').title, 'Chess Forge');
  assert.deepEqual(ws.unsavedCards(), ['home.spotlight']);
});

test('unsaved edits survive a reload in the same tab (sessionStorage) and are cleared on sign-out', async () => {
  const server = fakeServer(DOC);
  const storage = memoryStorage();
  const first = make(server, storage);
  await first.load();
  first.setField('home.featured', 'cta', 'Start');
  const again = make(server, storage);
  await again.load();
  assert.equal(again.component('home.featured').cta, 'Start');
  assert.equal(again.cardStatus('home.featured'), 'unsaved');
  again.clearLocal();
  assert.equal(storage.map.size, 0);
});

test('a tampered stored working copy is ignored', async () => {
  const server = fakeServer(DOC);
  const storage = memoryStorage();
  const ws = make(server, storage);
  await ws.load();
  ws.setField('home.featured', 'title', 'Edited');
  const key = [...storage.map.keys()][0];
  const stored = JSON.parse(storage.getItem(key));
  stored.working.components['home.featured'].href = 'https://evil.example/';
  storage.setItem(key, JSON.stringify(stored));
  const fresh = make(server, storage);
  await fresh.load();
  assert.equal(fresh.component('home.featured').href, '/games/chess-forge/');
});

test('conflict: another admin saved first → nothing is overwritten, local edits stay', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  ws.setField('home.featured', 'title', 'Mine');
  server.otherAdminSaves(d => { d.components['home.spotlight'].title = 'Theirs'; });
  const theirId = server.db.draft.id;
  const r = await ws.save();
  assert.ok(r.conflict, 'reported as a conflict');
  assert.equal(server.db.draft.id, theirId, 'their draft is still the current draft');
  assert.equal(server.db.draft.content.components['home.spotlight'].title, 'Theirs');
  assert.equal(ws.component('home.featured').title, 'Mine', 'local edit kept');
  assert.deepEqual(r.conflict.mine, ['home.featured']);
  assert.deepEqual(r.conflict.overlap, [], 'different cards');

  // Combining after confirmation keeps both people's work.
  const c = await ws.combine(r.conflict);
  assert.ok(c.ok);
  assert.equal(server.db.draft.content.components['home.featured'].title, 'Mine');
  assert.equal(server.db.draft.content.components['home.spotlight'].title, 'Theirs');
  assert.deepEqual(ws.unsavedCards(), []);
});

test('conflict on the same card is called out before anything is replaced', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  ws.setField('home.carousel.snake', 'title', 'Snake (mine)');
  server.otherAdminSaves(d => { d.components['home.carousel.snake'].title = 'Snake (theirs)'; });
  const r = await ws.save();
  assert.deepEqual(r.conflict.overlap, ['home.carousel.snake']);
  assert.equal(server.db.draft.content.components['home.carousel.snake'].title, 'Snake (theirs)');
  // Choosing their draft instead drops only the local copy.
  ws.adopt(r.conflict);
  assert.equal(ws.component('home.carousel.snake').title, 'Snake (theirs)');
  assert.deepEqual(ws.unsavedCards(), []);
  assert.equal(server.db.draft.content.components['home.carousel.snake'].title, 'Snake (theirs)');
});

test('a second save after a successful one uses the new draft id (no false conflict)', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  ws.setField('home.featured', 'title', 'One');
  assert.ok((await ws.save()).ok);
  ws.setField('home.featured', 'title', 'Two');
  assert.ok((await ws.save()).ok);
  assert.equal(server.db.saves, 2);
});

test('invalid working copies are never sent', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  ws.setField('home.featured', 'title', '');
  const r = await ws.save();
  assert.equal(r.error.code, 'invalid');
  assert.equal(server.db.saves, 0);
});

test('server errors are passed on with their codes', async () => {
  const server = fakeServer(DOC);
  server.api.saveDraft = async () => ({ data: null, error: { code: 'PT403', message: 'administrator access required' } });
  const ws = make(server);
  await ws.load();
  ws.setField('home.featured', 'title', 'X');
  const r = await ws.save();
  assert.equal(r.error.code, 'PT403');
  assert.equal(ws.cardStatus('home.featured'), 'unsaved', 'edit kept');
});
