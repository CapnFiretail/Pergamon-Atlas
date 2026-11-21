// 0012_saved_cards.sql against the emulated Supabase: saved Featured /
// Spotlight cards (validation, limits, images), what visitors receive,
// carousel add / delete / reorder, rollback restoring all of it, and the
// published-history function behind Admin Mode's Version History.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, homeDoc } from './supabase-env.mjs';

let env, admin, user;
before(async () => {
  env = await createEnv();
  admin = await env.createUser('admin@example.test', { admin: true });
  user = await env.createUser('user@example.test');
  await env.db.query(`update public.profiles set display_name = 'Ada Admin' where id = $1`, [admin.id]);
});

const denied = r => r.error && r.error.code === '42501';
const forbidden = r => r.error && r.error.code === 'PT403';
const invalid = r => r.error && r.error.code === 'PT422';
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };

async function current() {
  const d = ok(await env.rpc(admin, 'get_draft', 'home'));
  return { draftId: d.draft ? d.draft.id : null, publishedId: d.published ? d.published.id : null };
}
async function publishDoc(doc) {
  const { draftId, publishedId } = await current();
  const s = ok(await env.rpc(admin, 'save_draft', 'home', doc, draftId, null));
  return ok(await env.rpc(admin, 'publish', 'home', s.draft_id, publishedId)).version;
}
async function prepareMedia() {
  const up = ok(await env.rpc(admin, 'create_media_upload', 'image/webp', 1000));
  const sha = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  ok(await env.rpc(env.service, 'cms_record_prepared_media', up.media_id, `media/${sha}.webp`, 'image/webp', 1000, 1600, 900, sha));
  return up.media_id;
}
const card = (title, href = '/games/chess-forge/') => ({ title, cta: 'Play Now', href });
// A document with saved cards in both slots.
function withSaved(featured = ['summer-cup'], spotlight = ['pong-night']) {
  const d = homeDoc();
  if (featured) {
    d.components['home.featured.saved'] = { order: featured };
    featured.forEach(id => { d.components[`home.featured.saved.${id}`] = card(id.replace(/-/g, ' ')); });
  }
  if (spotlight) {
    d.components['home.spotlight.saved'] = { order: spotlight };
    spotlight.forEach(id => { d.components[`home.spotlight.saved.${id}`] = card(id.replace(/-/g, ' '), '/games/pong/'); });
  }
  return d;
}
const saveFails = async doc => {
  const { draftId } = await current();
  return env.rpc(admin, 'save_draft', 'home', doc, draftId, null);
};

test('documents without saved cards are unchanged (backward compatible)', async () => {
  const v = await publishDoc(homeDoc());
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub.version, v);
  assert.deepEqual(pub.content, homeDoc(), 'public content is exactly the stored document');
});

test('saved cards: saved and published; visitors receive only the active cards', async () => {
  const media = await prepareMedia();
  const d = withSaved(['summer-cup', 'winter-cup']);
  d.components['home.featured.saved.winter-cup'].art = { source: { media }, alt: '' };
  const v = await publishDoc(d);
  const admins = ok(await env.rpc(admin, 'get_draft', 'home'));
  assert.deepEqual(admins.published.content, d, 'administrators get the whole document');
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub.version, v);
  assert.deepEqual(Object.keys(pub.content.components).filter(k => k.includes('.saved')), [], 'no saved lists or cards');
  assert.deepEqual(pub.content.components['home.featured'], homeDoc().components['home.featured'], 'active card as stored');
  assert.deepEqual(pub.media, {}, 'images used only by saved cards are not listed');
  assert.ok(!JSON.stringify(pub).includes('summer cup'), 'saved titles not sent');
  const signedIn = ok(await env.rpc(user, 'get_published_content', 'home'));
  assert.deepEqual(signedIn.content, pub.content, 'signed-in users get the same as guests');
  // The saved card becomes active (the old active card is saved): its image is now listed.
  const swapped = structuredClone(d);
  swapped.components['home.featured'] = d.components['home.featured.saved.winter-cup'];
  delete swapped.components['home.featured.saved.winter-cup'];
  swapped.components['home.featured.saved.chess-forge'] = d.components['home.featured'];
  swapped.components['home.featured.saved'] = { order: ['summer-cup', 'chess-forge'] };
  await publishDoc(swapped);
  const after = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(after.content.components['home.featured'].title, 'winter cup');
  assert.ok(after.media[media], 'the active card’s image is public');
});

test('saved cards need their image prepared before publishing', async () => {
  const unprepared = ok(await env.rpc(admin, 'create_media_upload', 'image/png', 2000)).media_id;
  const d = withSaved(['summer-cup']);
  d.components['home.featured.saved.summer-cup'].art = { source: { media: unprepared } };
  const { draftId, publishedId } = await current();
  const s = ok(await env.rpc(admin, 'save_draft', 'home', d, draftId, null));
  const r = await env.rpc(admin, 'publish', 'home', s.draft_id, publishedId);
  assert.ok(r.error, 'refused');
  assert.equal((await current()).publishedId, publishedId, 'live version unchanged');
  ok(await env.rpc(admin, 'discard_draft', 'home', s.draft_id));
});

