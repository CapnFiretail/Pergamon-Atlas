// Atlas Studio: its sections, and that only the entry script reaches pages
// before the administrator check. No dependencies:
//   node --test tests/design/studio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PergamonAtlas.V1');
const read = p => readFileSync(path.join(SITE, p), 'utf8');

const window = {};
vm.runInNewContext(read('scripts/studio/sections.js'), { window });
const { DEFAULT, GROUPS, ICONS } = window.PergamonStudio.sections;
const items = GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.id })));

test('the sections, in order, landing on Connections', () => {
  assert.equal(GROUPS.map(g => g.label + ': ' + g.items.map(i => i.label).join(', ')).join('; '),
    'Workspace: Overview, Connections, Ideas; Development: Environments, Releases, Workflows, Analytics; Infrastructure: Services, Monitoring');
  assert.equal(items.find(i => i.path === DEFAULT).label, 'Connections');
});

test('every section has a unique path in its group, an icon and a description', () => {
  assert.equal(new Set(items.map(i => i.path)).size, items.length);
  items.forEach(i => {
    assert.ok(i.path.startsWith(i.group + '/'), i.path);
    assert.ok(ICONS[i.icon], i.icon);
    assert.ok(i.text, i.path);
  });
});

test('pages load only the entry script (and /studio/ its gate)', () => {
  const pages = readdirSync(SITE, { recursive: true }).map(p => p.replace(/\\/g, '/')).filter(p => p.endsWith('.html'));
  const found = {};
  pages.forEach(p => { const refs = read(p).match(/\/(?:scripts\/(?:studio|canvas)\/[\w/-]+\.js|styles\/(?:studio[\w-]*|canvas)\.css)(?=")/g); if (refs) found[p] = refs; });
  const entry = '/scripts/studio/entry.js';
  assert.deepEqual(found, { 'handbook/index.html': [entry], 'index.html': [entry], 'studio/index.html': [entry, '/scripts/studio/gate.js'] });
  // The entry script uses the Handbook's administrator check, loaded just before it.
  Object.keys(found).forEach(p => assert.match(read(p), /<script src="\/scripts\/handbook\/entry\.js"><\/script>\s*<script src="\/scripts\/studio\/entry\.js">/, p));
  assert.match(read('studio/index.html'), /name="robots" content="noindex, nofollow"/);
});

test('Environments: local, staging and production, in order, as links that open a new tab', () => {
  const w = { PergamonStudio: { app: { register: (path, r) => { w.registered = [path, r]; } } } };
  vm.runInNewContext(read('scripts/studio/environments.js'), { window: w, URL });
  assert.equal(w.registered[0], 'development/environments');
  const list = w.PergamonStudio.environments.ENVIRONMENTS;
  assert.equal(list.map(e => e.name).join(', '), 'Local, Staging, Production');
  assert.equal(list[0].url, 'http://localhost:4173/');
  list.slice(1).forEach(e => assert.equal(new URL(e.url).protocol, 'https:'));
  list.forEach(e => { assert.ok(ICONS[e.icon], e.icon); assert.equal(new URL(e.url).search + new URL(e.url).username, ''); });
  assert.match(read('scripts/studio/environments.js'), /target = '_blank';\s*a\.rel = 'noopener noreferrer'/);
  assert.doesNotMatch(read('scripts/studio/environments.js'), /fetch\(|XMLHttpRequest|iframe/);
});

test('every file the gate loads exists', () => {
  const assets = [...read('scripts/studio/gate.js').matchAll(/(?:css|js): '([^']+)'/g)].map(m => m[1]);
  assert.ok(assets.length >= 3);
  assets.forEach(a => assert.ok(existsSync(path.join(SITE, a)), a));
});
