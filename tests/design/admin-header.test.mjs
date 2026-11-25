// The shared header's administrator controls: one check, one source, and no page
// that adds anything of its own.
//   node --test tests/design/admin-header.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PergamonAtlas.V1');
const read = p => readFileSync(path.join(SITE, p), 'utf8');
const files = readdirSync(SITE, { recursive: true }).map(p => p.replace(/\\/g, '/'));
const pages = files.filter(p => p.endsWith('.html') && read(p).includes('/scripts/layout.js'));
const scripts = files.filter(p => p.endsWith('.js') && !p.startsWith('vendor/'));
const having = (list, re) => list.filter(p => re.test(read(p)));

test('every page with a site header uses the shared one, and none adds the controls itself', () => {
  assert.equal(pages.length, files.filter(p => p.endsWith('index.html')).length, 'every page');
  assert.deepEqual(having(pages, /admin-header\.(js|css)|pa-(studio|handbook)-link|cms-admin-button/), []);
  // Only the pages that decide what to show by the check load it themselves; the header does on the others.
  assert.deepEqual(having(pages, /admin-access\.js/).sort(), ['games/index.html', 'handbook/index.html', 'index.html', 'studio/index.html']);
  having(pages, /admin-access\.js/).forEach(p => { const s = read(p); assert.ok(s.indexOf('auth/auth.js') < s.indexOf('admin-access.js') && s.indexOf('admin-access.js') < s.search(/src="[^"]*(?:cms\/admin|\/gate)\.js/), p); });
});

test('one administrator check, and one place that draws the controls', () => {
  assert.deepEqual(having(scripts, /isCmsAdmin\(/).sort(), ['operation/scripts/auth/auth.js', 'scripts/admin-access.js']);
  assert.deepEqual(having(scripts, /pa-\$\{l\.id\}-link|cms-admin-button'/), ['scripts/admin-header.js']);
  assert.deepEqual(having(scripts, /'\/scripts\/admin-header\.js'/), ['scripts/layout.js']);
  assert.deepEqual(having(files.filter(p => p.endsWith('.css')), /\.cms-admin-button\.is-active \{|\.pa-actions\[data-admin\]/), ['styles/admin-header.css']);
});

test('the header’s copy of the auth client is the one every page uses', () => {
  const layout = read('scripts/layout.js');
  const [, src, integrity] = layout.match(/src: '(\/vendor\/supabase-js\/[^']+)', integrity: '([^']+)'/);
  const withClient = having(pages, /vendor\/supabase-js/);
  assert.ok(withClient.length > 10);
  withClient.forEach(p => assert.ok(read(p).includes(`src="${src}" integrity="${integrity}"`), p));
  assert.ok(files.includes(src.slice(1)));
});

// The check and the controls with a stand-in page.
function world({ admin = true, session = true, rpc } = {}) {
  const state = { admin, session, calls: 0, auth: [] };
  const window = {
    location: { pathname: '/games/' }, PergamonSupabaseClient: {}, addEventListener() {},
    PergamonAuth: {
      getSession: async () => ({ data: { session: state.session ? {} : null } }),
      isCmsAdmin: async () => { state.calls++; return rpc ? rpc() : { data: state.admin }; },
      onAuthStateChange: fn => state.auth.push(fn)
    }
  };
  vm.runInNewContext(read('scripts/admin-access.js'), { window, setTimeout });
  return { window, state, access: window.PergamonAdmin };
}
const settle = () => new Promise(r => setTimeout(r, 15));

test('the check: the server’s answer, asked again when the session changes, never from the browser', async () => {
  let w = world({ session: false });
  assert.equal(await w.access.verify(), false);
  assert.equal(w.state.calls, 0, 'a guest isn’t asked about');
  for (const rpc of [() => ({ data: false }), () => ({ error: {} }), () => ({ data: 'true' }), () => ({ data: 1 }), () => { throw new Error('down'); }]) assert.equal(await world({ rpc }).access.verify(), false);
  w = world();
  const heard = [];
  w.access.onChange(ok => heard.push(ok));
  assert.equal(w.access.isAdmin(), false, 'not before the answer');
  assert.equal(await w.access.verify(), true);
  w.state.admin = false; w.state.auth[0]('SIGNED_IN'); await settle();
  assert.equal(w.access.isAdmin(), false);
  w.state.auth[0]('TOKEN_REFRESHED'); await settle();
  w.state.admin = true; assert.equal(await w.access.recheck(), true);
  w.state.session = false; w.state.auth[0]('SIGNED_OUT'); await settle();
  assert.deepEqual(heard, [true, false, true, false]);
});

test('Admin Mode’s control: the page’s editor, or that there is none', async () => {
  const { access } = world();
  assert.equal(access.editor(), null);
  const states = [];
  access.onEditor(s => states.push(s));
  ['loading', 'ready', 'failed'].forEach(state => access.provideEditor({ state }));
  assert.deepEqual(states, ['loading', 'ready', 'failed']);
  let got = null;
  access.adminButton().then(b => { got = b; });
  await settle();
  assert.equal(got, null, 'waits for the header');
  access.setAdminButton('button'); await settle();
  assert.equal(got, 'button');
  access.setAdminButton(null);
  let later = null;
  access.adminButton().then(b => { later = b; });
  await settle();
  assert.equal(later, null, 'a removed control isn’t handed out');
});
