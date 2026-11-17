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

test('malformed inputs are refused; output is plain JSON literals', () => {
  assert.throws(() => buildConfig({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: 'https://evil.example', PERGAMON_SUPABASE_PUBLISHABLE_KEY: PUB }), /look like/);
  assert.throws(() => buildConfig({ VERCEL_ENV: 'preview', PERGAMON_SUPABASE_URL: STAGING }), /both/);
  assert.throws(() => buildConfig({ VERCEL_ENV: 'staging' }), /Unknown/);
  const js = renderConfig({ target: 'preview', url: STAGING, key: PUB });
  assert.match(js, /window\.PERGAMON_SUPABASE_URL = "https:\/\/abcdefghijklmnopqrst\.supabase\.co";/);
  assert.match(renderConfig({ target: 'preview', url: null, key: null }), /window\.PERGAMON_SUPABASE_URL = null;/);
});