test('saved-card validation: lists, ids, limits and card fields', async () => {
  const cases = {
    'unknown slot component': d => { d.components['home.featured.extra'] = card('X'); },
    'saved card not listed': d => { d.components['home.featured.saved.ghost'] = card('Ghost'); },
    'listed card missing': d => { d.components['home.featured.saved'].order.push('missing'); },
    'listed twice': d => { d.components['home.featured.saved'].order.push('summer-cup'); },
    'bad id': d => { d.components['home.featured.saved'].order = ['Summer Cup']; },
    'order not a list': d => { d.components['home.featured.saved'] = { order: 'summer-cup' }; },
    'extra field on the list': d => { d.components['home.featured.saved'].active = 'summer-cup'; },
    'card list without order': d => { d.components['home.spotlight.saved'] = {}; },
    'saved card title too long': d => { d.components['home.featured.saved.summer-cup'].title = 'x'.repeat(61); },
    'saved card markup': d => { d.components['home.featured.saved.summer-cup'].title = '<b>Cup</b>'; },
    'saved card external link': d => { d.components['home.featured.saved.summer-cup'].href = 'https://evil.example/'; },
    'saved card unknown field': d => { d.components['home.featured.saved.summer-cup'].onclick = 'x'; },
    'saved card in the wrong slot': d => { d.components['home.spotlight.saved.summer-cup'] = card('X'); },
    'active card still required': d => { delete d.components['home.featured']; }
  };
  for (const [name, change] of Object.entries(cases)) {
    const d = withSaved(['summer-cup']);
    change(d);
    assert.ok(invalid(await saveFails(d)), name);
  }
  // Limits: 12 saved per slot (13 refused), 24 carousel cards (25 refused).
  const ids = n => Array.from({ length: n }, (_, i) => `card-${i + 1}`);
  ok(await saveFails(withSaved(ids(12), ids(12))));
  assert.ok(invalid(await saveFails(withSaved(ids(13), null))), '13 saved featured');
  assert.ok(invalid(await saveFails(withSaved(null, ids(13)))), '13 saved spotlight');
  const c = homeDoc();
  c.components['home.carousel'].order = ids(24);
  ids(24).forEach(id => { c.components[`home.carousel.${id}`] = { title: id, category: 'Arcade', href: '/games/pong/' }; });
  ['battleship', 'breakout', 'pong', 'blackjack', 'connect-four', 'snake'].forEach(id => delete c.components[`home.carousel.${id}`]);
  ok(await saveFails(c));
  const c25 = structuredClone(c);
  c25.components['home.carousel'].order.push('card-25');
  c25.components['home.carousel.card-25'] = { title: 'card-25', category: 'Arcade', href: '/games/pong/' };
  assert.ok(invalid(await saveFails(c25)), '25 carousel cards');
  const { draftId } = await current();
  if (draftId) ok(await env.rpc(admin, 'discard_draft', 'home', draftId));
});

test('carousel: added, deleted, reordered and emptied cards publish as stored', async () => {
  const d = homeDoc();
  // Add Tic Tac Toe first, delete Pong, move Snake before Breakout.
  d.components['home.carousel.tic-tac-toe'] = { title: 'Tic Tac Toe', category: 'Classic', href: '/games/tic-tac-toe/' };
  delete d.components['home.carousel.pong'];
  d.components['home.carousel'].order = ['tic-tac-toe', 'battleship', 'snake', 'breakout', 'blackjack', 'connect-four'];
  await publishDoc(d);
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.deepEqual(pub.content.components['home.carousel'].order, ['tic-tac-toe', 'battleship', 'snake', 'breakout', 'blackjack', 'connect-four']);
  assert.equal(pub.content.components['home.carousel.pong'], undefined);
  // An empty carousel is allowed.
  const empty = homeDoc();
  Object.keys(empty.components).filter(k => k.startsWith('home.carousel.')).forEach(k => delete empty.components[k]);
  empty.components['home.carousel'].order = [];
  await publishDoc(empty);
  assert.deepEqual(ok(await env.rpc(env.anon, 'get_published_content', 'home')).content.components['home.carousel'].order, []);
});

