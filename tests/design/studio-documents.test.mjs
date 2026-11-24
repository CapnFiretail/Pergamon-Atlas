// Atlas Studio's saved documents without a browser: the shared storage and store
// (scripts/studio/storage.js, store.js) with the Ideas document. No dependencies:
//   node --test tests/design/studio-documents.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { area, createServer } from './studio-server.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const load = p => require(path.join(SITE, 'scripts', p));
const D = load('studio/ideas/document.js');
const { seed } = load('studio/ideas/seed.js');
const S = load('studio/storage.js');
const { create } = load('studio/store.js');
const { createHistory } = load('grid/editor.js');

function open(db, { local = area(), session = area(), wait } = {}) {
  const storage = S.server({ kind: 'ideas', key: D.KEY, client: db.client, session, name: 'staging', wait });
  const store = create({ model: D, storage, browser: S.browser({ key: D.KEY, storage: local }), createHistory, seed });
  return { db, local, session, storage, store };
}
const mine = title => D.add(D.empty(), { title }, '2026-11-24').doc;
const put = (local, document, revision = 3) => local.setItem(D.KEY, JSON.stringify({ revision, savedAt: '2026-11-20T10:00:00Z', document }));
const titles = s => s.document().ideas.map(x => x.title);
const type = (s, title) => s.commit(D.add(s.document(), { title }, '2026-11-24').doc);

// ── Answers ─────────────────────────────────────────────────────────────────
const FAILURES = [
  ['no network', () => { throw new TypeError('Failed to fetch'); }, 'unavailable'],
  ['a server error', () => ({ data: null, error: { code: '', message: '<html>' }, status: 502 }), 'unavailable'],
  ['a paused database', () => ({ data: null, error: { code: 'PGRST000', message: '' }, status: 503 }), 'unavailable'],
  ['an empty answer', () => ({ data: null, error: null }), 'unavailable'],
  ['an answer that isn’t ours', () => ({ data: { kind: 'ideas', revision: 'x' }, error: null }), 'unavailable'],
  ['another kind’s answer', () => ({ data: { kind: 'connections', revision: null, document: null }, error: null }), 'unavailable'],
  ['an expired session', () => ({ data: null, error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 }), 'denied'],
  ['not signed in', () => ({ data: null, error: { code: '42501', message: '' }, status: 401 }), 'denied'],
  ['not an administrator', () => ({ data: null, error: { code: 'PT403', message: '' }, status: 403 }), 'denied'],
  ['no migration', () => ({ data: null, error: { code: 'PGRST202', message: '' }, status: 404 }), 'missing']
];
test('a failed load is never taken for nothing saved: no seed, nothing to edit', async () => {
  for (const [what, fail, why] of FAILURES) {
    const db = createServer(), { store } = open(db);
    db.fail = fail;
    assert.equal((await store.load()).state, 'unavailable', what);
    assert.equal(store.blocked().why, why, what);
    assert.ok(store.document().ideas.length === 0 && !store.isExample() && !store.dirty(), what);
    assert.ok(!type(store, 'x') && !store.edit('k', mine('x')) && store.document().ideas.length === 0, what);
    assert.equal((await store.save()).code, 'blocked', what);
    store.reset();
    assert.equal(store.blocked().code, 'unavailable', 'only an unreadable copy can be started over');
    db.fail = null;
    assert.equal((await store.load()).state, 'example', what + ', then back');
    assert.deepEqual(db.saved, {});
  }
});
test('a failed save says why, keeps the changes, and works once the server is back', async () => {
  for (const [what, fail, why] of FAILURES.concat([['refused', () => ({ data: null, error: { code: 'PT422', message: 'document: larger than 2 MB' } }), 'refused']])) {
    const db = createServer(), { store } = open(db);
    await store.load(); type(store, 'Kept');
    db.fail = fail;
    const r = await store.save();
    assert.ok(!r.ok && r.code === why, `${what}: ${r.code}`);
    assert.ok(store.dirty() && titles(store)[0] === 'Kept' && store.isExample() && store.savedAt() === null, what);
    db.fail = null;
    assert.ok((await store.save()).ok && !store.dirty() && db.saved.ideas.revision === 1, what);
  }
});
test('no answer in time is no answer', async () => {
  const db = createServer(), { store } = open(db, { wait: 20 });
  db.fail = () => new Promise(() => {});
  assert.equal((await store.load()).state, 'unavailable');
});
test('a save whose answer was lost is recognised, not reported as somebody else’s', async () => {
  const db = createServer(), { store } = open(db);
  await store.load(); type(store, 'Mine');
  db.fail = fn => (fn === 'save_studio_document' ? 'lost' : null);
  assert.equal((await store.save()).code, 'unavailable');
  assert.ok(store.dirty() && db.saved.ideas.revision === 1);
  db.fail = null;
  assert.ok((await store.save()).ok && !store.dirty() && db.saved.ideas.revision === 1);
});
test('while loading, nothing can be changed or saved', async () => {
  const { store } = open(createServer());
  assert.equal(store.blocked().code, 'loading');
  assert.ok(!type(store, 'x') && (await store.save()).code === 'blocked');
});

