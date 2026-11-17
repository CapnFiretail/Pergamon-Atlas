// CMS database tests: proposed 0008/0009 against an emulated Supabase
// (see supabase-env.mjs). Run: npm test (from tests/cms).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, homeDoc } from './supabase-env.mjs';

let env, admin, admin2, user;
before(async () => {
  env = await createEnv();
  admin = await env.createUser('admin@example.test', { admin: true });
  admin2 = await env.createUser('admin2@example.test', { admin: true });
  user = await env.createUser('user@example.test');
});

const denied = r => r.error && r.error.code === '42501';          // no privilege at all
const forbidden = r => r.error && r.error.code === 'PT403';        // function refused
const conflict = r => r.error && r.error.code === 'PT409';
const invalid = r => r.error && r.error.code === 'PT422';
const ok = r => { assert.equal(r.error, null, r.error && `${r.error.code} ${r.error.message}`); return r.data; };

const state = async () => ok(await env.as(env.superuser, async tx =>
  (await tx.query(`select id, status, source_version_id from public.site_content_versions where page = 'home' order by id`)).rows));

// Gets a clean slate per scenario by reading current ids instead of assuming them.
async function current() {
  const d = ok(await env.rpc(admin, 'get_draft', 'home'));
  return { draftId: d.draft ? d.draft.id : null, publishedId: d.published ? d.published.id : null };
}

async function prepareMedia(who = admin) {
  const up = ok(await env.rpc(who, 'create_media_upload', 'image/webp', 1000));
  const sha = 'a'.repeat(63) + Math.floor(Math.random() * 10);
  ok(await env.rpc(env.service, 'cms_record_prepared_media', up.media_id, `media/${sha}.webp`, 'image/webp', 1000, 1600, 900, sha));
  return up.media_id;
}

// ── Authorization ────────────────────────────────────────────────────────

test('no direct table access for anon or users (and none for admins either)', async () => {
  for (const who of [env.anon, () => user, () => admin]) {
    const w = typeof who === 'function' ? who() : who;
    for (const t of ['site_content_versions', 'site_media', 'site_pages', 'site_content_routes']) {
      assert.ok(denied(await env.as(w, tx => tx.query(`select * from public.${t}`))), `${w.role} select ${t}`);
    }
    assert.ok(denied(await env.as(w, tx => tx.query(
      `insert into public.site_content_versions (page, schema_version, content, status, created_by) values ('home', 1, '{}', 'published', $1)`, [w.id || null]))),
      `${w.role} insert version`);
    assert.ok(denied(await env.as(w, tx => tx.query(`insert into public.site_content_routes (path, label) values ('/evil/', 'x')`))), `${w.role} add route`);
  }
});

test('guests cannot call admin functions at all; users are refused by the function', async () => {
  const calls = [
    ['get_draft', 'home'], ['save_draft', 'home', homeDoc(), null, null], ['discard_draft', 'home', 1],
    ['publish', 'home', 1, null], ['rollback', 'home', 1, null], ['list_versions', 'home', 10],
    ['create_media_upload', 'image/png', 100], ['get_media', []]
  ];
  for (const [fn, ...args] of calls) {
    assert.ok(denied(await env.rpc(env.anon, fn, ...args)), `anon ${fn}`);
    assert.ok(forbidden(await env.rpc(user, fn, ...args)), `user ${fn}`);
  }
});

test('nobody but the service role can record prepared media', async () => {
  const id = crypto.randomUUID();
  const sha = 'b'.repeat(64);
  for (const w of [env.anon, user, admin]) {
    assert.ok(denied(await env.rpc(w, 'cms_record_prepared_media', id, `media/${sha}.png`, 'image/png', 1, 1, 1, sha)), w.role);
  }
});

