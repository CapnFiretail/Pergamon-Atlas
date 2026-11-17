// Staging check that a saved draft never reaches guests or regular users
// through the public content API the homepage uses. STAGING ONLY.
//
//   node tests/cms/staging-draft-privacy.mjs
//
// Creates one draft (unmistakable title), checks guest/user reads, then
// discards it — leaving one permanent "superseded" history row. Same
// credentials file, host guard and redaction as staging-integration.mjs.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const STAGING_REF = 'rambkiswuigtjfgdxexk';
const PRODUCTION_REF = 'rddijjezqrcjrnwskenb';
const BASE = `https://${STAGING_REF}.supabase.co`;
const HOST = new URL(BASE).host;
const MARK = 'DRAFT ONLY privacy check';

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
const redact = s => { let t = String(s); for (const x of secrets) t = t.split(x).join('«redacted»'); return t.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '«jwt»'); };

async function call(method, p, { token, json } = {}) {
  const url = BASE + p;
  if (new URL(url).host !== HOST || url.includes(PRODUCTION_REF)) throw new Error('Blocked a request that was not for the staging project');
  const h = { apikey: PUB };
  if (token) h.Authorization = `Bearer ${token}`;
  let body; if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const r = await fetch(url, { method, headers: h, body, redirect: 'manual' });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: r.status, data, text };
}
const rpc = (fn, args, token) => call('POST', `/rest/v1/rpc/${fn}`, { token, json: args });
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ' — ' + redact(detail) : ''}`); };
async function signIn(email, password) {
  const r = await call('POST', '/auth/v1/token?grant_type=password', { json: { email, password } });
  if (r.status !== 200) throw new Error(`sign-in failed (HTTP ${r.status})`);
  return r.data.access_token;
}
const adminT = await signIn(cred.PERGAMON_STAGING_ADMIN_EMAIL, cred.PERGAMON_STAGING_ADMIN_PASSWORD);
const userT = await signIn(cred.PERGAMON_STAGING_USER_EMAIL, cred.PERGAMON_STAGING_USER_PASSWORD);
secrets.add(adminT); secrets.add(userT);
for (const k of Object.keys(cred)) delete cred[k];

let draftId = null;
try {
  const cur = await rpc('get_draft', { p_page: 'home' }, adminT);
  const live = await rpc('get_published_content', { p_page: 'home' });
  check('admin can read the draft state; a published version exists', cur.status === 200 && live.status === 200 && live.data && Number.isInteger(live.data.version), `published version ${live.data && live.data.version}`);
  const doc = JSON.parse(JSON.stringify(live.data.content));
  doc.components['home.featured'].title = MARK;
  const saved = await rpc('save_draft', { p_page: 'home', p_content: doc, p_expected_draft_id: cur.data.draft ? cur.data.draft.id : null, p_note: 'draft privacy check (discarded)' }, adminT);
  draftId = saved.data && saved.data.draft_id;
  check('admin saves a draft with an unmistakable title', saved.status === 200 && draftId, `draft ${draftId}`);

  // The exact request the homepage loader makes (publishable key only, no session).
  const guest = await call('GET', '/rest/v1/rpc/get_published_content?p_page=home');
  check('guest (homepage loader request): published version only, draft absent', guest.status === 200 && guest.data.version === live.data.version && !guest.text.includes(MARK), `version ${guest.data.version}, contains draft text: ${guest.text.includes(MARK)}`);
  const user = await call('GET', '/rest/v1/rpc/get_published_content?p_page=home', { token: userT });
  check('signed-in regular user: published version only, draft absent', user.status === 200 && user.data.version === live.data.version && !user.text.includes(MARK), `version ${user.data.version}, contains draft text: ${user.text.includes(MARK)}`);
  const adminPub = await call('GET', '/rest/v1/rpc/get_published_content?p_page=home', { token: adminT });
  check('even the admin gets only the published version from the public API', adminPub.status === 200 && !adminPub.text.includes(MARK), `contains draft text: ${adminPub.text.includes(MARK)}`);
  const gDraft = await rpc('get_draft', { p_page: 'home' });
  const uDraft = await rpc('get_draft', { p_page: 'home' }, userT);
  check('guest and user cannot read the draft directly', gDraft.status === 401 && uDraft.status === 403 && !gDraft.text.includes(MARK) && !uDraft.text.includes(MARK), `guest ${gDraft.status}, user ${uDraft.status}`);
  const gTable = await call('GET', '/rest/v1/site_content_versions?select=content&status=eq.draft');
  const uTable = await call('GET', '/rest/v1/site_content_versions?select=content&status=eq.draft', { token: userT });
  check('guest and user cannot read drafts from the table', gTable.status === 401 && uTable.status === 403 && !gTable.text.includes(MARK) && !uTable.text.includes(MARK), `guest ${gTable.status}, user ${uTable.status}`);
} finally {
  if (draftId) {
    const d = await rpc('discard_draft', { p_page: 'home', p_expected_draft_id: draftId }, adminT);
    check('draft discarded (kept in history as superseded)', d.status === 200, `${d.status} draft ${draftId}`);
  }
  for (const t of [adminT, userT]) await call('POST', '/auth/v1/logout?scope=local', { token: t });
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed${draftId ? `; staging data created: content version ${draftId} (superseded draft)` : ''}`);
process.exit(failed ? 1 : 0);