// ── Sharing ─────────────────────────────────────────────────────────────────
test('one collection for every browser; the first save of one isn’t forced onto another', async () => {
  const db = createServer(), a = open(db), b = open(db);
  await a.store.load(); await b.store.load();
  type(a.store, 'A'); assert.ok((await a.store.save()).ok);
  type(b.store, 'B');
  assert.equal((await b.store.save()).code, 'conflict');
  assert.ok(b.store.first() && b.store.newer());
  assert.equal((await b.store.save({ force: true })).code, 'conflict');
  assert.ok(db.saved.ideas.revision === 1 && titles(b.store)[0] === 'B');
  await b.store.reload();
  assert.ok(titles(b.store)[0] === 'A' && !b.store.first());
  type(b.store, 'B'); assert.ok((await b.store.save()).ok);
  type(a.store, 'A2');
  assert.equal((await a.store.save()).code, 'conflict');
  assert.ok(!a.store.first() && (await a.store.save({ force: true })).ok && db.saved.ideas.revision === 3);
});
test('the newer copy can’t be loaded: the changes stay; replacing while offline writes nothing', async () => {
  const db = createServer(), a = open(db), b = open(db);
  await a.store.load(); await a.store.save(); await b.store.load();
  type(a.store, 'A'); await a.store.save();
  type(b.store, 'B'); assert.equal((await b.store.save()).code, 'conflict');
  db.fail = FAILURES[0][1];
  assert.equal((await b.store.reload()).state, 'unavailable');
  assert.ok(!b.store.blocked() && titles(b.store)[0] === 'B');
  assert.equal((await b.store.save({ force: true })).code, 'unavailable');
  assert.equal(db.saved.ideas.revision, 2);
});
test('coming back to the page shows a newer copy, unless there is work of one’s own', async () => {
  const db = createServer(), visible = [];
  globalThis.document = { visibilityState: 'visible', addEventListener: (t, fn) => visible.push(fn), removeEventListener() {} };
  const a = open(db), b = open(db), other = open(db);
  delete globalThis.document;
  const look = async () => { visible.forEach(fn => fn()); await new Promise(r => setTimeout(r, 5)); };
  for (const x of [other, a, b]) { await x.store.load(); if (x === other) await x.store.save(); }
  type(b.store, 'Own work');
  type(other.store, 'New'); await other.store.save();
  await look();
  assert.ok(titles(a.store)[0] === 'New' && !a.store.dirty());
  assert.ok(titles(b.store)[0] === 'Own work' && b.store.newer());
  db.fail = FAILURES[0][1]; await look();
  assert.ok(!a.store.blocked() && titles(a.store)[0] === 'New' && titles(b.store)[0] === 'Own work', 'offline changes nothing');
  db.fail = null; assert.equal((await b.store.save()).code, 'conflict');
});
test('an empty collection stays empty; a later seed changes nothing saved', async () => {
  const db = createServer(), a = open(db);
  await a.store.load(); a.store.commit(D.empty()); assert.ok((await a.store.save()).ok);
  const b = open(db);
  assert.equal((await b.store.load()).state, 'saved');
  assert.equal(b.store.document().ideas.length, 0);
});

// ── Unsaved work ────────────────────────────────────────────────────────────
test('unsaved work survives a reload while the database is away', async () => {
  const db = createServer(), a = open(db);
  await a.store.load(); await a.store.save(); type(a.store, 'Unsaved'); a.store.keep();
  const b = open(db, { session: a.session });
  db.fail = FAILURES[0][1];
  assert.equal((await b.store.load()).state, 'unavailable');
  assert.equal(b.store.kept().document.ideas[0].title, 'Unsaved');
  b.store.keep();
  db.fail = null;
  assert.equal((await b.store.load()).state, 'restored');
  assert.ok(titles(b.store)[0] === 'Unsaved' && !b.store.newer() && (await b.store.save()).ok);
});
test('work kept by a version that saved in the browser is restored, never over what is stored', async () => {
  const session = area(), db = createServer();
  session.setItem(D.KEY + ':working', JSON.stringify({ document: mine('Old work'), revision: 1 }));
  const o = open(db); await o.store.load(); await o.store.save();      // revision 1, as in the old numbering
  const a = open(db, { session });
  assert.equal((await a.store.load()).state, 'restored');
  assert.ok(titles(a.store)[0] === 'Old work' && a.store.newer());
  assert.equal((await a.store.save()).code, 'conflict');
  assert.equal(session.getItem(D.KEY + ':working'), null);
});

