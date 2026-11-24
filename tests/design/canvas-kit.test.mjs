// The canvas design shared by the editing canvases (S3). No dependencies:
//   node --test "tests/design/*.test.mjs"
// What it looks like is checked in the browser; this keeps it appearance only,
// the two editing engines independent, and all of it away from visitors.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'PergamonAtlas.V1');
const read = f => readFileSync(path.join(SITE, f), 'utf8');
const code = f => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = '/styles/canvas-kit.css', JS = '/scripts/design/canvas-kit.js';

test('the two editing engines share the design and nothing else', () => {
  // history (grid/editor.js) is the one generic part Studio also uses, through its store.
  ['geometry', 'renderer', 'interaction'].forEach(f => assert.doesNotMatch(code(`scripts/canvas/${f}.js`), /PergamonGrid|atlas-/, f));
  ['atlas-grid', 'editor', 'interaction', 'overlay', 'renderer'].forEach(f => assert.doesNotMatch(code(`scripts/grid/${f}.js`), /PergamonCanvas|\bcv-/, f));
  assert.doesNotMatch(code('styles/canvas.css'), /atlas-/);
  assert.doesNotMatch(code('styles/grid-editor.css'), /\bcv-|--cv-/);
  assert.doesNotMatch(code('styles/canvas-kit.css'), /\.cv\b|\.cv-|--cv-|atlas-|\.st-|\.stc-|\.cms-|\.hb/);
  assert.doesNotMatch(code('scripts/design/canvas-kit.js'), /PergamonGrid|PergamonCanvas|PergamonStudio|PergamonCMS|PergamonHandbook/);
});

test('the engines that decide positions and changes know nothing of the design', () => {
  ['scripts/grid/atlas-grid.js', 'scripts/grid/editor.js', 'scripts/grid/interaction.js', 'scripts/grid/renderer.js', 'scripts/canvas/geometry.js', 'scripts/canvas/interaction.js']
    .forEach(f => assert.doesNotMatch(code(f), /canvasKit|\bck-/, f));
});

test('colours are theme roles only', () => {
  ['styles/canvas-kit.css', 'styles/canvas.css', 'styles/grid-editor.css'].forEach(f => {
    const left = code(f).replaceAll('rgb(0 0 0 / 0.35)', '');          // the round actions' own shadow, as on Admin Mode's pencils
    assert.doesNotMatch(left, /#[0-9a-f]{3,8}\b(?!-)|rgba?\(|hsla?\(/i, f);
  });
});

test('every page that edits loads it before what uses it', () => {
  const order = {
    'scripts/studio/gate.js': [[CSS, '/styles/canvas.css'], [CSS, '/styles/studio-connections.css'], [JS, '/scripts/studio/ui.js'], [JS, '/scripts/canvas/renderer.js']],
    'scripts/handbook/gate.js': [[CSS, '/styles/canvas.css'], [CSS, '/styles/grid-editor.css'], [JS, '/scripts/grid/overlay.js'], [JS, '/scripts/handbook/layout-lab.js'], [JS, '/scripts/canvas/renderer.js']],
    'scripts/cms/admin.js': [[CSS, '/styles/cms-admin.css'], [CSS, '/styles/grid-editor.css'], [JS, '/scripts/grid/overlay.js'], [JS, '/scripts/cms/layout-mode.js']]
  };
  for (const [f, pairs] of Object.entries(order)) for (const [a, b] of pairs) {
    const i = code(f).indexOf(`'${a}'`), j = code(f).indexOf(`'${b}'`);
    assert.ok(i >= 0 && j > i, `${f}: ${a} before ${b}`);
  }
  [CSS, JS].forEach(f => assert.ok(existsSync(path.join(SITE, f))));
});

test('no page loads it for visitors', () => {
  const pages = readdirSync(SITE, { recursive: true }).map(p => p.replace(/\\/g, '/')).filter(p => p.endsWith('.html'));
  pages.forEach(p => assert.doesNotMatch(read(p), /canvas-kit/, p));
});

test('every class the code uses is defined', () => {
  const css = code('styles/canvas-kit.css');
  const used = new Set(['scripts/design/canvas-kit.js', 'scripts/canvas/renderer.js', 'scripts/grid/overlay.js', 'scripts/studio/connections/page.js', 'scripts/studio/document-flow.js', 'scripts/cms/layout-mode.js', 'scripts/handbook/layout-lab.js', 'scripts/handbook/canvas-page.js']
    .flatMap(f => [...code(f).matchAll(/(?<![\w-])ck-[a-z]+(?:--[a-z]+)?(?![\w$-])/g)].map(m => m[0])));
  // Names only: ck-dot and the like are the variables; a tool button is the plain one.
  ['ck-dot', 'ck-dx', 'ck-dy', 'ck-scale', 'ck-button--tool'].forEach(n => used.delete(n));
  [...used].filter(n => n !== 'ck-button-label').forEach(n => assert.ok(css.includes('.' + n), n));
});
