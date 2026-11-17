// Read-only check that a private draft image can't be downloaded without
// authorisation. STAGING ONLY. Uses the same credentials file, host guard and
// redaction as staging-integration.mjs. Creates no rows or objects; the only
// side effects are two sign-ins (signed out at the end) and one 60-second
// signed URL (stateless; nothing is stored).
//
//   node tests/cms/staging-draft-access.mjs [<draft path>]
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STAGING_REF = 'rambkiswuigtjfgdxexk';
const PRODUCTION_REF = 'rddijjezqrcjrnwskenb';
const BASE = `https://${STAGING_REF}.supabase.co`;
const HOST = new URL(BASE).host;
const DRAFT = process.argv[2] || 'uploads/97b21c02-ef99-47e2-8f73-10efe5da6b57.png';
if (!/^uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/.test(DRAFT)) { console.error('Not a draft path'); process.exit(2); }

const cred = {};
for (const line of readFileSync(path.join(os.homedir(), '.pergamon-staging-test.env'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i > 0) cred[line.slice(0, i)] = line.slice(i + 1);
}
if (cred.PERGAMON_STAGING_PROJECT_REF !== STAGING_REF) { console.error('Refusing to run: not the staging project.'); process.exit(2); }
let PUB = process.env.PERGAMON_STAGING_PUBLISHABLE_KEY || '';
if (!PUB) {
  const raw = execSync(`npx.cmd --yes supabase@2.122.1 projects api-keys --project-ref ${STAGING_REF} -o json`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  PUB = (JSON.parse(raw).find(k => k.type === 'publishable') || {}).api_key || '';
}
if (!/^sb_publishable_/.test(PUB)) { console.error('Refusing to run: no staging publishable key.'); process.exit(2); }

const secrets = new Set([cred.PERGAMON_STAGING_ADMIN_PASSWORD, cred.PERGAMON_STAGING_USER_PASSWORD, cred.PERGAMON_STAGING_ADMIN_EMAIL, cred.PERGAMON_STAGING_USER_EMAIL, PUB].filter(Boolean));
const redact = s => { let t = String(s); for (const x of secrets) t = t.split(x).join('«redacted»'); return t.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '«jwt»').replace(/token=[^&\s"]+/g, 'token=«redacted»'); };

async function req(method, p, { token, json, apikey = true } = {}) {
  const url = BASE + p;
  if (new URL(url).host !== HOST || url.includes(PRODUCTION_REF)) throw new Error('Blocked a request that was not for the staging project');
  const h = {};
  if (apikey) h.apikey = PUB;
  if (token) h.Authorization = `Bearer ${token}`;
  let body; if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const r = await fetch(url, { method, headers: h, body, redirect: 'manual' });
  const buf = new Uint8Array(await r.arrayBuffer());
  let data = null; try { data = JSON.parse(new TextDecoder().decode(buf)); } catch {}
  return { status: r.status, buf, data, type: r.headers.get('content-type') || '' };
}
const inner = r => (r.data && (r.data.statusCode || r.data.error)) ? ` (${r.data.statusCode || ''} ${r.data.error || ''})`.replace(/\s+\)/, ')') : '';

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${redact(detail)}`); };

async function signIn(email, password) {
  const r = await req('POST', '/auth/v1/token?grant_type=password', { json: { email, password } });
  if (r.status !== 200) throw new Error(`sign-in failed (HTTP ${r.status})`);
  return r.data.access_token;
}
const adminT = await signIn(cred.PERGAMON_STAGING_ADMIN_EMAIL, cred.PERGAMON_STAGING_ADMIN_PASSWORD);
const userT = await signIn(cred.PERGAMON_STAGING_USER_EMAIL, cred.PERGAMON_STAGING_USER_PASSWORD);
secrets.add(adminT); secrets.add(userT);
for (const k of Object.keys(cred)) delete cred[k];

const fixtureSha = createHash('sha256').update(readFileSync(new URL('./fixtures/img-37x21.png', import.meta.url))).digest('hex');
const isImage = r => r.status === 200 && r.type.startsWith('image/') && r.buf.length > 0;
const denied = r => r.status >= 400 && !r.type.startsWith('image/');
const B = 'site-media-drafts';

try {
  console.log(`Draft object: ${B}/${DRAFT} on staging ${STAGING_REF}\n`);

  // 1. Guest, public-style URLs.
  const g1 = await req('GET', `/storage/v1/object/public/${B}/${DRAFT}`);
  check('1a guest GET public URL of the private bucket', denied(g1), `${g1.status}${inner(g1)}`);
  const g1h = await req('HEAD', `/storage/v1/object/public/${B}/${DRAFT}`);
  check('1b guest HEAD public URL', g1h.status >= 400, `${g1h.status}`);
  const g1n = await req('GET', `/storage/v1/object/public/${B}/${DRAFT}`, { apikey: false });
  check('1c guest GET public URL without any API key', denied(g1n), `${g1n.status}${inner(g1n)}`);
  const g1w = await req('GET', `/storage/v1/object/public/site-media/${DRAFT}`);
  check('1d guest GET the same path in the public bucket (draft not copied there)', denied(g1w), `${g1w.status}${inner(g1w)}`);

  // 2. Guest and regular user, exact storage path through the authenticated API.
  const g2 = await req('GET', `/storage/v1/object/authenticated/${B}/${DRAFT}`);
  check('2a guest GET authenticated endpoint', denied(g2), `${g2.status}${inner(g2)}`);
  const g2b = await req('GET', `/storage/v1/object/${B}/${DRAFT}`);
  check('2b guest GET object endpoint', denied(g2b), `${g2b.status}${inner(g2b)}`);
  const u2 = await req('GET', `/storage/v1/object/authenticated/${B}/${DRAFT}`, { token: userT });
  check('2c user GET authenticated endpoint (exact path)', denied(u2), `${u2.status}${inner(u2)}`);
  const u2b = await req('GET', `/storage/v1/object/${B}/${DRAFT}`, { token: userT });
  check('2d user GET object endpoint (exact path)', denied(u2b), `${u2b.status}${inner(u2b)}`);
  const u2i = await req('GET', `/storage/v1/object/info/${B}/${DRAFT}`, { token: userT });
  check('2e user GET object info (metadata)', u2i.status >= 400, `${u2i.status}${inner(u2i)}`);

  // 3. Administrator, authorised API.
  const a3 = await req('GET', `/storage/v1/object/authenticated/${B}/${DRAFT}`, { token: adminT });
  const a3sha = createHash('sha256').update(a3.buf).digest('hex');
  check('3  admin GET authenticated endpoint returns the original bytes', isImage(a3) && a3sha === fixtureSha, `${a3.status} ${a3.type} ${a3.buf.length} bytes, sha256 matches fixture: ${a3sha === fixtureSha}`);

  // 4. Signed URLs.
  const sg = await req('POST', `/storage/v1/object/sign/${B}/${DRAFT}`, { json: { expiresIn: 60 } });
  check('4a guest cannot create a signed URL', sg.status >= 400 && !sg.data?.signedURL, `${sg.status}${inner(sg)}`);
  const su = await req('POST', `/storage/v1/object/sign/${B}/${DRAFT}`, { token: userT, json: { expiresIn: 60 } });
  check('4b user cannot create a signed URL', su.status >= 400 && !su.data?.signedURL, `${su.status}${inner(su)}`);
  const fake = await req('GET', `/storage/v1/object/sign/${B}/${DRAFT}?token=eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzaXRlLW1lZGlhLWRyYWZ0cy91cGxvYWRzL3gucG5nIn0.Zm9yZ2Vk`);
  check('4c forged signed-URL token refused', denied(fake), `${fake.status}${inner(fake)}`);
  const none = await req('GET', `/storage/v1/object/sign/${B}/${DRAFT}`);
  check('4d signed-URL path without a token refused', denied(none), `${none.status}${inner(none)}`);
  const sa = await req('POST', `/storage/v1/object/sign/${B}/${DRAFT}`, { token: adminT, json: { expiresIn: 60 } });
  const signed = sa.data?.signedURL || '';
  check('4e admin can create a 60-second signed URL', sa.status === 200 && /^\/object\/sign\//.test(signed), `${sa.status}`);
  if (signed) {
    secrets.add(signed.split('token=')[1] || '');
    const tok = new URL('https://x' + signed).searchParams.get('token');
    const swapped = await req('GET', `/storage/v1/object/sign/${B}/uploads/87b9b4df-b684-4a31-85ca-cacbd634cf1e.png?token=${tok}`);
    check("4f admin's token can't be reused for a different object", denied(swapped), `${swapped.status}${inner(swapped)}`);
    const parts = tok.split('.'); const bad = [parts[0], parts[1], parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA')].join('.');
    const tampered = await req('GET', `/storage/v1/object/sign/${B}/${DRAFT}?token=${bad}`);
    check('4g tampered signature refused', denied(tampered), `${tampered.status}${inner(tampered)}`);
    const valid = await req('GET', '/storage/v1' + signed);
    check('4h the genuine signed URL works for whoever holds it (by design; short-lived)', isImage(valid), `${valid.status} ${valid.type}`);
  }
} finally {
  for (const t of [adminT, userT]) await req('POST', '/auth/v1/logout?scope=local', { token: t });
  console.log('\nBoth sessions signed out.');
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
