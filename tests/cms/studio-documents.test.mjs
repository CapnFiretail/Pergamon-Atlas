// 0015_studio_documents.sql against the emulated Supabase: who may read and
// save a Studio document, what is accepted, revisions and conflicts, and the
// Studio's own storage and store (scripts/studio/) working through it.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createEnv, homeDoc } from './supabase-env.mjs';

const require = createRequire(import.meta.url);
const load = p => require(`../../PergamonAtlas.V1/scripts/${p}`);
const CONNECTIONS = load('studio/connections/document.js'), IDEAS = load('studio/ideas/document.js');
const map = load('studio/connections/seed.js').seed, collection = load('studio/ideas/seed.js').seed;
const { server } = load('studio/storage.js'), { create } = load('studio/store.js'), { createHistory } = load('grid/editor.js');
const sql = f => readFileSync(new URL(`../../supabase/proposed/${f}`, import.meta.url), 'utf8');

let env, admin, second, user;
before(async () => {
  env = await createEnv({ extra: ['0013_site_sidebar', '0014_page_layout', '0015_studio_documents'].filter(f => !(process.env.CMS_EXTRA_MIGRATIONS || '').split(',').includes(f)) });
  admin = await env.createUser('admin@example.test', { admin: true });
  second = await env.createUser('second@example.test', { admin: true });
  user = await env.createUser('user@example.test');
});
beforeEach(() => env.db.exec('delete from public.studio_documents'));

const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
const refused = (r, code, what) => assert.equal(r.error && r.error.code, code, what || (r.error ? r.error.message : 'accepted'));
const get = (who, kind) => env.rpc(who, 'get_studio_document', kind);
const save = (who, kind, doc, revision = null) => env.rpc(who, 'save_studio_document', kind, doc === null ? null : JSON.stringify(doc), revision);
const rows = () => env.db.query('select kind, revision, saved_by from public.studio_documents order by kind').then(r => r.rows);
const ideas = list => ({ format: 'pergamon-atlas.ideas', version: 1, ideas: list });

test('nothing saved yet is an explicit answer; saves count up from 1', async () => {
  assert.deepEqual(ok(await get(admin, 'ideas')), { kind: 'ideas', revision: null, document: null, saved_at: null });
  const one = ok(await save(admin, 'ideas', collection()));
  assert.ok(one.revision === 1 && one.saved_at);
  assert.equal(ok(await save(admin, 'ideas', collection(), 1)).revision, 2);
  assert.equal(ok(await get(admin, 'connections')).revision, null, 'each kind on its own');
});

test('one document for every administrator; the saver is recorded and never sent', async () => {
  ok(await save(admin, 'ideas', collection()));
  const seen = ok(await get(second, 'ideas'));
  assert.deepEqual(Object.keys(seen).sort(), ['document', 'kind', 'revision', 'saved_at']);
  assert.ok(IDEAS.same(IDEAS.parse(seen.document).document, IDEAS.parse(collection()).document));
  ok(await save(second, 'ideas', ideas([]), 1));
  assert.deepEqual(ok(await get(admin, 'ideas')).document, ideas([]), 'an empty collection is a saved one');
  assert.deepEqual(await rows(), [{ kind: 'ideas', revision: 2, saved_by: second.id }]);
});

test('guests, members and forged claims can neither read nor save', async () => {
  ok(await save(admin, 'ideas', collection()));
  const forged = { role: 'authenticated', claims: { role: 'authenticated', sub: user.id, user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } } };
  const nobody = { role: 'authenticated', claims: { role: 'authenticated' } };
  for (const [who, code] of [[env.anon, '42501'], [user, 'PT403'], [forged, 'PT403'], [nobody, 'PT403']]) {
    refused(await get(who, 'ideas'), code);
    refused(await save(who, 'ideas', ideas([]), 1), code);
    refused(await save(who, 'connections', map()), code);
    refused(await env.rpc(who, 'studio_check_document', 'ideas', JSON.stringify(ideas([]))), '42501', 'the validator is not exposed');
  }
  assert.deepEqual((await rows()).map(r => r.revision), [1]);
});

