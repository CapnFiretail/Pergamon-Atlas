// 0013_site_sidebar.sql against the emulated Supabase: the site-wide sidebar
// (`site.sidebar`) in the homepage document — what is accepted, what is
// refused (destinations, icons, labels, sizes), what visitors receive, and
// rollback taking it away again.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, homeDoc } from './supabase-env.mjs';

let env, admin, user;
before(async () => {
  env = await createEnv({ extra: ['0013_site_sidebar'] });
  admin = await env.createUser('admin@example.test', { admin: true });
  user = await env.createUser('user@example.test');
});

const invalid = r => r.error && r.error.code === 'PT422';
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };
async function current() {
  const d = ok(await env.rpc(admin, 'get_draft', 'home'));
  return { draftId: d.draft ? d.draft.id : null, publishedId: d.published ? d.published.id : null };
}
async function save(doc) { const { draftId } = await current(); return env.rpc(admin, 'save_draft', 'home', doc, draftId, null); }
async function publishDoc(doc) {
  const { publishedId } = await current();
  const s = ok(await save(doc));
  return ok(await env.rpc(admin, 'publish', 'home', s.draft_id, publishedId)).version;
}

const item = (id, href, icon = 'home', extra = {}) => Object.assign({ id, label: id.replace(/-/g, ' '), icon, href, visible: true }, extra);
const NAV = {
  sections: [
    { items: [item('home', '/'), item('games', '/games/', 'games'), item('suggestions', '/suggestions/', 'suggestions')] },
    { items: [item('achievements', '/achievements/', 'achievements'), item('leaderboards', '/leaderboards/', 'leaderboards', { visible: false })] }
  ]
};
const withNav = nav => { const d = homeDoc(); d.components['site.sidebar'] = nav; return d; };
const navWith = changes => { const n = structuredClone(NAV); changes(n); return n; };

test('documents without site.sidebar are still valid (backward compatible)', async () => {
  await publishDoc(homeDoc());
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub.content.components['site.sidebar'], undefined);
});

test('a valid sidebar is saved, published and sent to every visitor', async () => {
  const v = await publishDoc(withNav(NAV));
  for (const who of [env.anon, user]) {
    const pub = ok(await env.rpc(who, 'get_published_content', 'home'));
    assert.equal(pub.version, v);
    assert.deepEqual(pub.content.components['site.sidebar'], NAV);
  }
  // Every allowed page, an icon each, and a game page from the route list.
  const all = { sections: [{ items: [
    item('a', '/'), item('b', '/games/', 'games'), item('c', '/suggestions/', 'suggestions'), item('d', '/achievements/', 'achievements'),
    item('e', '/leaderboards/', 'leaderboards'), item('f', '/updates/', 'updates'), item('g', '/settings/', 'settings'),
    item('h', '/account/', 'account'), item('i', '/games/chess-forge/', 'games')
  ] }] };
  ok(await save(withNav(all)));
});

test('destinations: only the site’s own pages and game pages', async () => {
  for (const href of ['https://example.com/', 'http://evil.test/', '//evil.test/', 'javascript:alert(1)', '/handbook/', '/admin/',
    '/settings', '/games/unknown-game/', '/../account/', '/account/?x=1', '/ACCOUNT/', '', ' /']) {
    const r = await save(withNav(navWith(n => { n.sections[0].items[0].href = href; })));
    assert.ok(invalid(r), `refused: ${JSON.stringify(href)} (${r.error && r.error.message})`);
  }
  assert.ok(invalid(await save(withNav(navWith(n => { n.sections[0].items[0].href = 42; })))), 'href must be a string');
});

test('icons, labels, ids, visibility and shape are checked', async () => {
  const bad = [
    ['unknown icon', n => { n.sections[0].items[0].icon = 'skull'; }],
    ['empty label', n => { n.sections[0].items[0].label = ''; }],
    ['long label', n => { n.sections[0].items[0].label = 'x'.repeat(25); }],
    ['markup in label', n => { n.sections[0].items[0].label = '<b>Home</b>'; }],
    ['bad id', n => { n.sections[0].items[0].id = 'Home!'; }],
    ['duplicate id', n => { n.sections[1].items[0].id = 'home'; }],
    ['visible not boolean', n => { n.sections[0].items[0].visible = 'yes'; }],
    ['missing field', n => { delete n.sections[0].items[0].visible; }],
    ['extra field', n => { n.sections[0].items[0].target = '_blank'; }],
    ['extra key on the component', n => { n.style = {}; }],
    ['no sections', n => { n.sections = []; }],
    ['empty group', n => { n.sections[1].items = []; }],
    ['five groups', n => { n.sections = [0, 1, 2, 3, 4].map(i => ({ items: [item('x' + i, '/')] })); }],
    ['thirteen in a group', n => { n.sections = [{ items: Array.from({ length: 13 }, (_, i) => item('i' + i, '/')) }]; }],
    ['seventeen in all', n => { n.sections = [0, 1].map(s => ({ items: Array.from({ length: s ? 5 : 12 }, (_, i) => item(`s${s}-${i}`, '/')) })); }]
  ];
  for (const [what, change] of bad) {
    const r = await save(withNav(navWith(change)));
    assert.ok(invalid(r), `refused: ${what} (${r.error ? r.error.message : 'accepted'})`);
  }
  assert.ok(invalid(await save(withNav('not an object'))), 'component must be an object');
  // Sixteen in all is fine.
  ok(await save(withNav({ sections: [0, 1].map(s => ({ items: Array.from({ length: s ? 4 : 12 }, (_, i) => item(`s${s}-${i}`, '/')) })) })));
});

test('only administrators can save it; the checker is not callable', async () => {
  const doc = withNav(NAV);
  for (const who of [env.anon, user]) {
    const r = await env.rpc(who, 'save_draft', 'home', doc, null, null);
    assert.ok(r.error, 'refused for non-admins');
  }
  for (const who of [env.anon, user]) {
    const r = await env.rpc(who, 'cms_check_nav', NAV, 'x');
    assert.equal(r.error && r.error.code, '42501', 'cms_check_nav is not exposed');
  }
});

test('rollback to a version without the sidebar takes it away again', async () => {
  const before = await publishDoc(homeDoc());
  await publishDoc(withNav(NAV));
  ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  const { publishedId } = await current();
  ok(await env.rpc(admin, 'rollback', 'home', before, publishedId));
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub.content.components['site.sidebar'], undefined, 'back to the built-in navigation');
});
