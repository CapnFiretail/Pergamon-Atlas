// Staging integration tests for the CMS (real Supabase: PostgREST, Storage,
// Auth, the deployed publish-media function). STAGING ONLY.
//
//   node tests/cms/staging-integration.mjs            # sections A, B, C, D
//   node tests/cms/staging-integration.mjs --skip-b   # without the content round trip
//
// Credentials: %USERPROFILE%\.pergamon-staging-test.env (outside the repo):
//   PERGAMON_STAGING_PROJECT_REF=rambkiswuigtjfgdxexk
//   PERGAMON_STAGING_ADMIN_EMAIL=… / PERGAMON_STAGING_ADMIN_PASSWORD=…
//   PERGAMON_STAGING_USER_EMAIL=…  / PERGAMON_STAGING_USER_PASSWORD=…
// The staging publishable key (public) comes from the Supabase CLI, or from
// PERGAMON_STAGING_PUBLISHABLE_KEY. No secret or service-role key is used.
//
// Safety: refuses to run unless the ref is the staging ref; every request
// goes through guardedFetch(), which aborts on any other host or any mention
// of the production ref. Output is redacted: passwords, emails, tokens and
// keys are masked; nothing secret is written to disk.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const STAGING_REF = 'rambkiswuigtjfgdxexk';
const PRODUCTION_REF = 'rddijjezqrcjrnwskenb';
const BASE = `https://${STAGING_REF}.supabase.co`;
const HOST = new URL(BASE).host;
const SKIP_B = process.argv.includes('--skip-b');

// ── Credentials ──────────────────────────────────────────────────────────
const credFile = path.join(os.homedir(), '.pergamon-staging-test.env');
const cred = {};
for (const line of readFileSync(credFile, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i > 0) cred[line.slice(0, i)] = line.slice(i + 1);
}
if (cred.PERGAMON_STAGING_PROJECT_REF !== STAGING_REF) {
  console.error('Refusing to run: PERGAMON_STAGING_PROJECT_REF is not the staging project.');
  process.exit(2);
}
for (const k of ['PERGAMON_STAGING_ADMIN_EMAIL', 'PERGAMON_STAGING_ADMIN_PASSWORD', 'PERGAMON_STAGING_USER_EMAIL', 'PERGAMON_STAGING_USER_PASSWORD']) {
  if (!cred[k]) { console.error(`Refusing to run: ${k} is missing.`); process.exit(2); }
}

let PUB = process.env.PERGAMON_STAGING_PUBLISHABLE_KEY || '';
if (!PUB) {
  const raw = execSync(`npx.cmd --yes supabase@2.122.1 projects api-keys --project-ref ${STAGING_REF} -o json`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  PUB = (JSON.parse(raw).find(k => k.type === 'publishable') || {}).api_key || '';
}
if (!/^sb_publishable_/.test(PUB)) { console.error('Refusing to run: no staging publishable key.'); process.exit(2); }

// ── Redaction and the request guard ──────────────────────────────────────
const secrets = new Set([cred.PERGAMON_STAGING_ADMIN_PASSWORD, cred.PERGAMON_STAGING_USER_PASSWORD,
  cred.PERGAMON_STAGING_ADMIN_EMAIL, cred.PERGAMON_STAGING_USER_EMAIL, PUB].filter(Boolean));
const redact = s => { let t = String(s); for (const x of secrets) t = t.split(x).join('«redacted»'); return t.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '«jwt»'); };

async function guardedFetch(url, opts = {}) {
  const u = new URL(url);
  const body = typeof opts.body === 'string' ? opts.body : '';
  if (u.host !== HOST || url.includes(PRODUCTION_REF) || body.includes(PRODUCTION_REF)) {
    throw new Error('Blocked a request that was not for the staging project');
  }
  return fetch(url, { ...opts, redirect: 'manual' });
}