test('role spoofing: claims and profile edits cannot make a user an admin', async () => {
  const spoof = { role: 'authenticated', id: user.id, claims: {
    sub: user.id, role: 'authenticated', user_role: 'admin',
    app_metadata: { role: 'admin' }, user_metadata: { role: 'admin' } } };
  assert.equal(ok(await env.rpc(spoof, 'is_admin')), false);
  assert.ok(forbidden(await env.rpc(spoof, 'save_draft', 'home', homeDoc(), null, null)));
  // Self-promotion through the profile row. With Supabase's default grants
  // (production today) the UPDATE is accepted and 0001's trigger silently
  // reverts role; 0010 makes it a privilege error as well (tested below).
  await env.as(user, tx => tx.query(`update public.profiles set role = 'admin', display_name = 'Mallory' where id = $1`, [user.id]));
  const role = ok(await env.as(env.superuser, async tx => (await tx.query(`select role from public.profiles where id = $1`, [user.id])).rows[0].role));
  assert.equal(role, 'user');
  assert.equal(ok(await env.rpc(user, 'is_admin')), false);
  // A forged "admin" with no matching profile row is not an admin.
  const ghost = { role: 'authenticated', id: crypto.randomUUID() };
  assert.equal(ok(await env.rpc(ghost, 'is_admin')), false);
});

// ── Content ──────────────────────────────────────────────────────────────

test('drafts: save, read back, conflict detection, revision history', async () => {
  const s1 = ok(await env.rpc(admin, 'save_draft', 'home', homeDoc(), null, 'first'));
  const d1 = ok(await env.rpc(admin, 'get_draft', 'home'));
  assert.equal(d1.draft.id, s1.draft_id);
  assert.equal(d1.draft.content.components['home.featured'].title, 'Chess Forge');

  // Another admin saving against a stale expectation is refused, not merged.
  assert.ok(conflict(await env.rpc(admin2, 'save_draft', 'home', homeDoc(), null, null)), 'expected none but a draft exists');
  const s2 = ok(await env.rpc(admin2, 'save_draft', 'home', homeDoc(), s1.draft_id, 'second'));
  assert.ok(conflict(await env.rpc(admin, 'save_draft', 'home', homeDoc(), s1.draft_id, null)), 'admin 1 now stale');

  const rows = await state();
  assert.deepEqual(rows.filter(r => r.id >= s1.draft_id).map(r => r.status), ['superseded', 'draft']);
  assert.equal(s2.previous_draft_id, s1.draft_id);
  const hist = ok(await env.rpc(admin, 'list_versions', 'home', 10));
  assert.ok(hist.length >= 2 && hist[0].id === s2.draft_id && hist[0].created_by === admin2.id);
});

test('drafts are never visible through public reads', async () => {
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub, null, 'nothing published yet, draft not exposed');
});