test('an administrator made a member loses access at once', async () => {
  const gone = await env.createUser('gone@example.test', { admin: true });
  ok(await save(gone, 'ideas', collection()));
  await env.db.query(`update public.profiles set role = 'user' where id = $1`, [gone.id]);
  refused(await get(gone, 'ideas'), 'PT403');
  refused(await save(gone, 'ideas', ideas([]), 1), 'PT403');
  // Deleting the account keeps the document.
  await env.db.query('delete from auth.users where id = $1', [gone.id]);
  assert.deepEqual(await rows(), [{ kind: 'ideas', revision: 1, saved_by: null }]);
});

test('no direct table access, for administrators either', async () => {
  ok(await save(admin, 'ideas', collection()));
  for (const who of [env.anon, user, admin]) for (const statement of [
    'select * from public.studio_documents', 'select * from public.studio_document_kinds',
    `insert into public.studio_documents (kind, revision, document) values ('connections', 1, '{}')`,
    `update public.studio_documents set revision = 99`, 'delete from public.studio_documents', 'truncate public.studio_documents',
    `insert into public.studio_document_kinds values ('x', 'pergamon-atlas.x', array['x'])`
  ]) refused(await env.as(who, tx => tx.query(statement)), '42501', `${who.role}: ${statement}`);
  assert.equal((await rows()).length, 1);
});

test('a save based on an older revision writes nothing', async () => {
  ok(await save(admin, 'ideas', collection()));
  refused(await save(second, 'ideas', ideas([])), 'PT409', 'as if nothing were saved');
  ok(await save(second, 'ideas', collection(), 1));
  for (const r of [1, 3, 0, -1, null]) refused(await save(admin, 'ideas', ideas([]), r), 'PT409', String(r));
  const now = ok(await get(admin, 'ideas'));
  assert.ok(now.revision === 2 && now.document.ideas.length === 56);
  refused(await save(admin, 'connections', map(), 1), 'PT409', 'a revision of something never saved');
});

test('two first saves at once: one wins', async () => {
  const results = await Promise.all([save(admin, 'ideas', collection()), save(second, 'ideas', ideas([]))]);
  assert.deepEqual(results.map(r => (r.error ? r.error.code : 'ok')).sort(), ['PT409', 'ok']);
});

test('only documents of that kind are accepted; a refusal leaves the saved one', async () => {
  ok(await save(admin, 'ideas', collection()));
  const idea = { id: 'a', title: 'A' };
  const bad = [
    ['not an object', [1]], ['null', null], ['another kind', map()], ['no format', { version: 1, ideas: [] }],
    ['another format', { ...ideas([]), format: 'x' }], ['format not text', { ...ideas([]), format: 1 }],
    ['no version', { format: 'pergamon-atlas.ideas', ideas: [] }], ['version 0', { ...ideas([]), version: 0 }], ['version text', { ...ideas([]), version: '1' }], ['version 1.5', { ...ideas([]), version: 1.5 }],
    ['no list', { format: 'pergamon-atlas.ideas', version: 1 }], ['list not a list', ideas({})], ['extra property', { ...ideas([]), secret: 1 }],
    ['entry not an object', ideas(['a'])], ['entry without id', ideas([{ title: 'A' }])], ['id not text', ideas([{ id: 1 }])], ['bad id', ideas([{ id: '<b>' }])], ['id twice', ideas([idea, idea])],
    ['too large', ideas(Array.from({ length: 3 }, (_, i) => ({ id: 'a' + i, notes: 'x'.repeat(800000) })))]
  ];
  for (const [what, doc] of bad) refused(await save(admin, 'ideas', doc, 1), 'PT422', what);
  refused(await save(admin, 'connections', { ...map(), connections: [{ id: map().nodes[0].id }] }), 'PT422', 'an id shared by a node and a connection');
  const nul = await env.rpc(admin, 'save_studio_document', 'ideas', '{"format":"pergamon-atlas.ideas","version":1,"ideas":[{"id":"a","title":"\\u0000"}]}', 1);
  assert.match(nul.error.code, /^22/);
  for (const kind of ['nope', '', null]) { refused(await get(admin, kind), 'PT404'); refused(await save(admin, kind, ideas([])), 'PT404'); }
  assert.equal(ok(await get(admin, 'ideas')).revision, 1);
});

