// Optional 0010_legacy_hardening.sql: applied on top of production's
// 0001–0006 plus the CMS migrations.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv } from './supabase-env.mjs';

let env, user, admin;
before(async () => {
  env = await createEnv({ extra: ['0010_legacy_hardening'] });
  user = await env.createUser('user@example.test');
  admin = await env.createUser('admin@example.test', { admin: true });
});

test('profiles: role is a privilege error again; display_name still editable; own row only', async () => {
  const r = await env.as(user, tx => tx.query(`update public.profiles set role = 'admin' where id = $1`, [user.id]));
  assert.equal(r.error && r.error.code, '42501');
  const ok = await env.as(user, tx => tx.query(`update public.profiles set display_name = 'Ada' where id = $1`, [user.id]));
  assert.equal(ok.error, null);
  const rows = await env.as(user, async tx => (await tx.query(`select id, display_name, role from public.profiles`)).rows);
  assert.deepEqual(rows.data.map(x => [x.id, x.display_name, x.role]), [[user.id, 'Ada', 'user']]);
  // anon keeps SELECT (older policies need it) but RLS returns nothing; no writes at all.
  const anon = await env.as(env.anon, async tx => (await tx.query(`select * from public.profiles`)).rows.length);
  assert.equal(anon.data, 0);
  const anonWrite = await env.as(env.anon, tx => tx.query(`update public.profiles set display_name = 'x'`));
  assert.equal(anonWrite.error && anonWrite.error.code, '42501');
  const del = await env.as(user, tx => tx.query(`delete from public.profiles where id = $1`, [user.id]));
  assert.equal(del.error && del.error.code, '42501');
});

test('homepage_settings: anon no longer receives updated_by; other columns readable', async () => {
  const star = await env.as(env.anon, tx => tx.query(`select * from public.homepage_settings`));
  assert.equal(star.error && star.error.code, '42501');
  const cols = await env.as(env.superuser, tx => tx.query(`update public.homepage_settings set published = true`));
  assert.equal(cols.error, null);
  const r = await env.as(env.anon, async tx => (await tx.query(`select id, published, hero_image_path from public.homepage_settings`)).rows);
  assert.equal(r.data.length, 1);
  const leak = await env.as(env.anon, tx => tx.query(`select updated_by from public.homepage_settings`));
  assert.equal(leak.error && leak.error.code, '42501');
});

test('legacy homepage bucket: listing is admin-only', async () => {
  await env.as(env.service, tx => tx.query(`insert into storage.objects (bucket_id, name) values ('homepage', 'hero/1.png')`));
  const count = who => env.as(who, async tx => (await tx.query(`select 1 from storage.objects where bucket_id = 'homepage'`)).rows.length);
  assert.equal((await count(env.anon)).data, 0);
  assert.equal((await count(user)).data, 0);
  assert.equal((await count(admin)).data, 1);
});