test('validation rejects malformed or unsafe content', async () => {
  const { draftId } = await current();
  const bad = [
    ['unknown component', d => { d.components['home.footer'] = {}; }],
    ['unknown field', d => { d.components['home.featured'].onclick = 'x'; }],
    ['unknown top-level field', d => { d.extra = 1; }],
    ['schema 2', d => { d.schema = 2; }],
    ['empty title', d => { d.components['home.featured'].title = ''; }],
    ['long title', d => { d.components['home.featured'].title = 'x'.repeat(61); }],
    ['markup in title', d => { d.components['home.featured'].title = '<img src=x onerror=alert(1)>'; }],
    ['control char', d => { d.components['home.spotlight'].title = 'Connect\u0007Four'; }],
    ['newline', d => { d.components['home.spotlight'].title = 'Connect\nFour'; }],
    ['bidi override', d => { d.components['home.spotlight'].title = 'Four‮'; }],
    ['padded title', d => { d.components['home.spotlight'].title = ' Connect Four'; }],
    ['long button label', d => { d.components['home.featured'].cta = 'x'.repeat(25); }],
    ['javascript: link', d => { d.components['home.featured'].href = 'javascript:alert(1)'; }],
    ['external link', d => { d.components['home.featured'].href = 'https://evil.example/'; }],
    ['protocol-relative', d => { d.components['home.featured'].href = '//evil.example/'; }],
    ['unlisted route', d => { d.components['home.featured'].href = '/account/'; }],
    ['route without slash', d => { d.components['home.featured'].href = '/games/snake'; }],
    ['bad category', d => { d.components['home.carousel.pong'].category = 'Puzzle'; }],
    ['scale too big', d => { d.components['home.spotlight'].art.scale = 4; }],
    ['scale as CSS string', d => { d.components['home.spotlight'].art.scale = '1.3'; }],
    ['focus out of range', d => { d.components['home.featured'].art.focus = { x: 120, y: 5 }; }],
    ['anchor CSS injection', d => { d.components['home.spotlight'].art.anchor = { x: 'calc(50%) ; background:url(x)' }; }],
    ['colour injection', d => { d.components['home.spotlight'].art.base = 'red;background:url(//x)'; }],
    ['static path traversal', d => { d.components['home.featured'].art.source = { static: '/images/featured/../../x.webp' }; }],
    ['static outside folder', d => { d.components['home.featured'].art.source = { static: '/images/logo.png' }; }],
    ['svg static', d => { d.components['home.featured'].art.source = { static: '/images/featured/x.svg' }; }],
    ['remote image url', d => { d.components['home.featured'].art.source = { static: 'https://evil.example/x.webp' }; }],
    ['both sources', d => { d.components['home.featured'].art.source = { static: '/images/featured/a.webp', media: crypto.randomUUID() }; }],
    ['media not a uuid', d => { d.components['home.featured'].art.source = { media: '../../etc/passwd' }; }],
    ['card missing from order', d => { d.components['home.carousel.extra'] = { title: 'Extra', category: 'Arcade', href: '/games/pong/' }; }],
    ['order without card', d => { d.components['home.carousel'].order.push('ghost'); }],
    ['duplicate order id', d => { d.components['home.carousel'].order.push('pong'); }],
    ['bad card id', d => { d.components['home.carousel'].order[0] = 'Battle Ship'; }],
    ['missing spotlight', d => { delete d.components['home.spotlight']; }],
    ['too many cards', d => {
      for (let i = 0; i < 19; i++) { d.components['home.carousel'].order.push('c' + i); d.components['home.carousel.c' + i] = { title: 'C' + i, category: 'Arcade', href: '/games/pong/' }; }
    }]
  ];
  for (const [name, mutate] of bad) {
    const d = homeDoc(); mutate(d);
    assert.ok(invalid(await env.rpc(admin, 'save_draft', 'home', d, draftId, null)), name);
  }
  // NUL can't be stored in jsonb at all: refused before validation runs.
  const nul = homeDoc(); nul.components['home.spotlight'].title = 'Connect\u0000Four';
  assert.ok((await env.rpc(admin, 'save_draft', 'home', nul, draftId, null)).error, 'NUL');
  // Unknown page.
  assert.ok((await env.rpc(admin, 'save_draft', 'about', homeDoc(), null, null)).error, 'unknown page');
  // A valid doc with media and carousel art still passes.
  const good = homeDoc();
  good.components['home.carousel.pong'].art = { source: { static: '/images/featured/chess-forge.webp' }, scale: 1.1, focus: { x: 50, y: 40 } };
  ok(await env.rpc(admin, 'save_draft', 'home', good, draftId, 'valid variant'));
});

test('publish: atomic, previous version archived, draft consumed, public sees it', async () => {
  const { draftId, publishedId } = await current();
  const p = ok(await env.rpc(admin, 'publish', 'home', draftId, publishedId));
  assert.equal(p.previous_version, publishedId);
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.equal(pub.version, p.version);
  assert.deepEqual(Object.keys(pub).sort(), ['content', 'media', 'page', 'published_at', 'schema', 'version']);
  const text = JSON.stringify(pub);
  assert.ok(!text.includes(admin.id) && !text.includes(admin2.id), 'no admin ids in public payload');
  const after = await current();
  assert.equal(after.draftId, null, 'draft consumed');
  assert.equal(after.publishedId, p.version);
});

test('concurrent publishes: only one wins', async () => {
  const { publishedId } = await current();
  const s = ok(await env.rpc(admin, 'save_draft', 'home', homeDoc(), null, null));
  const [a, b] = await Promise.all([
    env.rpc(admin, 'publish', 'home', s.draft_id, publishedId),
    env.rpc(admin2, 'publish', 'home', s.draft_id, publishedId)
  ]);
  assert.equal([a, b].filter(r => !r.error).length, 1);
  assert.ok([a, b].some(conflict));
  const rows = await state();
  assert.equal(rows.filter(r => r.status === 'published').length, 1);
});

