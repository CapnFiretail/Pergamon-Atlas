// tools/write-supabase-config.mjs: environment separation rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConfig, renderConfig, PRODUCTION_REF } from '../../tools/write-supabase-config.mjs';

const PROD = `https://${PRODUCTION_REF}.supabase.co`;
const STAGING = 'https://abcdefghijklmnopqrst.supabase.co';
const PUB = 'sb_publishable_abcDEF123_xyz-789';
const jwt = role => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.');

test('production uses production values only', () => {
  assert.deepEqual(buildConfig({ VERCEL_ENV: 'production', PERGAMON_SUPABASE_URL: PROD, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }),
    { target: 'production', url: PROD, key: PUB });
  assert.throws(() => buildConfig({ VERCEL_ENV: 'production' }), /required/);
  assert.throws(() => buildConfig({ VERCEL_ENV: 'production', PERGAMON_SUPABASE_URL: STAGING, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }), /not the production project/);
});

test('previews and local development can never point at production', () => {
  for (const t of ['preview', 'development']) {
    assert.throws(() => buildConfig({ VERCEL_ENV: t, PERGAMON_SUPABASE_URL: PROD, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }), /must not use the production/);
    assert.equal(buildConfig({ VERCEL_ENV: t, PERGAMON_SUPABASE_URL: STAGING, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }).url, STAGING);
    assert.deepEqual(buildConfig({ VERCEL_ENV: t }), { target: t, url: null, key: null }, 'unset -> unconfigured, not production');
  }
  assert.equal(buildConfig({}).target, 'development');
});

test('secret and service-role keys are refused', () => {
  for (const key of ['sb_secret_abcdef1234567890', jwt('service_role'), jwt('authenticated'), 'not-a-key']) {
    assert.throws(() => buildConfig({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: STAGING, PERGAMON_SUPABASE_PUBLISHABLE_KEY: key }), /publishable/, key.slice(0, 12));
  }
  assert.equal(buildConfig({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: STAGING, PERGAMON_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).target, 'preview');
});

test('real projects: staging accepted for previews, refused for production; secrets refused everywhere', () => {
  const STAGING_REAL = 'https://rambkiswuigtjfgdxexk.supabase.co';
  for (const t of ['preview', 'development']) {
    assert.equal(buildConfig({ VERCEL_ENV: t, PERGAMON_SUPABASE_URL: STAGING_REAL, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }).url, STAGING_REAL);
  }
  assert.throws(() => buildConfig({ VERCEL_ENV: 'production', PERGAMON_SUPABASE_URL: STAGING_REAL, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }), /not the production project/);
  for (const t of ['production', 'preview', 'development']) {
    const url = t === 'production' ? PROD : STAGING_REAL;
    for (const key of ['sb_secret_abcdef1234567890', jwt('service_role')]) {
      assert.throws(() => buildConfig({ VERCEL_ENV: t, PERGAMON_SUPABASE_URL: url, PERGAMON_SUPABASE_PUBLISHABLE_KEY: key }), /publishable/, `${t} ${key.slice(0, 10)}`);
    }
  }
});

test('as a build step: refusals exit non-zero (fails the Vercel build) and write nothing', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, existsSync, readFileSync } = await import('node:fs');
  const os = await import('node:os');
  const p = await import('node:path');
  const dir = mkdtempSync(p.join(os.tmpdir(), 'pa-config-'));
  const script = new URL('../../tools/write-supabase-config.mjs', import.meta.url);
  const run = (env, name) => {
    const out = p.join(dir, name);
    const r = spawnSync(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--out', out], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    return { code: r.status, wrote: existsSync(out), out, stderr: r.stderr };
  };
  const bad = [
    ['preview with production', { VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: PROD, PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }],
    ['production with a secret key', { VERCEL_ENV: 'production', PERGAMON_SUPABASE_URL: PROD, PERGAMON_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdef1234567890' }],
    ['production with nothing set', { VERCEL_ENV: 'production' }]
  ];
  for (const [name, env] of bad) {
    const r = run(env, name.replace(/\W+/g, '-') + '.js');
    assert.equal(r.code, 1, name);
    assert.equal(r.wrote, false, `${name}: nothing written`);
    assert.ok(!/sb_secret_/.test(r.stderr), `${name}: secret not echoed`);
  }
  const ok = run({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: 'https://rambkiswuigtjfgdxexk.supabase.co', PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }, 'ok.js');
  assert.equal(ok.code, 0);
  assert.match(readFileSync(ok.out, 'utf8'), /PERGAMON_ENV = "preview";[\s\S]*rambkiswuigtjfgdxexk/);
});

test('malformed inputs are refused; output is plain JSON literals', () => {
  assert.throws(() => buildConfig({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: 'https://evil.example', PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }), /look like/);
  assert.throws(() => buildConfig({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: STAGING }), /both/);
  assert.throws(() => buildConfig({ VERCEL_ENV: 'staging' }), /Unknown/);
  const js = renderConfig({ target: 'preview', url: STAGING, key: PUB });
  assert.match(js, /window\.PERGAMON_SUPABASE_URL = "https:\/\/abcdefghijklmnopqrst\.supabase\.co";/);
  assert.match(renderConfig({ target: 'preview', url: null, key: null }), /window\.PERGAMON_SUPABASE_URL = null;/);
});
