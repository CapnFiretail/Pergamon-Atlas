// 0016 on a real PostgreSQL with real connections: CONCURRENCY-0016.md, part A.
//
//   node tests/cms/concurrency-0016.mjs <folder with initdb, postgres, pg_ctl and psql>
//
// It makes its own throwaway cluster (temporary folder, its own port, loopback
// only, no password), applies 0001–0016 to it and removes it. It connects to
// nothing else: no Supabase project, no credentials. Not part of `npm test`.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = process.argv[2];
if (!BIN || !fs.existsSync(BIN)) { console.error('Give the folder of the PostgreSQL programs.'); process.exit(2); }
const exe = name => path.join(BIN, name + (process.platform === 'win32' ? '.exe' : ''));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pergamon-pg-')), DATA = path.join(DIR, 'data'), PORT = '54399';
// Only its own server: nothing inherited from the caller's PG* settings.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
Object.assign(env, { PGHOST: '127.0.0.1', PGPORT: PORT, PGUSER: 'postgres', PGDATABASE: 'postgres', PGCLIENTENCODING: 'UTF8' });
const run = (name, args) => execFileSync(exe(name), args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const wait = ms => new Promise(r => setTimeout(r, ms));
let files = 0;
const args = sql => { const f = path.join(DIR, `q${files++}.sql`); fs.writeFileSync(f, sql); return ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-f', f]; };
const psql = sql => run('psql', args(sql));
// One connection, in the background: { out, err, ms }.
const session = sql => new Promise(resolve => {
  const t = Date.now(), p = spawn(exe('psql'), args(sql), { env });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
  p.on('close', () => resolve({ out: out.trim(), err: err.trim(), ms: Date.now() - t }));
});
let failed = 0;
const ok = (c, what) => { if (!c) failed++; console.log(c ? 'ok  ' : 'FAIL', what); };

const quiet = `\\g ${process.platform === 'win32' ? 'NUL' : '/dev/null'}\n`;
const J = o => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
// One request, as PostgREST makes it: a role, its claims, one transaction.
const as = (id, body, end = 'commit', role = 'authenticated') => `begin;\nselect set_config('request.jwt.claims', '${JSON.stringify({ role, sub: id })}', true) ${quiet}set local role ${role};\n${body}${end};\n`;
const call = sql => `select ${sql} ${quiet}`;
const hold = s => `select pg_sleep(${s}) ${quiet}`;
const record = (id, o = {}) => ({ name: id, category: 'Arcade', destination: `/games/${id}/`, availability: 'available', ...o });
const IDS = ['snake', 'pong', 'breakout'];
const library = g => ({ schema: 1, components: { 'library.games': { order: Object.keys(g) }, ...Object.fromEntries(Object.entries(g).map(([k, v]) => ['library.games.' + k, v])) } });
const of = (...ids) => library(Object.fromEntries(ids.map(i => [i, record(i)])));
const page = ids => ({ schema: 2, regions: [{ id: 'main', widgets: [{ id: 'grid', type: 'card-grid', col: 1, row: 1, cols: 20, rows: 7 }] }], components: { 'games.grid': { order: ids }, ...Object.fromEntries(ids.map(i => ['games.grid.' + i, { game: i }])) } });
const home = (art, art2) => ({ schema: 1, components: { 'home.featured': { title: 'A', cta: 'Go', href: '/games/', ...(art && { art }) }, 'home.spotlight': { title: 'B', cta: 'Go', href: '/games/', ...(art2 && { art: art2 }) }, 'home.carousel': { order: [] } } });

const idOf = (p, status) => psql(`select id from public.site_content_versions where page = '${p}' and status = '${status}'`) || 'null';
const draftOf = p => idOf(p, 'draft'), liveOf = p => idOf(p, 'published');
const saving = (p, d, expected) => call(`public.save_draft('${p}', ${J(d)}, ${expected})`);
const publishing = p => call(`public.publish('${p}', ${draftOf(p)}, ${liveOf(p)})`);
const save = (p, d) => psql(as(A, saving(p, d, draftOf(p))));
const publish = p => psql(as(A, publishing(p)));
// Until some connection holds (or waits for) a page's lock.
async function locked(key, granted, mode) {
  for (let i = 0; i < 100; i++) {
    if (psql(`select count(*) from pg_locks where locktype = 'advisory' and granted = ${granted} and mode = '${mode}' and ((classid::bigint << 32) | objid::bigint) = hashtext('pergamon.site_content:${key}')::bigint`) !== '0') return true;
    await wait(50);
  }
  return false;
}
const code = (r, c) => new RegExp(`\\b${c}\\b`).test(r.err);

let server;
try {
  run('initdb', ['-D', DATA, '-A', 'trust', '-U', 'postgres', '-E', 'UTF8', '--locale=C']);
  fs.appendFileSync(path.join(DATA, 'postgresql.conf'), `\nport = ${PORT}\nlisten_addresses = '127.0.0.1'\nfsync = off\nlog_min_messages = fatal\n`);
  server = spawn(exe('postgres'), ['-D', DATA], { env, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { psql('select 1'); up = true; } catch (e) { await wait(250); } }
  const same = s => s.replace(/\\/g, '/').toLowerCase();
  if (same(psql('show data_directory')) !== same(DATA)) throw new Error('another server answered on that port');
  console.log('PostgreSQL', psql('show server_version'), '·', psql('show default_transaction_isolation'));

  const bootstrap = fs.readFileSync(path.join(ROOT, 'tests/cms/supabase-env.mjs'), 'utf8').replace(/\r\n/g, '\n').match(/const BOOTSTRAP = `([\s\S]*?)`;/)[1];
  psql(bootstrap);
  const sql = f => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
  ['migrations/0001_pergamon_profiles', 'migrations/0002_atlas_visibility_overrides', 'migrations/0003_homepage_settings', 'migrations/0004_homepage_storage', 'migrations/0005_homepage_display_controls', 'migrations/0006_homepage_featured_trio',
    'proposed/0008_site_content', 'proposed/0009_site_media', 'proposed/0011_shared_public_media', 'proposed/0012_saved_cards', 'proposed/0013_site_sidebar', 'proposed/0014_page_layout', 'proposed/0015_studio_documents'].forEach(f => psql(sql(f + '.sql')));
  psql(`insert into auth.users (id, email) values ('${A}', 'a@example.test'), ('${B}', 'b@example.test'); update public.profiles set role = 'admin' where id in ('${A}', '${B}');`);
  save('home', home()); publish('home');
  // A situation of its own: a copy of this database, as 0015 leaves it.
  const database = name => { env.PGDATABASE = 'template1'; psql(`create database ${name} template postgres`); env.PGDATABASE = name; };
  const allTrue = (f, n) => { const x = psql(sql('proposed/' + f)); return !/\|f\|/.test(x) && (x.match(/\|t\|/g) || []).length === n; };
  const preflight = () => allTrue('preflight_0016.sql', 7), verified = () => allTrue('verify_0016.sql', 15);
  const apply = () => psql(sql('proposed/0016_game_library.sql'));
  const recovery = sql('proposed/recovery_0016.sql').replace(/\r\n/g, '\n');

  database('main_case');
  ok(preflight(), 'preflight: every check true');
  apply();
  ok(verified(), 'verification: every check true');

  save('library', of('snake')); publish('library');
  let a, b;

  // A1. A page is published while the library publish that adds its game is open.
  save('library', of('snake', 'pong')); save('games', page(['snake', 'pong']));
  a = session(as(A, publishing('library') + hold(2)));
  ok(await locked('library', true, 'ExclusiveLock'), 'A1 library publish open');
  b = session(as(B, publishing('games')));
  ok(await locked('library', false, 'ShareLock'), 'A1 page publish waits for it');
  [a, b] = [await a, await b];
  ok(!a.err && !b.err, 'A1 then sees the game and succeeds ' + a.err + b.err);

  // A2. The same, but the library publish is undone: the page is refused.
  save('library', of(...IDS)); save('games', page(['snake', 'breakout']));
  const before = liveOf('games');
  a = session(as(A, publishing('library') + hold(2), 'rollback'));
  await locked('library', true, 'ExclusiveLock');
  b = await session(as(B, publishing('games')));
  await a;
  ok(code(b, 'PT422') && /publish the library first/.test(b.err) && liveOf('games') === before, 'A2 library publish undone: page refused, nothing live');

  // A3. The library is published while a page publish is open.
  save('games', page(['snake', 'pong']));
  a = session(as(B, publishing('games') + hold(2)));
  ok(await locked('library', true, 'ShareLock'), 'A3 page publish open');
  b = session(as(A, publishing('library')));
  ok(await locked('library', false, 'ExclusiveLock'), 'A3 library publish waits for it');
  [a, b] = [await a, await b];
  ok(!a.err && !b.err, 'A3 both succeed ' + a.err + b.err);

  // A4. A page without references doesn't wait for the library.
  save('library', of(...IDS));
  const homeDraft = draftOf('home');
  a = session(as(A, publishing('library') + hold(4)));
  await locked('library', true, 'ExclusiveLock');
  b = await session(as(B, saving('home', home(), homeDraft)));
  ok(!b.err && psql("select count(*) from pg_locks where locktype = 'advisory' and granted and mode = 'ExclusiveLock'") !== '0', `A4 homepage save goes ahead while the library publish is open ${b.err}`);
  await a;

  // A5, A6. Two of the same thing at once: one succeeds, one is told; nothing is lost.
  save('library', of(...IDS));
  const pub = publishing('library');
  let two = await Promise.all([A, B].map(id => session(as(id, pub + hold(0.3)))));
  ok(two.filter(x => !x.err).length === 1 && two.some(x => code(x, 'PT409')), 'A5 two library publishes: one, and one conflict');
  const base = draftOf('library');
  two = await Promise.all([A, B].map(id => session(as(id, saving('library', of(...IDS), base) + hold(0.3)))));
  ok(two.filter(x => !x.err).length === 1 && two.some(x => code(x, 'PT409')), 'A6 two saves of one draft: one, and one conflict');

  // A7. Homepage and library publish the same new images, in opposite orders, while a
  // third connection holds the last one: neither may wait for the other in a circle.
  const images = () => [1, 2].map(n => {
    const id = psql(as(A, "select public.create_media_upload('image/webp', 1000) ->> 'media_id';\n"));
    const sha = String(n).repeat(64);
    psql(as(A, call(`public.cms_record_prepared_media('${id}', 'media/${sha}.webp', 'image/webp', 1000, 600, 600, '${sha}')`), 'commit', 'service_role'));
    return id;
  }).sort();
  let media = images();
  const art = i => ({ source: { media: media[i] }, alt: '' });
  save('home', home(art(0), art(1)));
  save('library', library({ snake: record('snake', { art: art(1), wide: art(0) }), pong: record('pong'), breakout: record('breakout') }));
  const jobs = [publishing('home'), publishing('library')];
  const blocker = session(`begin;\nselect 1 from public.site_media where id = '${media[1]}' for update ${quiet}${hold(2)}commit;\n`);
  await wait(700);
  two = await Promise.all(jobs.map((x, i) => session(as([A, B][i], x))));
  await blocker;
  ok(two.every(x => !x.err), 'A7 two publishes sharing images: both succeed ' + two.map(x => x.err).join(' '));
  ok(psql('select count(*) from public.site_media where published_at is not null') === '2', 'A7 both images are published');

  // A8. Many writers and readers together.
  const writer = i => {
    const p = i % 3 ? 'games' : 'library';
    const doc = p === 'library' ? library(Object.fromEntries(IDS.map(k => [k, record(k, { name: k + i, availability: ['available', 'hidden', 'archived'][(i + k.length) % 3] })]))) : page(IDS.slice(0, 1 + (i % 3)));
    return session(as(i % 2 ? A : B, `do $$ declare v jsonb; dr bigint; begin
      v := public.get_draft('${p}');
      dr := (public.save_draft('${p}', ${J(doc)}, (v -> 'draft' ->> 'id')::bigint) ->> 'draft_id')::bigint;
      perform pg_sleep(random() * 0.05);
      perform public.publish('${p}', dr, (v -> 'published' ->> 'id')::bigint);
    end $$;\n`));
  };
  const reader = () => session(Array.from({ length: 40 }, () => "select public.get_published_content('games')::text;").join('\n'));
  const [writers, readers] = await Promise.all([Promise.all(Array.from({ length: 24 }, (_, i) => writer(i))), Promise.all(Array.from({ length: 6 }, reader))]);
  const good = writers.filter(x => !x.err).length;
  ok(good > 0 && writers.every(x => !x.err || code(x, 'PT409')), `A8 24 writers: ${good} published, ${24 - good} told of a conflict, nothing else`);
  let reads = 0, wrong = 0;
  readers.forEach(r => r.out.split('\n').filter(Boolean).forEach(line => {
    const x = JSON.parse(line), refs = Object.values(x.content.components).filter(c => c && c.game).map(c => c.game); reads++;
    if (refs.some(g => !x.library.games[g]) || Object.values(x.library.games).some(g => !['available', 'coming-soon'].includes(g.availability)) || x.content.components['games.grid'].order.length !== refs.length) wrong++;
  }));
  ok(reads === 240 && wrong === 0, `A8 ${reads} reads: every reference had its record, none hidden`);

  // What must hold after all of it.
  ok(psql("select count(*) from public.site_content_versions v, unnest(public.cms_game_refs(v.content)) r where v.page <> 'library' and v.status = 'published' and not exists (select 1 from public.site_content_versions l where l.page = 'library' and l.status = 'published' and (l.content -> 'components') ? ('library.games.' || r))") === '0', 'every live reference resolves');
  ok(psql("select count(*) from (select lag(content -> 'components') over (order by id) p, content -> 'components' c from public.site_content_versions where page = 'library' and status in ('published', 'archived')) x, jsonb_object_keys(p) k where not c ? k") === '0', 'no published id was ever lost');
  ok(psql("select string_agg(page || ':' || c, ',' order by page) from (select page, count(*) c from public.site_content_versions where status = 'published' group by page) x") === 'games:1,home:1,library:1', 'one live version of each');
  ok(psql('select sum(deadlocks) from pg_stat_database') === '0', 'the server counted no deadlock');
  let refusal = '';
  try { psql(sql('proposed/recovery_0016.sql')); } catch (e) { refusal = String(e.stderr); }
  ok(/leave 0016 in place/.test(refusal) && psql("select to_regprocedure('public.cms_validate_library(jsonb)') is not null") === 't', 'recovery refuses once something was saved, and changes nothing');

  // A9. 0016 is applied while administrators save and publish the homepage.
  const homeWriter = i => session(as(i % 2 ? A : B, `do $$ declare v jsonb; dr bigint; begin
      v := public.get_draft('home');
      dr := (public.save_draft('home', ${J(home())}, (v -> 'draft' ->> 'id')::bigint) ->> 'draft_id')::bigint;
      perform pg_sleep(random() * 0.1);
      perform public.publish('home', dr, (v -> 'published' ->> 'id')::bigint);
    end $$;\n`));
  const homeReader = () => session(Array.from({ length: 60 }, () => "select public.get_published_content('home') -> 'content' ->> 'schema' from pg_sleep(0.01);").join('\n'));
  const tally = list => { const t = {}; list.forEach(x => { const k = x.err ? (x.err.match(/ERROR:\s+(\w{5})/) || [, x.err.slice(0, 80)])[1] : 'done'; t[k] = (t[k] || 0) + 1; }); return t; };
  const storm = async middle => {
    const first = Array.from({ length: 10 }, (_, i) => homeWriter(i)), readers = [1, 2, 3, 4].map(homeReader);
    await wait(60);
    const change = session(middle);
    const second = Array.from({ length: 10 }, (_, i) => homeWriter(i));
    const c = await change, writers = await Promise.all([...first, ...second]), reads = (await Promise.all(readers)).flatMap(x => (x.err ? ['error ' + x.err] : x.out.split(/\r?\n/)));
    return { c, t: tally(writers), reads: reads.length === 240 && reads.every(y => y === '1') ? '' : `reads ${reads.length}: ${[...new Set(reads)].slice(0, 3)}` };
  };
  const onlyHome = () => psql("select count(*) from public.site_content_versions where page <> 'home'") === '0' && psql("select count(*) from public.site_content_versions where page = 'home' and status = 'published'") === '1';
  database('apply_case');
  let x = await storm(sql('proposed/0016_game_library.sql'));
  ok(!x.c.err && !x.reads && Object.keys(x.t).every(k => ['done', 'PT409'].includes(k)), `A9 applied among 20 homepage writers: ${JSON.stringify(x.t)} ${x.c.err}${x.reads}`);
  ok(verified() && onlyHome(), 'A9 verification: every check true');

  // A10. Recovery while a homepage save is open: waits for it, then succeeds.
  database('recover_open'); apply();
  a = session(as(A, saving('home', home(), 'null') + hold(2)));
  await locked('home', true, 'ExclusiveLock');
  b = session(recovery);
  ok(await locked('home', false, 'ExclusiveLock'), 'A10 recovery waits for an open homepage save');
  [a, b] = [await a, await b];
  ok(!a.err && !b.err && preflight(), 'A10 both succeed, and it is 0015’s database again ' + a.err + b.err);

  // A11. Recovery while the first library save is open: waits, then refuses.
  database('recover_library'); apply();
  a = session(as(A, saving('library', of('snake'), 'null') + hold(2)));
  await locked('library', true, 'ExclusiveLock');
  b = session(recovery);
  ok(await locked('library', false, 'ExclusiveLock'), 'A11 recovery waits for an open library save');
  [a, b] = [await a, await b];
  ok(!a.err && /leave 0016 in place/.test(b.err) && draftOf('library') !== 'null', 'A11 the save is kept, recovery refuses');
  psql(as(A, saving('library', of('snake', 'pong'), draftOf('library'))));
  ok(true, 'A11 and 0016 still works');

  // A12. Writes that start while recovery is open (about to commit).
  database('recover_writes'); apply();
  const homeLive = liveOf('home');
  b = session(recovery.replace('\ncommit;\n', `\nselect pg_sleep(3) ${quiet}commit;\n`));
  await locked('library', true, 'ExclusiveLock');
  const during = { library: session(as(A, saving('library', of('snake'), 'null'))), games: session(as(B, saving('games', page([]), 'null'))), home: session(as(A, saving('home', home(), 'null'))), read: session("select public.get_published_content('home') ->> 'version';") };
  for (const k of Object.keys(during)) during[k] = await during[k];
  b = await b;
  console.log('     A12 outcomes:', Object.entries(during).map(([k, v]) => k + ' ' + (v.err ? (v.err.match(/ERROR:\s+(.*)/) || [, v.err])[1].slice(0, 90) : 'done')).join(' | '));
  ok(!b.err && code(during.library, 'PT422') && code(during.games, 'PT422'), 'A12 library and Games writes are refused ' + b.err);
  ok(!during.home.err && during.read.out === homeLive, 'A12 the homepage save succeeds, visitors are answered ' + during.home.err);
  ok(onlyHome() && preflight(), 'A12 nothing of 0016 is left');
  publish('home');
  ok(liveOf('home') !== homeLive, 'A12 and can be published');

  // A13. Recovery among many homepage writers.
  database('recover_storm'); apply();
  x = await storm(recovery);
  ok(!x.c.err && !x.reads && onlyHome() && preflight(), `A13 recovered among 20 homepage writers: ${JSON.stringify(x.t)} ${x.c.err}${x.reads}`);
  ok(Object.keys(x.t).every(k => ['done', 'PT409'].includes(k)), 'A13 every write happened or was told of a conflict');
  ok(psql('select sum(deadlocks) from pg_stat_database') === '0', 'still no deadlock');

  // A14. The test can fail: without 0016's image order and without its library lock.
  database('control'); apply();
  const weak = psql("select pg_get_functiondef('public.cms_require_games(text,jsonb,boolean)'::regprocedure)").replace(/perform pg_advisory_xact_lock_shared[^;]*;/, '');
  psql(weak + ';');
  save('library', of('snake')); publish('library');
  save('library', of('snake', 'pong')); save('games', page(['snake', 'pong']));
  a = session(as(A, publishing('library') + hold(2)));
  await locked('library', true, 'ExclusiveLock');
  b = await session(as(B, publishing('games')));
  await a;
  ok(code(b, 'PT422'), 'A14 without the library lock, A1 fails (so A1 tests it)');
  // Images: stored highest id first and read in that order, the lowest held by someone
  // else. A publish waiting for it must not hold the highest yet.
  psql('alter database control set enable_indexscan = off; alter database control set enable_bitmapscan = off;');
  const highestFree = async () => {
    media = images();
    psql(`update public.site_media set published_at = null where id = '${media[0]}'`);
    save('home', home(art(0), art(1)));
    const job = publishing('home'), holder = session(`begin;\nselect 1 from public.site_media where id = '${media[0]}' for update ${quiet}${hold(2)}commit;\n`);
    await wait(600);
    const p = session(as(A, job));
    await wait(700);
    const free = await session(`begin;\nselect 1 from public.site_media where id = '${media[1]}' for update nowait ${quiet}rollback;\n`);
    const first = psql(`select id = '${media[1]}' from public.site_media where id in ('${media[0]}', '${media[1]}') order by ctid limit 1`);
    await holder;
    return { order: first === 't', done: !(await p).err, free: !free.err };
  };
  let h = await highestFree();
  ok(h.order && h.done && h.free, 'A14 0016: a publish waiting for its first image holds none of the others ' + JSON.stringify(h));
  const activate = psql("select pg_get_functiondef('public.cms_activate(text,jsonb,bigint,bigint,uuid)'::regprocedure)").replace(/\r/g, '');
  const weaker = activate.replace(/perform 1 from public\.site_media[^;]*;/, '');
  if (weaker === activate) throw new Error('the image order is not where it was');
  psql(weaker + ';');
  psql('alter table public.site_media disable trigger all; delete from public.site_media; alter table public.site_media enable trigger all;');
  h = await highestFree();
  ok(h.order && !h.free, 'A14 without the image order it holds them (so the case above tests it) ' + JSON.stringify(h));
} catch (e) {
  failed++; console.error('STOPPED', e.stderr || e);
} finally {
  if (server) { try { run('pg_ctl', ['-D', DATA, '-m', 'immediate', 'stop']); } catch (e) { server.kill(); } await wait(800); }
  fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
console.log(failed ? `${failed} FAILED` : 'ALL OK', fs.existsSync(DIR) ? `(left: ${DIR})` : '(cluster removed)');
process.exit(failed ? 1 : 0);