test('failed publication leaves the live version and the draft untouched', async () => {
  const before = await current();
  const pubBefore = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  const d = homeDoc();
  const unprepared = ok(await env.rpc(admin, 'create_media_upload', 'image/png', 2000)).media_id;
  d.components['home.featured'].art.source = { media: unprepared };
  d.components['home.featured'].title = 'Should Not Go Live';
  const s = ok(await env.rpc(admin, 'save_draft', 'home', d, before.draftId, null));
  assert.ok(conflict(await env.rpc(admin, 'publish', 'home', s.draft_id, before.publishedId)), 'unprepared image blocks publish');
  assert.ok(conflict(await env.rpc(admin, 'publish', 'home', s.draft_id, 999999)), 'stale live version blocks publish');
  assert.ok(conflict(await env.rpc(admin, 'publish', 'home', s.draft_id - 1, before.publishedId)), 'old draft id blocks publish');
  const pubAfter = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.deepEqual(pubAfter, pubBefore);
  assert.equal((await current()).draftId, s.draft_id, 'draft still current');
  ok(await env.rpc(admin, 'discard_draft', 'home', s.draft_id));
  assert.equal((await current()).draftId, null);
});

test('publish with a prepared image exposes only its public path', async () => {
  const media = await prepareMedia();
  const d = homeDoc();
  d.components['home.spotlight'].art.source = { media };
  const { publishedId } = await current();
  const s = ok(await env.rpc(admin, 'save_draft', 'home', d, null, null));
  ok(await env.rpc(admin, 'publish', 'home', s.draft_id, publishedId));
  const pub = ok(await env.rpc(env.anon, 'get_published_content', 'home'));
  assert.ok(/^media\/[0-9a-f]{64}\.webp$/.test(pub.media[media].path));
  assert.ok(!JSON.stringify(pub).includes('uploads/'), 'no draft paths in public payload');
  const m = ok(await env.rpc(admin, 'get_media', [media]));
  assert.ok(m[media].published_at, 'published_at stamped on first use');
});

test('rollback publishes a copy as a new version and keeps history', async () => {
  const hist = ok(await env.rpc(admin, 'list_versions', 'home', 50));
  const archived = hist.find(v => v.status === 'archived');
  const { publishedId } = await current();
  const before = (await state()).length;
  const r = ok(await env.rpc(admin, 'rollback', 'home', archived.id, publishedId));
  assert.ok(r.version > publishedId);
  const rows = await state();
  assert.equal(rows.length, before + 1, 'appended, nothing overwritten');
  assert.equal(rows.find(x => x.id === r.version).source_version_id, archived.id);
  assert.equal(rows.find(x => x.id === publishedId).status, 'archived');
  // Not rollback targets: drafts/superseded rows, the live version, other pages.
  const superseded = rows.find(x => x.status === 'superseded');
  assert.equal((await env.rpc(admin, 'rollback', 'home', superseded.id, r.version)).error.code, 'PT404');
  assert.equal((await env.rpc(admin, 'rollback', 'home', r.version, r.version)).error.code, 'PT404');
  assert.ok(conflict(await env.rpc(admin, 'rollback', 'home', archived.id, publishedId)), 'stale expected live version');
});

test('published history is immutable, even for the service role', async () => {
  const { publishedId } = await current();
  const svc = q => env.as(env.service, tx => tx.query(q, [publishedId]));
  assert.equal((await svc(`update public.site_content_versions set content = '{}' where id = $1`)).error.code, 'PT403');
  assert.equal((await svc(`update public.site_content_versions set status = 'archived' where id = $1`)).error.code, 'PT403');
  assert.equal((await svc(`delete from public.site_content_versions where id = $1`)).error.code, 'PT403');
});

// ── Media ────────────────────────────────────────────────────────────────

