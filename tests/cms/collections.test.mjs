// Card collections in the browser modules: saved Featured / Spotlight cards
// and carousel add / delete / reorder (scripts/cms/content.js, workspace.js,
// publish.js), drafts and conflicts with them, the limits shared with the
// server (0012), and older editors (the released e5df0ed modules, frozen in
// fixtures/) keeping saved cards they don't know about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const content = require('../../PergamonAtlas.V1/scripts/cms/content.js');
const workspace = require('../../PergamonAtlas.V1/scripts/cms/workspace.js');
const publish = require('../../PergamonAtlas.V1/scripts/cms/publish.js');
const oldContent = require('./fixtures/released-e5df0ed/content.cjs');
const oldWorkspace = require('./fixtures/released-e5df0ed/workspace.cjs');

const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../PergamonAtlas.V1/data/home-content.js', import.meta.url), 'utf8'), sandbox);
const DOC = JSON.parse(JSON.stringify(sandbox.window.PergamonHomeContent.document));
const clone = o => JSON.parse(JSON.stringify(o));
const card = title => ({ title, cta: 'Play Now', href: '/games/chess-forge/' });
function withSaved() {
  const d = clone(DOC);
  d.components['home.featured.saved'] = { order: ['summer-cup', 'winter-cup'] };
  d.components['home.featured.saved.summer-cup'] = card('Summer Cup');
  d.components['home.featured.saved.winter-cup'] = card('Winter Cup');
  return d;
}

// A server that follows save_draft's rules (PT409 when the expected draft is stale).
function fakeServer(start) {
  const db = { published: { id: 1, content: clone(start) }, draft: null, next: 10 };
  return {
    db,
    api: {
      async getDraft() { return { data: { published: clone(db.published), draft: db.draft && clone(db.draft) }, error: null }; },
      async saveDraft(page, doc, expected) {
        if ((db.draft ? db.draft.id : null) !== expected) return { data: null, error: { code: 'PT409', message: 'stale' } };
        db.draft = { id: ++db.next, content: clone(doc), created_at: new Date().toISOString(), based_on_published_id: db.published.id };
        return { data: { draft_id: db.draft.id }, error: null };
      }
    }
  };
}
const make = (server, mod = workspace, validate = content.validateDocument) => mod.create({ page: 'home', api: server.api, validate });

// ── content.js ─────────────────────────────────────────────────────────
test('ids: saved cards keep their slot’s type; lists and keys', () => {
  assert.equal(content.cardType('home.featured.saved.summer-cup'), 'feature');
  assert.equal(content.cardType('home.spotlight.saved.pong-night'), 'spotlight');
  assert.equal(content.cardType('home.featured.saved'), null, 'a list is not a card');
  assert.equal(content.cardType('home.featured.saved.Bad Key'), null);
  assert.equal(content.slotOf('home.spotlight.saved.x'), 'home.spotlight');
  assert.equal(content.slotOf('home.featured'), 'home.featured');
  assert.equal(content.isSaved('home.featured'), false);
  assert.equal(content.listOf('home.carousel.snake'), 'home.carousel');
  assert.equal(content.listOf('home.featured.saved.x'), 'home.featured.saved');
  assert.equal(content.listOf('home.featured'), null);
  assert.equal(content.newKey('Summer Cup!', []), 'summer-cup');
  assert.equal(content.newKey('Summer Cup', ['summer-cup', 'home.featured.saved.summer-cup-2']), 'summer-cup-3');
  assert.equal(content.newKey('', []), 'card');
  assert.equal(content.newKey('Échecs — Forge', []), 'echecs-forge');
  assert.ok(content.newKey('x'.repeat(80), []).length <= 34);
});

