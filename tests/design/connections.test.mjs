// Atlas Studio › Connections without a browser: geometry, the service registry,
// the document, storage and the store. No dependencies:
//   node --test tests/design/connections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { area, createServer } from './studio-server.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const load = p => require(path.join(SITE, 'scripts', p));
const G = load('canvas/geometry.js');
const { registry, NODE_FIELDS, CONNECTION_FIELDS } = load('studio/connections/registry.js');
const D = load('studio/connections/document.js');
const { KEY } = D;
const { server } = load('studio/storage.js');
const { create } = load('studio/store.js');
const { seed } = load('studio/connections/seed.js');
const { createHistory } = load('grid/editor.js');

const example = () => D.parse(seed()).document;
const frozen = doc => D.freeze(JSON.parse(JSON.stringify(doc)));

// ── Geometry ────────────────────────────────────────────────────────────────
test('zooming keeps the point under the pointer, within limits', () => {
  const v = { x: 30, y: -20, z: 0.8 }, p = { x: 300, y: 200 };
  const z = G.zoomAt(v, 1.4, p), a = G.toWorld(v, p), b = G.toWorld(z, p);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
  assert.equal(G.zoomAt(v, 99, p).z, G.ZOOM.max);
  assert.equal(G.zoomAt(v, 0, p).z, G.ZOOM.min);
});
test('fit shows every node beside what covers the canvas, and never enlarges', () => {
  const nodes = [{ x: -500, y: 40 }, { x: 900, y: 700 }], size = { w: 900, h: 600 }, insets = { right: 300 };
  const v = G.fit(G.bounds(nodes), size, { insets });
  nodes.forEach(n => {
    const a = G.toScreen(v, n), b = G.toScreen(v, { x: n.x + G.NODE.w, y: n.y + G.NODE.h });
    assert.ok(a.x >= 0 && a.y >= 0 && b.x <= size.w - insets.right && b.y <= size.h, JSON.stringify([a, b]));
  });
  assert.equal(G.fit(G.bounds([{ x: 0, y: 0 }]), size).z, 1);
  assert.equal(G.fit(null, size).z, 1);
});
test('facing and nearest ports', () => {
  assert.deepEqual(G.facingPorts({ x: 0, y: 0 }, { x: 400, y: 20 }), ['right', 'left']);
  assert.deepEqual(G.facingPorts({ x: 0, y: 0 }, { x: 60, y: -300 }), ['top', 'bottom']);
  assert.equal(G.nearestPort({ x: 0, y: 0 }, { x: 190, y: 36 }).port, 'right');
});

// ── Registry ────────────────────────────────────────────────────────────────
test('the predefined services', () => {
  assert.deepEqual(registry.list().map(d => d.name), ['ChatGPT', 'Claude Code', 'GitHub', 'VS Code', 'Vercel', 'Supabase', 'Cloudflare', 'Pergamon Atlas', 'Handbook']);
  registry.list().forEach(d => {
    assert.ok(Object.isFrozen(d) && Array.isArray(d.fields) && d.logo && d.category, d.type);
    assert.equal(D.checkField(NODE_FIELDS.find(f => f.key === 'url'), d.url), '', d.type);
    assert.ok(!/\bon\w+=|<script|style=/.test(d.logo), d.type);
  });
  assert.deepEqual(registry.search('data base').map(d => d.type), ['supabase']);
  assert.equal(registry.get('nope'), null);
});