test('upload reservations: types and sizes', async () => {
  assert.ok(invalid(await env.rpc(admin, 'create_media_upload', 'image/svg+xml', 100)), 'svg');
  assert.ok(invalid(await env.rpc(admin, 'create_media_upload', 'application/x-msdownload', 100)), 'exe');
  assert.ok(invalid(await env.rpc(admin, 'create_media_upload', 'image/gif', 100)), 'gif');
  assert.ok(invalid(await env.rpc(admin, 'create_media_upload', 'image/png', 5 * 1024 * 1024 + 1)), 'oversized');
  assert.ok(invalid(await env.rpc(admin, 'create_media_upload', 'image/png', 0)), 'empty');
  const r = ok(await env.rpc(admin, 'create_media_upload', 'image/jpeg', 5 * 1024 * 1024));
  assert.match(r.path, /^uploads\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(r.bucket, 'site-media-drafts');
});

test('draft bucket: only the issued path, once, by its admin; never overwritten or deleted', async () => {
  const r = ok(await env.rpc(admin, 'create_media_upload', 'image/png', 500));
  const put = (who, name, bucket = 'site-media-drafts') => env.as(who, tx =>
    tx.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [bucket, name, who.id || null]));
  const rls = res => res.error && res.error.code === '42501';
  assert.ok(rls(await put(env.anon, r.path)), 'anon');
  assert.ok(rls(await put(user, r.path)), 'user');
  assert.ok(rls(await put(admin2, r.path)), 'another admin cannot use my reservation');
  assert.ok(rls(await put(admin, 'uploads/../../site-media/evil.png')), 'path traversal');
  assert.ok(rls(await put(admin, `uploads/${crypto.randomUUID()}.png`)), 'unissued path');
  ok(await put(admin, r.path));
  assert.ok((await put(admin, r.path)).error, 'second upload to the same path');
  // No update/delete policies: these affect zero rows.
  const upd = ok(await env.as(admin, tx => tx.query(`update storage.objects set metadata = '{}' where name = $1`, [r.path])));
  const del = ok(await env.as(admin, tx => tx.query(`delete from storage.objects where name = $1`, [r.path])));
  assert.equal(upd.affectedRows, 0);
  assert.equal(del.affectedRows, 0);
  // Drafts readable by admins only.
  const sel = who => env.as(who, async tx => (await tx.query(`select name from storage.objects where bucket_id = 'site-media-drafts'`)).rows.length);
  assert.ok(ok(await sel(admin)) >= 1);
  assert.equal(ok(await sel(user)), 0);
  assert.equal(ok(await sel(env.anon)), 0);
});

test('public bucket: no browser writes, no listing', async () => {
  for (const w of [env.anon, user, admin]) {
    const res = await env.as(w, tx => tx.query(`insert into storage.objects (bucket_id, name) values ('site-media', $1)`, ['media/' + 'c'.repeat(64) + '.png']));
    assert.ok(res.error && res.error.code === '42501', w.role);
  }
  ok(await env.as(env.service, tx => tx.query(`insert into storage.objects (bucket_id, name) values ('site-media', $1)`, ['media/' + 'd'.repeat(64) + '.png'])));
  for (const w of [env.anon, user, admin]) {
    const n = ok(await env.as(w, async tx => (await tx.query(`select 1 from storage.objects where bucket_id = 'site-media'`)).rows.length));
    assert.equal(n, 0, `${w.role} cannot list`);
  }
});

test('prepared media is recorded once and becomes immutable', async () => {
  const id = ok(await env.rpc(admin, 'create_media_upload', 'image/png', 300)).media_id;
  const sha = 'e'.repeat(64);
  assert.ok(invalid(await env.rpc(env.service, 'cms_record_prepared_media', id, 'media/' + 'f'.repeat(64) + '.png', 'image/png', 300, 10, 10, sha)), 'path must match hash');
  assert.ok(invalid(await env.rpc(env.service, 'cms_record_prepared_media', id, `media/${sha}.webp`, 'image/png', 300, 10, 10, sha)), 'path must match type');
  ok(await env.rpc(env.service, 'cms_record_prepared_media', id, `media/${sha}.png`, 'image/png', 300, 10, 10, sha));
  assert.equal(ok(await env.rpc(env.service, 'cms_record_prepared_media', id, `media/${sha}.png`, 'image/png', 300, 10, 10, sha)).already_prepared, true);
  const other = '0'.repeat(64);
  assert.ok(conflict(await env.rpc(env.service, 'cms_record_prepared_media', id, `media/${other}.png`, 'image/png', 300, 10, 10, other)));
  assert.equal((await env.as(env.service, tx => tx.query(`update public.site_media set width = 11 where id = $1`, [id]))).error.code, 'PT403');
  assert.equal((await env.as(env.service, tx => tx.query(`update public.site_media set draft_path = 'uploads/x.png' where id = $1`, [id]))).error.code, 'PT403');
});