test('model: saved cards per slot; visitors’ documents have none', () => {
  const m = content.toModel(withSaved(), {});
  assert.deepEqual(m.saved['home.featured'].map(c => c.title), ['Summer Cup', 'Winter Cup']);
  assert.equal(m.saved['home.featured'][0].type, 'feature');
  assert.deepEqual(m.saved['home.spotlight'], []);
  assert.equal(m.featured.title, DOC.components['home.featured'].title, 'the active card is unchanged');
  assert.deepEqual(content.toModel(DOC, {}).saved, { 'home.featured': [], 'home.spotlight': [] });
});

test('validation: saved lists checked like the server; limits shared with 0012', () => {
  assert.ok(content.validateDocument(withSaved()));
  const bad = [
    d => { d.components['home.featured.saved'].order.push('summer-cup'); },
    d => { d.components['home.featured.saved'].order.push('missing'); },
    d => { d.components['home.featured.saved.summer-cup'].href = 'https://evil.example/'; },
    d => { d.components['home.featured.saved'] = { order: 'x' }; },
    d => { d.components['home.featured.saved'].order = Array.from({ length: 13 }, (_, i) => 'c' + i); }
  ];
  bad.forEach((change, i) => { const d = withSaved(); change(d); assert.equal(content.validateDocument(d), false, `case ${i}`); });
  const sql = readFileSync(new URL('../../supabase/proposed/0012_saved_cards.sql', import.meta.url), 'utf8');
  assert.match(sql, new RegExp(`jsonb_array_length\\(ord\\) > ${content.LIMITS.saved}\\b`), 'saved limit as in SQL');
  assert.match(sql, new RegExp(`jsonb_array_length\\(ord\\) > ${content.LIMITS.carousel}\\b`), 'carousel limit as in SQL');
  assert.deepEqual(content.LIMITS, { saved: 12, carousel: 24 });
});

// ── workspace.js ───────────────────────────────────────────────────────
test('carousel: add, move and delete cards in the working copy; statuses and discard', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  const id = ws.addCard('home.carousel', 'tic-tac-toe', { title: 'Tic Tac Toe', category: 'Classic', href: '/games/tic-tac-toe/' }, 0);
  assert.equal(id, 'home.carousel.tic-tac-toe');
  assert.equal(ws.addCard('home.carousel', 'tic-tac-toe', {}), null, 'key taken');
  assert.equal(ws.order('home.carousel')[0], 'tic-tac-toe');
  assert.equal(ws.cardStatus(id), 'unsaved');
  assert.ok(ws.moveCard('home.carousel.snake', 1));
  assert.deepEqual(ws.order('home.carousel').slice(0, 2), ['tic-tac-toe', 'snake']);
  assert.ok(ws.removeCard('home.carousel.pong'));
  assert.equal(ws.component('home.carousel.pong'), undefined);
  assert.deepEqual(ws.unsavedCards().sort(), ['home.carousel', 'home.carousel.pong', 'home.carousel.tic-tac-toe'].sort());
  assert.ok(content.validateDocument(ws.working()), 'still a valid document');
  // Discard: the deleted card returns to its place; the added one goes.
  ws.discardCard('home.carousel.pong');
  assert.equal(ws.order('home.carousel').indexOf('pong'), DOC.components['home.carousel'].order.indexOf('pong'));
  ws.discardCard(id);
  assert.equal(ws.component(id), undefined);
  ws.discardCard('home.carousel');
  assert.deepEqual(ws.working(), DOC, 'back to the saved document');
  assert.deepEqual(ws.unsavedCards(), []);
});