test('text comes back exactly; what is not ours to judge is kept', async () => {
  const title = 'Ünï “quotes” <b>&amp; \\ / 👑\nline';
  ok(await save(admin, 'ideas', ideas([{ id: 'a', title, future: true }])));
  assert.deepEqual(ok(await get(second, 'ideas')).document.ideas, [{ id: 'a', title, future: true }]);
  ok(await save(admin, 'connections', map()));
  assert.ok(CONNECTIONS.same(CONNECTIONS.parse(ok(await get(second, 'connections')).document).document, CONNECTIONS.parse(map()).document));
});

test('a kind is added by one row, and nothing else', async () => {
  await env.db.exec(`insert into public.studio_document_kinds values ('notes', 'pergamon-atlas.notes', array['notes'])`);
  ok(await save(admin, 'notes', { format: 'pergamon-atlas.notes', version: 1, notes: [] }));
  refused(await get(user, 'notes'), 'PT403');
  await env.db.exec(`delete from public.studio_documents where kind = 'notes'; delete from public.studio_document_kinds where kind = 'notes'`);
});

test('the homepage CMS is untouched', async () => {
  const s = ok(await env.rpc(admin, 'save_draft', 'home', homeDoc(), null, null));
  ok(await env.rpc(admin, 'publish', 'home', s.draft_id, null));
  assert.ok(ok(await env.rpc(env.anon, 'get_published_content', 'home')).content);
});

test('verify_0015.sql: every row is ok, with and without documents', async () => {
  for (const fill of [false, true]) {
    if (fill) { ok(await save(admin, 'ideas', collection())); ok(await save(admin, 'connections', map())); }
    const r = (await env.db.query(sql('verify_0015.sql'))).rows;
    assert.ok(r.length === 8 && r.every(x => x.ok === true), JSON.stringify(r));
  }
});

// ── The Studio's storage and store, through the real functions ──────────────
const NAMES = { get_studio_document: ['p_kind'], save_studio_document: ['p_kind', 'p_document', 'p_expected_revision'] };
const client = who => ({ rpc: (fn, args) => env.rpc(who, fn, ...NAMES[fn].map(n => (args[n] && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]))) });
const session = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const open = who => create({ model: IDEAS, storage: server({ kind: 'ideas', client: client(who), session: session() }), createHistory, seed: collection });

test('two administrators: seed once, save, conflict, replace, empty', async () => {
  const a = open(admin), b = open(second);
  assert.equal((await a.load()).state, 'example');
  assert.equal((await b.load()).state, 'example');
  assert.equal((await rows()).length, 0, 'the seed isn’t stored by looking');
  a.commit(IDEAS.update(a.document(), 'chess-forge-2-0', { title: 'Mine' }));
  assert.ok((await a.save()).ok);
  assert.equal((await b.save()).code, 'conflict', 'the seed isn’t saved over it');
  assert.equal((await b.save({ force: true })).code, 'conflict', 'nor forced');
  assert.equal((await b.reload()).state, 'saved');
  assert.ok(IDEAS.same(a.document(), b.document()) && !b.dirty());
  b.commit(IDEAS.empty());
  assert.ok((await b.save()).ok);
  a.commit(IDEAS.remove(a.document(), 'chess-forge-2-0'));
  assert.equal((await a.save()).code, 'conflict');
  assert.ok((await a.save({ force: true })).ok, 'replacing a newer copy, when asked');
  a.commit(IDEAS.empty()); assert.ok((await a.save()).ok);
  const c = open(second);
  assert.equal((await c.load()).state, 'saved');
  assert.equal(c.document().ideas.length, 0, 'an empty collection stays empty');
});

test('a member’s browser: unavailable, nothing seeded, nothing saved', async () => {
  for (const who of [user, env.anon]) {
    const s = open(who);
    assert.equal((await s.load()).state, 'unavailable');
    assert.ok(s.blocked().why === 'denied' && s.document().ideas.length === 0 && !s.isExample());
    assert.equal((await s.save()).code, 'blocked');
  }
  assert.equal((await rows()).length, 0);
});

test('a database without 0015: said so, nothing seeded or saved', async () => {
  const bare = await createEnv({ without: ['0012'] });
  const boss = await bare.createUser('a@example.test', { admin: true });
  const s = create({ model: IDEAS, storage: server({ kind: 'ideas', client: { rpc: (fn, args) => bare.rpc(boss, fn, args.p_kind) }, session: session() }), createHistory, seed: collection });
  assert.equal((await s.load()).state, 'unavailable');
  assert.equal(s.blocked().why, 'missing');
});