async function call(method, p, { token, json, raw, headers = {} } = {}) {
  const h = { apikey: PUB, ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (raw !== undefined) body = raw;
  const r = await guardedFetch(BASE + p, { method, headers: h, body });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
const rpc = (fn, args, token) => call('POST', `/rest/v1/rpc/${fn}`, { token, json: args });
const code = r => (r.data && typeof r.data === 'object' && (r.data.code || r.data.error || r.data.statusCode)) || '';

// ── Reporting ────────────────────────────────────────────────────────────
const results = [];
function check(cat, name, ok, detail) {
  results.push({ cat, name, ok: !!ok, detail: redact(detail ?? '') });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${cat}] ${name}${detail !== undefined ? ' — ' + redact(detail) : ''}`);
}
const created = { content_versions: [], site_media: [], draft_objects: [], public_objects: [] };

// ── Sessions ─────────────────────────────────────────────────────────────
async function signIn(email, password) {
  const r = await call('POST', '/auth/v1/token?grant_type=password', { json: { email, password } });
  if (r.status !== 200) throw new Error(`sign-in failed (HTTP ${r.status})`);
  return { token: r.data.access_token, id: r.data.user.id };
}
const admin = await signIn(cred.PERGAMON_STAGING_ADMIN_EMAIL, cred.PERGAMON_STAGING_ADMIN_PASSWORD);
const user = await signIn(cred.PERGAMON_STAGING_USER_EMAIL, cred.PERGAMON_STAGING_USER_PASSWORD);
secrets.add(admin.token); secrets.add(user.token);
for (const k of Object.keys(cred)) if (k !== 'PERGAMON_STAGING_PROJECT_REF') delete cred[k];
console.log(`Signed in to staging ${STAGING_REF} as the staging admin and the staging user.\n`);

const homeDoc = () => ({
  schema: 1,
  components: {
    'home.featured': { title: 'Chess Forge', cta: 'Play Now', href: '/games/chess-forge/',
      art: { source: { static: '/images/featured/chess-forge.webp' }, alt: '', focus: { x: 78, y: 5 }, focusNarrow: { x: 88, y: 12 } }, style: { rules: true } },
    'home.spotlight': { title: 'Connect Four', cta: 'Play Now', href: '/games/connect-four/',
      art: { source: { static: '/images/featured/connect-four.webp' }, alt: '', fit: 'height', scale: 1.3, scaleNarrow: 1,
             anchor: { x: 50, offset: -60, y: 50 }, anchorNarrow: { x: 100, offset: -139, y: 50 }, base: '#030916' }, style: { rules: true } },
    'home.carousel': { order: ['battleship', 'breakout', 'pong', 'blackjack', 'connect-four', 'snake'] },
    'home.carousel.battleship': { title: 'Battleship', category: 'Strategy', href: '/games/battleship/' },
    'home.carousel.breakout': { title: 'Breakout', category: 'Arcade', href: '/games/breakout/' },
    'home.carousel.pong': { title: 'Pong', category: 'Arcade', href: '/games/pong/' },
    'home.carousel.blackjack': { title: 'Blackjack', category: 'Card', href: '/games/blackjack/' },
    'home.carousel.connect-four': { title: 'Connect Four', category: 'Strategy', href: '/games/connect-four/' },
    'home.carousel.snake': { title: 'Snake', category: 'Arcade', href: '/games/snake/' }
  }
});

try {
  // ── A. Database API ────────────────────────────────────────────────────
  const A = 'A database';
  for (const t of ['site_content_versions', 'site_media', 'site_pages', 'site_content_routes']) {
    const g = await call('GET', `/rest/v1/${t}?select=*&limit=1`);
    const u = await call('GET', `/rest/v1/${t}?select=*&limit=1`, { token: user.token });
    const a = await call('GET', `/rest/v1/${t}?select=*&limit=1`, { token: admin.token });
    check(A, `direct read of ${t} refused for guest/user/admin`, g.status === 401 && u.status === 403 && a.status === 403, `${g.status}/${u.status}/${a.status} ${code(g)}`);
  }
  const pub0 = await rpc('get_published_content', { p_page: 'home' });
  check(A, 'guest get_published_content(home) before publishing', pub0.status === 200 && pub0.data === null, `${pub0.status} ${JSON.stringify(pub0.data)}`);
  const adminFns = [
    ['get_draft', { p_page: 'home' }], ['save_draft', { p_page: 'home', p_content: homeDoc(), p_expected_draft_id: null, p_note: null }],
    ['discard_draft', { p_page: 'home', p_expected_draft_id: 1 }], ['publish', { p_page: 'home', p_draft_id: 1, p_expected_published_id: null }],
    ['rollback', { p_page: 'home', p_version_id: 1, p_expected_published_id: null }], ['list_versions', { p_page: 'home', p_limit: 5 }],
    ['create_media_upload', { p_mime: 'image/png', p_bytes: 100 }], ['get_media', { p_ids: [] }]
  ];
  for (const [fn, args] of adminFns) {
    const g = await rpc(fn, args);
    const u = await rpc(fn, args, user.token);
    check(A, `${fn}: guest refused before running, user refused by admin check`, g.status === 401 && code(g) === '42501' && u.status === 403 && code(u) === 'PT403', `guest ${g.status} ${code(g)}, user ${u.status} ${code(u)}`);
  }
  const recArgs = { p_id: '00000000-0000-4000-8000-000000000000', p_public_path: 'media/' + 'a'.repeat(64) + '.png', p_mime: 'image/png', p_bytes: 1, p_width: 1, p_height: 1, p_sha256: 'a'.repeat(64) };
  const rg = await rpc('cms_record_prepared_media', recArgs), ru = await rpc('cms_record_prepared_media', recArgs, user.token), ra = await rpc('cms_record_prepared_media', recArgs, admin.token);
  check(A, 'cms_record_prepared_media refused for guest, user and admin (service role only)', [rg, ru, ra].every(r => code(r) === '42501') && rg.status === 401 && ru.status === 403 && ra.status === 403, `${rg.status}/${ru.status}/${ra.status}`);
  const ia = await rpc('is_admin', {}, admin.token), iu = await rpc('is_admin', {}, user.token), ig = await rpc('is_admin', {});
  check(A, 'is_admin(): admin true, user false, guest false', ia.data === true && iu.data === false && ig.data === false, `${ia.data}/${iu.data}/${ig.data}`);
  const promote = await call('PATCH', `/rest/v1/profiles?id=eq.${user.id}`, { token: user.token, json: { role: 'admin' }, headers: { Prefer: 'return=minimal' } });
  const role = await call('GET', `/rest/v1/profiles?select=role&id=eq.${user.id}`, { token: user.token });
  check(A, 'user self-promotion refused (0010 privilege) and role still "user"', promote.status === 403 && code(promote) === '42501' && Array.isArray(role.data) && role.data[0]?.role === 'user', `${promote.status} ${code(promote)}, role ${role.data?.[0]?.role}`);
  const gd = await rpc('get_draft', { p_page: 'home' }, admin.token);
  check(A, 'admin get_draft(home) works (no draft, nothing published yet)', gd.status === 200 && gd.data && gd.data.draft === null && gd.data.published === null, `${gd.status}`);

  // ── B. Content round trip ──────────────────────────────────────────────
  if (!SKIP_B) {
    const B = 'B content';
    const s1 = await rpc('save_draft', { p_page: 'home', p_content: homeDoc(), p_expected_draft_id: null, p_note: 'staging integration test: draft 1' }, admin.token);
    check(B, 'admin saves a draft (current homepage)', s1.status === 200 && s1.data?.draft_id, `${s1.status} draft ${s1.data?.draft_id}`);
    const D1 = s1.data?.draft_id; created.content_versions.push({ id: D1, as: 'draft 1' });
    const gp = await rpc('get_published_content', { p_page: 'home' });
    check(B, 'draft not visible to guests', gp.status === 200 && gp.data === null, `${gp.status} ${JSON.stringify(gp.data)}`);
    const stale = await rpc('save_draft', { p_page: 'home', p_content: homeDoc(), p_expected_draft_id: null, p_note: null }, admin.token);
    check(B, 'save with a stale expected draft refused', stale.status === 409 && code(stale) === 'PT409', `${stale.status} ${code(stale)}`);
    const bads = {
      'javascript: link': d => { d.components['home.featured'].href = 'javascript:alert(1)'; },
      '<script> in a title': d => { d.components['home.featured'].title = '<script>alert(1)</script>'; },
      'unknown field': d => { d.components['home.featured'].onclick = 'alert(1)'; }
    };
    for (const [name, mut] of Object.entries(bads)) {
      const d = homeDoc(); mut(d);
      const r = await rpc('save_draft', { p_page: 'home', p_content: d, p_expected_draft_id: D1, p_note: null }, admin.token);
      check(B, `invalid content refused: ${name}`, r.status === 422 && code(r) === 'PT422', `${r.status} ${code(r)}`);
    }
    const p1 = await rpc('publish', { p_page: 'home', p_draft_id: D1, p_expected_published_id: null }, admin.token);
    const V1 = p1.data?.version; created.content_versions.push({ id: V1, as: 'published v1' });
    check(B, 'admin publishes', p1.status === 200 && V1, `${p1.status} version ${V1}`);
    const g1 = await rpc('get_published_content', { p_page: 'home' });
    const g1s = JSON.stringify(g1.data);
    check(B, 'guest sees the published version; no account ids or draft paths in the reply',
      g1.status === 200 && g1.data?.version === V1 && !g1s.includes(admin.id) && !g1s.includes(user.id) && !g1s.includes('uploads/'),
      `${g1.status} version ${g1.data?.version}, keys ${Object.keys(g1.data || {}).sort().join(',')}`);
    const d2doc = homeDoc(); d2doc.components['home.spotlight'].title = 'Connect Four Test';
    const s2 = await rpc('save_draft', { p_page: 'home', p_content: d2doc, p_expected_draft_id: null, p_note: 'staging integration test: draft 2' }, admin.token);
    const D2 = s2.data?.draft_id; created.content_versions.push({ id: D2, as: 'draft 2' });
    const p2 = await rpc('publish', { p_page: 'home', p_draft_id: D2, p_expected_published_id: V1 }, admin.token);
    const V2 = p2.data?.version; created.content_versions.push({ id: V2, as: 'published v2 (test title)' });
    const g2 = await rpc('get_published_content', { p_page: 'home' });
    check(B, 'second publish replaces the live version', p2.status === 200 && g2.data?.version === V2 && g2.data?.content?.components?.['home.spotlight']?.title === 'Connect Four Test', `${p2.status} version ${V2}`);
    const stalePub = await rpc('publish', { p_page: 'home', p_draft_id: D2, p_expected_published_id: V1 }, admin.token);
    check(B, 'publishing a consumed draft / stale live version refused', stalePub.status === 409, `${stalePub.status} ${code(stalePub)}`);
    const rb = await rpc('rollback', { p_page: 'home', p_version_id: V1, p_expected_published_id: V2 }, admin.token);
    const V3 = rb.data?.version; created.content_versions.push({ id: V3, as: 'published v3 (rollback to v1 content)' });
    const g3 = await rpc('get_published_content', { p_page: 'home' });
    check(B, 'rollback publishes v1 content as a new version', rb.status === 200 && V3 > V2 && g3.data?.version === V3 && g3.data?.content?.components?.['home.spotlight']?.title === 'Connect Four', `${rb.status} version ${V3}`);
    const rbStale = await rpc('rollback', { p_page: 'home', p_version_id: V1, p_expected_published_id: V2 }, admin.token);
    check(B, 'stale rollback refused', rbStale.status === 409 && code(rbStale) === 'PT409', `${rbStale.status} ${code(rbStale)}`);
    const hist = await rpc('list_versions', { p_page: 'home', p_limit: 20 }, admin.token);
    const st = Object.fromEntries((hist.data || []).map(v => [v.id, v.status]));
    check(B, 'history: drafts superseded, v1/v2 archived, v3 live', st[D1] === 'superseded' && st[D2] === 'superseded' && st[V1] === 'archived' && st[V2] === 'archived' && st[V3] === 'published', JSON.stringify(st));
  }

  // ── C. Media and the Edge Function ─────────────────────────────────────
  const C = 'C media';
  const png = new Uint8Array(readFileSync(new URL('./fixtures/img-37x21.png', import.meta.url)));
  const pngSha = createHash('sha256').update(png).digest('hex');
  const res1 = await rpc('create_media_upload', { p_mime: 'image/png', p_bytes: png.length }, admin.token);
  const M1 = res1.data?.media_id, P1 = res1.data?.path;
  check(C, 'admin reserves a PNG upload', res1.status === 200 && /^uploads\/[0-9a-f-]{36}\.png$/.test(P1 || ''), `${res1.status} ${P1}`);
  created.site_media.push({ id: M1, as: 'PNG test image' });
  const put = (bucket, p, bytes, token, type = 'image/png') => call('POST', `/storage/v1/object/${bucket}/${p}`, { token, raw: bytes, headers: { 'Content-Type': type, 'x-upsert': 'false' } });
  const pu = await put('site-media-drafts', P1, png, user.token);
  const pg = await put('site-media-drafts', P1, png, undefined);
  const pOther = await put('site-media-drafts', `uploads/${crypto.randomUUID()}.png`, png, admin.token);
  check(C, "upload to the admin's issued path refused for user and guest; admin refused on an unissued path",
    pu.status >= 400 && pg.status >= 400 && pOther.status >= 400, `user ${pu.status}, guest ${pg.status}, admin-unissued ${pOther.status}`);
  const pa = await put('site-media-drafts', P1, png, admin.token);
  check(C, 'admin uploads the original to the issued path', pa.status === 200, `${pa.status}`);
  if (pa.status === 200) created.draft_objects.push(`site-media-drafts/${P1}`);
  const pa2 = await put('site-media-drafts', P1, png, admin.token);
  check(C, 'second upload to the same path refused (original preserved)', pa2.status >= 400, `${pa2.status}`);
  const list = (bucket, token) => call('POST', `/storage/v1/object/list/${bucket}`, { token, json: { prefix: bucket === 'site-media' ? 'media' : 'uploads', limit: 100 } });
  const lg = await list('site-media-drafts'), lu = await list('site-media-drafts', user.token), la = await list('site-media-drafts', admin.token);
  const seen = r => Array.isArray(r.data) ? r.data.length : 0;
  check(C, 'draft bucket: guest and user list nothing, admin sees the upload', seen(lg) === 0 && seen(lu) === 0 && Array.isArray(la.data) && la.data.some(o => P1.endsWith(o.name)), `guest ${lg.status}/${seen(lg)}, user ${lu.status}/${seen(lu)}, admin ${la.status}/${seen(la)}`);
  const fake = 'media/' + 'b'.repeat(64) + '.png';
  const sg = await put('site-media', fake, png, undefined), su = await put('site-media', fake, png, user.token), sa = await put('site-media', fake, png, admin.token);
  check(C, 'public bucket: browser uploads refused for guest, user and admin', sg.status >= 400 && su.status >= 400 && sa.status >= 400, `${sg.status}/${su.status}/${sa.status}`);
  const lpg = await list('site-media'), lpu = await list('site-media', user.token);
  check(C, 'public bucket: listing returns nothing for guest and user', seen(lpg) === 0 && seen(lpu) === 0, `guest ${lpg.status}/${seen(lpg)}, user ${lpu.status}/${seen(lpu)}`);

  const fn = (token, body, origin) => call('POST', '/functions/v1/publish-media', { token, json: body, headers: origin ? { Origin: origin } : {} });
  const fu = await fn(user.token, { media_id: M1 });
  check(C, 'publish-media: regular user refused (403)', fu.status === 403 && fu.data?.error === 'forbidden', `${fu.status} ${fu.data?.error}`);
  const fa = await fn(admin.token, { media_id: M1 }, 'http://localhost:4173');
  const PUBP = fa.data?.public_path;
  check(C, 'publish-media: admin gets a content-addressed public copy with measured size',
    fa.status === 200 && PUBP === `media/${pngSha}.png` && fa.data.width === 37 && fa.data.height === 21 && fa.headers.get('access-control-allow-origin') === 'http://localhost:4173',
    `${fa.status} ${PUBP} ${fa.data?.width}x${fa.data?.height}`);
  if (fa.status === 200) created.public_objects.push(`site-media/${PUBP}`);
  const fa2 = await fn(admin.token, { media_id: M1 });
  check(C, 'publish-media: repeat call recognised as already prepared', fa2.status === 200 && fa2.data?.already_prepared === true, `${fa2.status} ${fa2.data?.already_prepared}`);
  const pubGet = await call('GET', `/storage/v1/object/public/site-media/${PUBP}`);
  check(C, 'public URL serves the image with a long cache', pubGet.status === 200 && pubGet.headers.get('content-type') === 'image/png' && /max-age=31536000/.test(pubGet.headers.get('cache-control') || ''),
    `${pubGet.status} ${pubGet.headers.get('content-type')} cache=${pubGet.headers.get('cache-control')}`);

  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="9" height="9"/></svg>');
  const res2 = await rpc('create_media_upload', { p_mime: 'image/png', p_bytes: svg.length }, admin.token);
  const M2 = res2.data?.media_id; created.site_media.push({ id: M2, as: 'SVG disguised as PNG (rejected by the function)' });
  const up2 = await put('site-media-drafts', res2.data?.path, svg, admin.token, 'image/png');
  if (up2.status === 200) created.draft_objects.push(`site-media-drafts/${res2.data?.path}`);
  const f2 = await fn(admin.token, { media_id: M2 });
  check(C, 'SVG uploaded as "image/png": Storage accepts the bytes, publish-media rejects them (422)', up2.status === 200 && f2.status === 422 && f2.data?.error === 'invalid_image', `upload ${up2.status}, function ${f2.status} ${f2.data?.message}`);

  const res3 = await rpc('create_media_upload', { p_mime: 'image/png', p_bytes: 100 }, admin.token);
  const M3 = res3.data?.media_id; created.site_media.push({ id: M3, as: 'type-limit test (no object stored)' });
  const up3 = await put('site-media-drafts', res3.data?.path, svg, admin.token, 'image/svg+xml');
  if (up3.status === 200) created.draft_objects.push(`site-media-drafts/${res3.data?.path}`);
  check(C, 'bucket type limit: upload declared image/svg+xml refused', up3.status >= 400, `${up3.status} ${redact(JSON.stringify(up3.data)).slice(0, 90)}`);
  const res4 = await rpc('create_media_upload', { p_mime: 'image/png', p_bytes: 5242880 }, admin.token);
  const M4 = res4.data?.media_id; created.site_media.push({ id: M4, as: 'size-limit test (no object stored)' });
  const big = new Uint8Array(5_350_000); big.set(png);
  const up4 = await put('site-media-drafts', res4.data?.path, big, admin.token);
  if (up4.status === 200) created.draft_objects.push(`site-media-drafts/${res4.data?.path}`);
  check(C, 'bucket size limit: 5.1 MB upload refused', up4.status >= 400, `${up4.status} ${redact(JSON.stringify(up4.data)).slice(0, 90)}`);
  const over = await rpc('create_media_upload', { p_mime: 'image/png', p_bytes: 5242881 }, admin.token);
  check(C, 'reservation over 5 MiB refused', over.status === 422 && code(over) === 'PT422', `${over.status} ${code(over)}`);

  const gm = await rpc('get_media', { p_ids: [M1] }, admin.token);
  const m = gm.data?.[M1];
  check(C, 'admin get_media: hash, type and dimensions measured from the file', gm.status === 200 && m?.public_path === `media/${pngSha}.png` && m?.mime === 'image/png' && m?.width === 37 && m?.height === 21 && m?.prepared_at, `${gm.status} ${m?.public_path}`);
} finally {
  // ── D. Sign out ────────────────────────────────────────────────────────
  for (const [who, s] of [['admin', admin], ['user', user]]) {
    const r = await call('POST', '/auth/v1/logout?scope=local', { token: s.token });
    check('D cleanup', `${who} session signed out`, r.status === 204 || r.status === 200, `${r.status}`);
  }
}

const cats = [...new Set(results.map(r => r.cat))];
console.log('\nSummary');
for (const c of cats) {
  const rs = results.filter(r => r.cat === c);
  console.log(`  ${c}: ${rs.filter(r => r.ok).length}/${rs.length} passed`);
}
const failed = results.filter(r => !r.ok).length;
console.log(`  total: ${results.length - failed}/${results.length} passed, ${failed} failed`);
console.log('\nTest-created staging data:');
console.log(JSON.stringify(created, null, 2));
const out = process.env.STAGING_RESULTS_FILE;
if (out) writeFileSync(out, JSON.stringify({ ref: STAGING_REF, at: new Date().toISOString(), results, created }, null, 2));
process.exit(failed ? 1 : 0);
