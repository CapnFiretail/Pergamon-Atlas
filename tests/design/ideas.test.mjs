// Atlas Studio › Ideas without a browser: the document and the starting collection.
// Saving it: studio-documents.test.mjs. No dependencies:
//   node --test tests/design/ideas.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const load = p => require(path.join(SITE, 'scripts', p));
const D = load('studio/ideas/document.js');
const { seed } = load('studio/ideas/seed.js');
const DAY = '2026-11-24';
const copy = v => JSON.parse(JSON.stringify(v));

test('the starting collection: every idea valid, captured, described, with its own id', () => {
  const p = D.parse(seed());
  assert.equal(p.errors, undefined);
  const { ideas } = p.document;
  assert.deepEqual(D.CATEGORIES.map(c => [c.label, ideas.filter(x => x.category === c.value).length]), [
    ['Long-term vision', 6], ['Atlas Studio', 12], ['Claude Code and development workflow', 9], ['Handbook and design system', 8],
    ['Admin Mode and content management', 6], ['Public website and games', 10], ['Deferred technical improvements', 4]]);
  ideas.forEach(x => { assert.equal(x.status, 'captured', x.id); assert.ok(x.title && x.description.endsWith('.') && x.notes === '', x.id); });
  assert.equal(new Set(ideas.map(x => x.title)).size, ideas.length);
  assert.ok(D.same(D.parse(D.serialize(p.document)).document, p.document));
});
test('the fields, statuses and where it is kept', () => {
  assert.deepEqual(D.STATUSES.map(s => s.label), ['Captured', 'Exploring', 'Planned', 'Completed']);
  assert.deepEqual(Object.keys(D.parse(seed()).document.ideas[0]), ['id', 'title', 'description', 'category', 'status', 'added', 'notes']);
  assert.equal(D.KEY, 'pa-studio-ideas');
});
test('adding, editing and deleting leave the input alone; ids and dates stay', () => {
  const doc = D.freeze(D.empty());
  const a = D.add(doc, { category: 'site', status: 'exploring' }, DAY), b = D.add(D.freeze(a.doc), { title: 'Second', category: 'nope' }, DAY);
  assert.ok(a.id && b.id && a.id !== b.id);
  assert.deepEqual(b.doc.ideas.map(x => [x.title, x.category, x.status, x.added]), [['Second', 'vision', 'captured', DAY], ['New idea', 'site', 'exploring', DAY]]);
  const e = D.update(D.freeze(b.doc), a.id, { title: 'Named', status: 'planned', id: 'x', added: '2000-01-01', other: 1 });
  assert.deepEqual(e.ideas[1], { id: a.id, title: 'Named', description: '', category: 'site', status: 'planned', added: DAY, notes: '' });
  assert.equal(D.update(e, a.id, { title: '   ', status: 'nope' }), e);
  assert.equal(D.update(e, 'nope', { title: 'x' }), e);
  assert.deepEqual(D.remove(D.freeze(e), a.id).ideas.map(x => x.id), [b.id]);
  assert.equal(D.remove(e, 'nope'), e);
  assert.equal(D.add(doc, {}, 'today').id, null);
});
test('search finds every word anywhere, with the filters', () => {
  const doc = D.update(D.parse(seed()).document, 'chess-forge-2-0', { status: 'exploring', notes: 'Café opening book' });
  const ids = q => D.find(doc, q).map(x => x.id);
  assert.deepEqual(ids({ text: 'CHESS forge' }), ['chess-forge-2-0']);
  assert.deepEqual(ids({ text: 'cafe book' }), ['chess-forge-2-0']);
  assert.deepEqual(ids({ status: 'exploring' }), ['chess-forge-2-0']);
  assert.deepEqual(ids({ text: 'carousel', category: 'site' }), ['carousel-refinement']);
  assert.deepEqual(ids({ text: 'chess', status: 'planned' }), []);
  assert.equal(ids({ text: '  ' }).length, doc.ideas.length);
});
test('anything unusable refuses the whole document; unknown properties are dropped', () => {
  const base = { format: D.FORMAT, version: 1, ideas: [{ id: 'a', title: 'A', category: 'site', status: 'captured', added: DAY }] };
  assert.deepEqual(D.parse({ ...base, extra: 1, ideas: [{ ...base.ideas[0], owner: 'x' }] }).document.ideas, [{ id: 'a', title: 'A', description: '', category: 'site', status: 'captured', added: DAY, notes: '' }]);
  const bad = fn => { const d = copy(base); fn(d); return D.parse(d); };
  [d => { d.format = 'pergamon-atlas.connections'; }, d => { d.version = 2; }, d => { d.version = 0; }, d => { d.ideas = {}; }, d => { d.ideas.push(d.ideas[0]); },
    d => { d.ideas[0].id = '<b>'; }, d => { d.ideas[0].title = ' '; }, d => { d.ideas[0].title = 'x'.repeat(121); }, d => { delete d.ideas[0].title; }, d => { d.ideas[0].category = 'x'; },
    d => { d.ideas[0].status = 'Done'; }, d => { delete d.ideas[0].status; }, d => { d.ideas[0].added = '2026-02-30'; }, d => { delete d.ideas[0].added; }, d => { d.ideas[0].notes = 5; }, d => { d.ideas = [null]; }]
    .forEach((fn, i) => assert.ok(bad(fn).errors && bad(fn).errors.length, 'case ' + i));
  ['{', 'null', '[]', ''].forEach(t => assert.ok(D.parse(t).errors));
});