// ── Document ────────────────────────────────────────────────────────────────
test('the example is valid and survives a round trip', () => {
  const p = D.parse(seed());
  assert.equal(p.errors, undefined);
  assert.ok(D.same(D.parse(D.serialize(p.document)).document, p.document));
  p.document.connections.forEach(c => assert.ok(c.name && c.description, c.id));
});
test('several instances of a service, each with its own id and name', () => {
  let doc = frozen(D.empty());
  const ids = [];
  for (let i = 0; i < 3; i++) { const r = D.addNode(doc, 'github', D.freeSpot(doc, { x: 5, y: 5 })); ids.push(r.id); doc = frozen(r.doc); }
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(doc.nodes.map(n => n.name), ['GitHub', 'GitHub 2', 'GitHub 3']);
  doc.nodes.forEach((a, i) => doc.nodes.forEach((b, j) => assert.ok(i === j || Math.abs(a.x - b.x) >= G.NODE.w || Math.abs(a.y - b.y) >= G.NODE.h)));
  assert.equal(D.addNode(doc, 'nope', { x: 0, y: 0 }).id, null);
});
test('a node’s service, id and position are not editable properties', () => {
  const doc = frozen(example()), next = D.updateNode(doc, 'github', { type: 'vercel', id: 'x', x: 9, logo: 'x', name: 'Repo' });
  const n = next.nodes.find(x => x.id === 'github');
  assert.deepEqual([n.type, n.x, n.name, n.logo], ['github', 312, 'Repo', undefined]);
  assert.equal(D.updateNode(doc, 'github', { name: ' ' }), doc, 'a value that fails its check changes nothing');
});
test('resource addresses', () => {
  const url = NODE_FIELDS.find(f => f.key === 'url');
  ['', '/handbook/', 'https://example.com/a?b=c', 'http://localhost:4173/'].forEach(v => assert.equal(D.checkField(url, v), '', v));
  ['javascript:alert(1)', 'data:text/html,x', '//evil.test/', 'https://user:pass@example.com/', 'example.com', 'https://a b/', 'x'.repeat(600), '/\\evil.test'].forEach(v => assert.ok(D.checkField(url, v), v));
});
test('connections: independent objects with ports', () => {
  const doc = frozen(example());
  const r = D.connect(doc, { node: 'chatgpt', port: 'right' }, { node: 'vscode', port: 'left' });
  const c = r.doc.connections.find(x => x.id === r.id);
  assert.deepEqual([c.source, c.target, c.direction], [{ node: 'chatgpt', port: 'right' }, { node: 'vscode', port: 'left' }, 'forward']);
  assert.ok(D.checkConnection(r.doc, c.target, c.source), 'the same two ports, either way round');
  assert.ok(D.checkConnection(doc, { node: 'chatgpt', port: 'top' }, { node: 'chatgpt', port: 'left' }), 'itself');
  assert.ok(D.checkConnection(doc, { node: 'chatgpt', port: 'middle' }, { node: 'vscode', port: 'left' }), 'no such port');
  const moved = D.reconnect(frozen(r.doc), r.id, 'target', { node: 'github', port: 'top' });
  assert.deepEqual(moved.connections.find(x => x.id === r.id).target, { node: 'github', port: 'top' });
  assert.equal(D.reconnect(moved, r.id, 'target', { node: 'chatgpt', port: 'left' }), moved, 'refused: nothing changes');
  const named = D.updateConnection(moved, r.id, { name: 'N', direction: 'both', source: 'x', notes: 'n' }).connections.find(x => x.id === r.id);
  assert.deepEqual([named.name, named.direction, named.source.node], ['N', 'both', 'chatgpt']);
  assert.equal(D.updateConnection(moved, r.id, { direction: 'sideways' }), moved);
});
test('removing a node removes exactly its connections', () => {
  const doc = frozen(example()), next = D.removeNode(doc, 'github');
  const gone = D.connectionsOf(doc, 'github').length;
  assert.ok(gone > 1);
  assert.equal(next.connections.length, doc.connections.length - gone);
  assert.ok(!D.connectionsOf(next, 'github').length && next.nodes.length === doc.nodes.length - 1);
});
test('parse refuses what it can’t use, completely', () => {
  const bad = (change, want) => {
    const doc = seed();
    change(doc);
    const r = D.parse(doc);
    assert.ok(r.errors && !r.document, want);
    assert.match(r.errors.join(' '), want);
  };
  assert.ok(D.parse('{').errors && D.parse(null).errors && D.parse([]).errors && D.parse('{}').errors);
  bad(d => { d.version = 2; }, /version 2/);
  bad(d => { d.version = 0; }, /version/);
  bad(d => { d.nodes = {}; }, /list of nodes/);
  bad(d => { d.nodes[0].type = 'evil'; }, /unknown service/);
  bad(d => { d.nodes[0].type = '__proto__'; }, /unknown service/);
  bad(d => { d.nodes[1].id = d.nodes[0].id; }, /used twice/);
  bad(d => { d.nodes[0].id = '"><img>'; }, /no usable id/);
  bad(d => { d.nodes[0].x = 'NaN'; }, /position/);
  bad(d => { d.nodes[0].url = 'javascript:alert(1)'; }, /https/);
  bad(d => { d.nodes[0].name = ''; }, /display name/i);
  bad(d => { d.nodes[0].notes = 'x'.repeat(3000); }, /Notes/);
  bad(d => { d.connections[0].target.node = 'gone'; }, /join/);
  bad(d => { d.connections[0].source.port = 'middle'; }, /join/);
  bad(d => { d.connections[0].target = { ...d.connections[0].source }; }, /itself/);
  bad(d => { d.connections[0].direction = 'up'; }, /direction/i);
  bad(d => { d.connections.push({ ...d.connections[0], id: 'again' }); }, /repeats/);
  bad(d => { d.nodes = Array.from({ length: 201 }, (_, i) => ({ ...d.nodes[0], id: 'n' + i })); }, /Too many nodes/);
});
test('parse drops unknown properties and fills missing ones', () => {
  const doc = seed();
  doc.secret = 1; doc.nodes[0].logo = '<svg onload=x>'; doc.nodes[0].props = { key: 'x' };
  delete doc.nodes[0].notes; delete doc.connections[0].direction;
  const d = D.parse(doc).document;
  assert.deepEqual(Object.keys(d), ['format', 'version', 'nodes', 'connections']);
  assert.deepEqual(Object.keys(d.nodes[0]), ['id', 'type', 'x', 'y', 'name', 'description', 'url', 'notes', 'props']);
  assert.deepEqual([d.nodes[0].props, d.nodes[0].notes, d.connections[0].direction], [{}, '', 'forward']);
  assert.deepEqual(CONNECTION_FIELDS.map(f => f.key), ['name', 'description', 'direction', 'notes']);
});