// ── A copy saved in this browser before ─────────────────────────────────────
test('moving: shown instead of the seed, stored only by a save, and left in the browser', async () => {
  const db = createServer(), local = area();
  put(local, mine('From this browser'));
  const raw = local.getItem(D.KEY), a = open(db, { local });
  assert.equal((await a.store.load()).state, 'browser');
  assert.ok(titles(a.store)[0] === 'From this browser' && a.store.start() === 'browser' && a.store.isExample() && !a.store.dirty());
  assert.deepEqual(db.saved, {}, 'nothing moves by itself');
  db.fail = FAILURES[0][1];
  assert.ok(!(await a.store.save()).ok && a.store.start() === 'browser' && a.store.earlier().mark === null);
  db.fail = null;
  assert.ok((await a.store.save()).ok);
  assert.equal(db.saved.ideas.document.ideas[0].title, 'From this browser');
  assert.ok(a.store.start() === null && a.store.earlier().same && a.store.earlier().mark === 'moved');
  assert.equal(local.getItem(D.KEY), raw, 'the copy is untouched');
  type(a.store, 'Later'); await a.store.save();
  const b = open(db, { local });
  assert.equal((await b.store.load()).state, 'saved');
  assert.ok(!b.store.earlier().same && b.store.earlier().mark === 'moved');
});
test('an intentionally empty browser collection is moved as it is', async () => {
  const db = createServer(), local = area();
  put(local, D.empty());
  const a = open(db, { local });
  assert.equal((await a.store.load()).state, 'browser');
  assert.ok((await a.store.save()).ok && db.saved.ideas.document.ideas.length === 0);
});
test('a stored document is never replaced by a browser’s copy, not even when it appears meanwhile', async () => {
  const db = createServer(), local = area(), first = open(db);
  put(local, mine('Local'));
  const a = open(db, { local });
  await a.store.load(); await first.store.load();
  assert.ok((await first.store.save()).ok);
  assert.equal((await a.store.save()).code, 'conflict');
  assert.equal((await a.store.save({ force: true })).code, 'conflict');
  assert.equal(db.saved.ideas.revision, 1);
  assert.equal((await a.store.reload()).state, 'saved');
  assert.ok(a.store.earlier().document.ideas[0].title === 'Local' && !a.store.earlier().same && a.store.earlier().mark === null);
});
test('removing the browser’s copy needs a saved document to be there, and the same copy', async () => {
  const db = createServer(), local = area();
  put(local, mine('Local'));
  const a = open(db, { local });
  await a.store.load();
  assert.equal(await a.store.removeEarlier(), 'unavailable', 'nothing stored yet');
  await a.store.save();
  db.fail = FAILURES[0][1];
  assert.equal(await a.store.removeEarlier(), 'unavailable');
  db.fail = null;
  put(local, mine('Changed by an older page'), 4);
  assert.equal(await a.store.removeEarlier(), 'changed');
  assert.ok(local.getItem(D.KEY));
  const b = open(db, { local }); await b.store.load();
  assert.equal(b.store.earlier().mark, null, 'what was said about the old copy isn’t about this one');
  assert.equal(await b.store.removeEarlier(), 'removed');
  assert.ok(local.getItem(D.KEY) === null && b.store.earlier() === null && db.saved.ideas.revision === 1);
});
test('an unreadable or blocked browser copy stops nothing and is left alone', async () => {
  for (const raw of ['{broken', JSON.stringify({ revision: 3, document: { ...D.empty(), version: 9 } })]) {
    const db = createServer(), local = area();
    local.setItem(D.KEY, raw);
    const a = open(db, { local });
    assert.equal((await a.store.load()).state, 'example');
    assert.ok(a.store.earlier().errors && a.store.earlier().raw === raw);
    await a.store.save();
    assert.equal(local.getItem(D.KEY), raw);
  }
  const closed = { getItem() { throw new Error('denied'); } };
  assert.equal((await open(createServer(), { local: closed }).store.load()).state, 'example');
});

// ── Boundaries ──────────────────────────────────────────────────────────────
test('the Studio reaches the database in one file, by its two functions, in the page’s own project', () => {
  const read = f => readFileSync(path.join(SITE, 'scripts/studio', f), 'utf8');
  const storage = read('storage.js');
  assert.deepEqual([...storage.matchAll(/call\('(\w+)'/g)].map(m => m[1]), ['get_studio_document', 'save_studio_document']);
  assert.doesNotMatch(storage, /supabase\.co|createClient|rddijjezqrcjrnwskenb|rambkiswuigtjfgdxexk|\.from\(|sb_|setItem\(key\b/);
  ['ideas/page.js', 'connections/page.js'].forEach(f => assert.match(read(f), /ns\.storage\.server\(\{ kind: '(ideas|connections)', key: D\.KEY \}\)/));
});