test('saved cards: add, make active (nothing lost), switch back restores the document', async () => {
  const server = fakeServer(DOC);
  const ws = make(server);
  await ws.load();
  const id = ws.addCard('home.featured.saved', 'summer-cup', card('Summer Cup'));
  assert.ok(content.validateDocument(ws.working()));
  const liveBefore = clone(ws.component('home.featured'));
  const outKey = content.newKey(liveBefore.title, ws.order('home.featured.saved'));
  assert.ok(ws.activate(id, outKey));
  assert.equal(ws.component('home.featured').title, 'Summer Cup');
  assert.deepEqual(ws.component('home.featured.saved.' + outKey), liveBefore, 'the old active card is saved, intact');
  assert.deepEqual(ws.order('home.featured.saved'), [outKey]);
  assert.equal(ws.component(id), undefined);
  // Switch back: the same keys come back, so the document is as before.
  assert.ok(ws.activate('home.featured.saved.' + outKey, content.newKey('Summer Cup', [])));
  assert.deepEqual(ws.component('home.featured'), liveBefore);
  assert.deepEqual(ws.order('home.featured.saved'), ['summer-cup']);
  // Removing the last saved card leaves no empty list behind.
  ws.removeCard('home.featured.saved.summer-cup');
  assert.deepEqual(ws.working(), DOC);
  assert.equal(ws.removeCard('home.featured'), false, 'the active card can’t be removed');
});

test('saving and reloading keeps collections (persistence)', async () => {
  const server = fakeServer(DOC);
  const store = new Map();
  const storage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  const ws = workspace.create({ page: 'home', api: server.api, validate: content.validateDocument, storage });
  await ws.load();
  ws.addCard('home.spotlight.saved', 'pong-night', { title: 'Pong Night', cta: 'Play', href: '/games/pong/' });
  ws.moveCard('home.carousel.blackjack', 0);
  // Unsaved edits survive a reload of the page (sessionStorage).
  const again = workspace.create({ page: 'home', api: server.api, validate: content.validateDocument, storage });
  await again.load();
  assert.deepEqual(again.working(), ws.working());
  assert.ok((await again.save()).ok);
  assert.deepEqual(server.db.draft.content.components['home.spotlight.saved'], { order: ['pong-night'] });
  assert.equal(server.db.draft.content.components['home.carousel'].order[0], 'blackjack');
  const fresh = make(server);
  await fresh.load();
  assert.deepEqual(fresh.working(), server.db.draft.content, 'a new session starts from the saved draft');
  assert.equal(fresh.cardStatus('home.spotlight.saved.pong-night'), 'draft');
});

test('conflicts: combining keeps their added cards, my deletions and my order', async () => {
  const server = fakeServer(DOC);
  const mine = make(server);
  await mine.load();
  // Someone else saves first: adds Tic Tac Toe and edits Snake.
  const theirs = make(server);
  await theirs.load();
  theirs.addCard('home.carousel', 'tic-tac-toe', { title: 'Tic Tac Toe', category: 'Classic', href: '/games/tic-tac-toe/' });
  theirs.setField('home.carousel.snake', 'title', 'Snake Deluxe');
  assert.ok((await theirs.save()).ok);
  // Meanwhile: I delete Pong, move Blackjack first, and add a saved featured card.
  mine.removeCard('home.carousel.pong');
  mine.moveCard('home.carousel.blackjack', 0);
  mine.addCard('home.featured.saved', 'summer-cup', card('Summer Cup'));
  const r = await mine.save();
  assert.ok(r.conflict && !r.conflict.error);
  assert.deepEqual(r.conflict.overlap, ['home.carousel'], 'we both changed the carousel list');
  const done = await mine.combine(r.conflict);
  assert.ok(done.ok);
  const c = server.db.draft.content.components;
  assert.deepEqual(c['home.carousel'].order, ['blackjack', 'battleship', 'breakout', 'connect-four', 'snake', 'tic-tac-toe'], 'my order, their new card appended, my deletion kept');
  assert.equal(c['home.carousel.pong'], undefined);
  assert.equal(c['home.carousel.snake'].title, 'Snake Deluxe', 'their edit kept');
  assert.deepEqual(c['home.featured.saved'], { order: ['summer-cup'] });
  assert.ok(content.validateDocument(server.db.draft.content));
});