test('rollback restores saved cards, the active choice and carousel order', async () => {
  const media = await prepareMedia();
  const a = withSaved(['summer-cup', 'winter-cup'], ['pong-night']);
  a.components['home.featured.saved.winter-cup'].art = { source: { media } };
  a.components['home.carousel'].order = ['snake', 'battleship', 'breakout', 'pong', 'blackjack', 'connect-four'];
  const va = await publishDoc(a);
  // Later: a saved card deleted, another made active, a carousel card deleted.
  const b = structuredClone(a);
  b.components['home.featured'] = a.components['home.featured.saved.summer-cup'];
  delete b.components['home.featured.saved.summer-cup'];
  delete b.components['home.featured.saved.winter-cup'];
  delete b.components['home.featured.saved'];
  delete b.components['home.carousel.snake'];
  b.components['home.carousel'].order = ['battleship', 'breakout', 'pong', 'blackjack', 'connect-four'];
  const vb = await publishDoc(b);
  const r = ok(await env.rpc(admin, 'rollback', 'home', va, vb));
  const admins = ok(await env.rpc(admin, 'get_draft', 'home'));
  assert.equal(admins.published.id, r.version);
  assert.deepEqual(admins.published.content, a, 'everything as in the restored version');
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub.content.components['home.featured'].title, 'Chess Forge');
  assert.deepEqual(pub.content.components['home.carousel'].order, a.components['home.carousel'].order);
  // The deleted card's image is still there (nothing is deleted with a card).
  const m = ok(await env.rpc(admin, 'get_media', [media]));
  assert.ok(m[media] && m[media].public_path, 'image kept');
});

test('published history: admins only, published versions with content, restores marked', async () => {
  assert.ok(denied(await env.rpc(env.anon, 'list_published_versions', 'home', 10)), 'anon has no access');
  assert.ok(forbidden(await env.rpc(user, 'list_published_versions', 'home', 10)), 'users refused');
  const list = ok(await env.rpc(admin, 'list_published_versions', 'home', 50));
  assert.ok(list.length >= 3);
  assert.ok(list.every(v => v.status === 'published' || v.status === 'archived'), 'no drafts');
  assert.equal(list.filter(v => v.status === 'published').length, 1);
  assert.deepEqual(list.map(v => v.id), list.map(v => v.id).slice().sort((x, y) => y - x), 'newest first');
  assert.ok(list.every(v => v.content && v.content.schema === 1 && v.published_at), 'content and date');
  assert.ok(list.every(v => v.published_by === 'Ada Admin'), 'publisher name');
  assert.ok(!JSON.stringify(list).includes(admin.id), 'no account ids');
  const restored = list[0];
  assert.ok(restored.restored_from, 'the latest version is a restore');
  assert.equal(list.find(v => v.id === restored.restored_from).status, 'archived');
  assert.equal(list[1].restored_from, null, 'an ordinary publish is not a restore');
  assert.equal(ok(await env.rpc(admin, 'list_published_versions', 'home', 2)).length, 2, 'limit');
  assert.ok(ok(await env.rpc(admin, 'list_published_versions', 'home', 1000)).length <= 50, 'capped');
});

test('function privileges stay as 0008 set them', async () => {
  for (const who of [env.anon, user, admin]) {
    assert.ok(denied(await env.rpc(who, 'cms_check_card', {}, 'x', [])), `cms_check_card ${who.role}`);
    assert.ok(denied(await env.rpc(who, 'validate_content', 'home', homeDoc())), `validate_content ${who.role}`);
  }
  ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.ok(denied(await env.rpc(env.anon, 'save_draft', 'home', homeDoc(), null, null)));
  assert.ok(forbidden(await env.rpc(user, 'save_draft', 'home', withSaved(), null, null)), 'users can’t save saved cards');
});

test('0012 can be applied to a database that already has content (no data change)', async () => {
  const old = await createEnv({ without: ['0012'] });
  const a = await old.createUser('a@example.test', { admin: true });
  const s = (await old.rpc(a, 'save_draft', 'home', homeDoc(), null, null)).data;
  const p = (await old.rpc(a, 'publish', 'home', s.draft_id, null)).data;
  assert.ok(p.version);
  assert.ok((await old.rpc(a, 'save_draft', 'home', withSaved(), null, null)).error, 'before 0012: saved cards refused');
  const before = (await old.db.query(`select id, status, content from public.site_content_versions order by id`)).rows;
  const { readFileSync } = await import('node:fs');
  await old.db.exec(readFileSync(new URL('../../supabase/proposed/0012_saved_cards.sql', import.meta.url), 'utf8'));
  const after = (await old.db.query(`select id, status, content from public.site_content_versions order by id`)).rows;
  assert.deepEqual(after, before, 'stored versions untouched');
  const pub = (await old.rpc(old.anon, 'get_published_content', 'home')).data;
  assert.deepEqual(pub.content, homeDoc(), 'same public answer');
  // And it can be applied twice (create or replace).
  await old.db.exec(readFileSync(new URL('../../supabase/proposed/0012_saved_cards.sql', import.meta.url), 'utf8'));
  const d = (await old.rpc(a, 'get_draft', 'home')).data;
  assert.ok((await old.rpc(a, 'save_draft', 'home', withSaved(), d.draft ? d.draft.id : null, null)).data, 'after 0012: accepted');
});