// ── Storage and store ───────────────────────────────────────────────────────
function setup(db = createServer(), session = area()) {
  const storage = server({ kind: 'connections', key: KEY, client: db.client, session, name: 'staging' });
  return { db, session, storage, store: create({ model: D, storage, createHistory, seed }) };
}
const nudge = (store, id = 'github') => store.commit(D.moveNode(store.document(), id, { x: 600, y: 600 }));

test('first use shows the example and stores nothing until Save', async () => {
  const { store, db } = setup();
  assert.equal((await store.load()).state, 'example');
  assert.ok(store.isExample() && !store.dirty() && !db.saved.connections);
  assert.ok((await store.save()).ok);
  assert.ok(!store.isExample() && db.saved.connections.revision === 1);
  const again = setup(db);
  assert.equal((await again.store.load()).state, 'saved');
  assert.ok(D.same(again.store.document(), store.document()));
});
test('undo, redo, typing as one step, discard', async () => {
  const { store } = setup();
  await store.load(); await store.save();
  const start = store.document();
  nudge(store);
  assert.ok(store.dirty() && store.undo() && !store.dirty() && store.redo() && store.dirty());
  store.undo();
  ['R', 'Re', 'Rep'].forEach(name => store.edit('node:github:name', D.updateNode(store.document(), 'github', { name })));
  store.settle();
  store.edit('node:github:name', D.updateNode(store.document(), 'github', { name: 'Repo' }));
  store.undo(); assert.equal(store.document().nodes.find(n => n.id === 'github').name, 'Rep');
  store.undo(); assert.equal(store.document(), start);
  nudge(store); store.discard(); assert.ok(!store.dirty() && D.same(store.document(), start));
  store.undo(); assert.ok(store.dirty());
});
test('a newer saved copy is never overwritten silently', async () => {
  const a = setup(); await a.store.load(); await a.store.save();
  const b = setup(a.db); await b.store.load();
  nudge(b.store); assert.ok((await b.store.save()).ok);
  nudge(a.store, 'vercel');
  const before = a.db.saved.connections;
  assert.equal((await a.store.save()).code, 'conflict');
  assert.ok(a.db.saved.connections === before && a.store.dirty() && a.store.newer());
  assert.ok((await a.store.save({ force: true })).ok && !a.store.dirty());
  nudge(b.store, 'vercel'); await b.store.save(); await b.store.reload();
  assert.ok(!b.store.dirty() && D.same(b.store.document(), a.store.document()));
});
test('unsaved changes are kept for the tab, and restored once', async () => {
  const a = setup(); await a.store.load(); await a.store.save();
  nudge(a.store); a.store.keep();
  const b = setup(a.db, a.session);
  assert.equal((await b.store.load()).state, 'restored');
  assert.ok(b.store.dirty() && D.same(b.store.document(), a.store.document()) && a.session.m.size === 0);
  b.store.undo(); assert.ok(!b.store.dirty());
  b.store.redo(); b.store.keep(); b.store.discard(); assert.equal(a.session.m.size, 0, 'discarded work isn’t kept');
});
test('an unreadable copy is reported and left alone until a save', async () => {
  const db = createServer(), kept = { revision: 4, document: { ...D.empty(), version: 99 }, saved_at: null };
  db.saved.connections = kept;
  const { store } = setup(db);
  assert.equal((await store.load()).state, 'unreadable');
  assert.deepEqual(await store.save(), { ok: false, code: 'blocked' });
  assert.equal(JSON.parse(store.blocked().raw).version, 99);
  store.keep(); store.reset();
  assert.equal(db.saved.connections, kept);
  assert.ok((await store.save()).ok && db.saved.connections.revision === 5 && D.parse(db.saved.connections.document).document);
});

// ── Boundaries ──────────────────────────────────────────────────────────────
test('the copies browsers saved are looked for where they are', () => assert.equal(KEY, 'pa-studio-connections'));
test('the canvas knows nothing about Studio or the CMS, and only storage.js reaches the database', () => {
  const read = f => readFileSync(path.join(SITE, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  ['geometry', 'renderer', 'interaction'].forEach(f => assert.doesNotMatch(read(`scripts/canvas/${f}.js`), /PergamonStudio|PergamonCMS|PergamonHandbook|localStorage/, f));
  ['store', 'document-flow', ...['registry', 'document', 'seed', 'library', 'inspector', 'page'].map(f => 'connections/' + f), ...['document', 'seed', 'page'].map(f => 'ideas/' + f)].forEach(f => assert.doesNotMatch(read(`scripts/studio/${f}.js`), /\bfetch\(|XMLHttpRequest|Supabase\.|PergamonSupabaseClient|WebSocket/, f));
});
test('the Handbook’s Node Canvas sources exist', () => {
  const src = readFileSync(path.join(SITE, 'scripts/handbook/canvas-page.js'), 'utf8');
  const files = [...src.matchAll(/'((?:scripts|styles)\/[\w./-]+)'/g)].map(m => m[1]);
  assert.ok(files.length > 8);
  files.forEach(f => assert.ok(existsSync(path.join(SITE, f)), f));
});