// ── Older editors (released before saved cards) ────────────────────────
test('an older editor keeps saved cards it doesn’t know: edit, save, conflict, combine', async () => {
  const server = fakeServer(withSaved());
  // Released content.js accepts the document and draws the active cards.
  assert.equal(oldContent.validateDocument(withSaved()), true);
  assert.equal(oldContent.toModel(withSaved(), {}).featured.title, DOC.components['home.featured'].title);
  const old = make(server, oldWorkspace, oldContent.validateDocument);
  await old.load();
  old.setField('home.featured', 'title', 'Chess Forge II');
  assert.ok((await old.save()).ok);
  const saved = server.db.draft.content.components;
  assert.equal(saved['home.featured'].title, 'Chess Forge II');
  assert.deepEqual(saved['home.featured.saved'], { order: ['summer-cup', 'winter-cup'] }, 'saved list kept');
  assert.deepEqual(saved['home.featured.saved.winter-cup'], card('Winter Cup'), 'saved card kept');
  // A new editor adds a saved card; the old one, out of date, combines on top.
  const fresh = make(server);
  await fresh.load();
  fresh.addCard('home.featured.saved', 'autumn-cup', card('Autumn Cup'));
  assert.ok((await fresh.save()).ok);
  old.setField('home.carousel.snake', 'title', 'Snake II');
  const r = await old.save();
  assert.ok(r.conflict);
  assert.ok((await old.combine(r.conflict)).ok);
  const after = server.db.draft.content.components;
  assert.deepEqual(after['home.featured.saved'].order, ['summer-cup', 'winter-cup', 'autumn-cup'], 'the newer saved card survives the old editor');
  assert.equal(after['home.carousel.snake'].title, 'Snake II');
});

// ── publish.js summary ─────────────────────────────────────────────────
test('summary: added, deleted, reordered cards and a new active card', () => {
  const pub = withSaved();
  const draft = clone(pub);
  const c = draft.components;
  c['home.carousel.tic-tac-toe'] = { title: 'Tic Tac Toe', category: 'Classic', href: '/games/tic-tac-toe/' };
  c['home.carousel'].order.push('tic-tac-toe');
  delete c['home.carousel.pong'];
  c['home.carousel'].order = c['home.carousel'].order.filter(k => k !== 'pong');
  // Make Winter Cup active; Chess Forge is saved.
  c['home.featured.saved.chess-forge'] = c['home.featured'];
  c['home.featured'] = c['home.featured.saved.winter-cup'];
  delete c['home.featured.saved.winter-cup'];
  c['home.featured.saved'].order = ['summer-cup', 'chess-forge'];
  const s = publish.summarize(pub, draft, content);
  const by = Object.fromEntries(s.cards.map(x => [x.id, x]));
  assert.deepEqual(by['home.carousel.tic-tac-toe'].changes, ['Added']);
  assert.deepEqual(by['home.carousel.pong'].changes, ['Deleted']);
  assert.match(by['home.featured'].changes[0], /Now shows a saved card \(was “Chess Forge”\)/);
  assert.equal(by['home.featured'].title, 'Winter Cup');
  assert.equal(by['home.featured.saved.chess-forge'].typeLabel, 'Saved featured card');
  assert.deepEqual(by['home.featured.saved.chess-forge'].changes, ['Added to saved cards']);
  assert.deepEqual(s.other, [], 'nothing reordered: additions and deletions only');
  // A brand-new card made active in the same draft: the previous one is saved.
  const fresh = clone(pub);
  fresh.components['home.featured.saved.chess-forge'] = fresh.components['home.featured'];
  fresh.components['home.featured'] = { title: 'Autumn Cup', cta: 'Play Now', href: '/games/chess-forge/' };
  fresh.components['home.featured.saved'].order.push('chess-forge');
  const sf = publish.summarize(pub, fresh, content);
  assert.match(sf.cards.find(x => x.id === 'home.featured').changes[0], /Now shows a new card \(“Chess Forge” was saved\)/);
  const moved = clone(pub);
  moved.components['home.carousel'].order.reverse();
  assert.deepEqual(publish.summarize(pub, moved, content).other, ['Carousel order']);
});
