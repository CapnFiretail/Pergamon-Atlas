// The Handbook's Widgets page: every entry gives its implementation files,
// and the paths it shows exist in the repository.
//   node --test tests/design/widgets-page.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(ROOT, 'PergamonAtlas.V1/scripts/handbook/widgets-page.js'), 'utf8');
const siteDir = src.match(/const SITE_DIR = '([^']+)'/)[1];
const paths = [...src.matchAll(/\{ path: '([^']+)' \}/g)].map(m => m[1]);

test('every entry has a Source row with paths', () => {
  const entries = src.split('const art = entry(').slice(1);
  assert.equal(entries.length, 9);           // the two feature banners share one
  entries.forEach(e => assert.match(e, /\['Source', \[\{ path: /, e.slice(0, 60)));
});

// Compared with the folder's own listing: existsSync ignores case on Windows.
test('every path exists, with the same spelling', () => {
  paths.forEach(p => {
    const full = path.join(ROOT, siteDir, p);
    assert.ok(existsSync(full) && readdirSync(path.dirname(full)).includes(path.basename(full)), siteDir + p);
  });
});

test('every library component file is listed', () => {
  ['scripts', 'styles'].forEach(kind => readdirSync(path.join(ROOT, siteDir, kind, 'components')).forEach(f =>
    assert.ok(paths.includes(`${kind}/components/${f}`), `${kind}/components/${f}`)));
});
