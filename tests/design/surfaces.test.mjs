// Spacing and surface token checks (Handbook H5.2b). No dependencies:
//   node --test tests/design/*.test.mjs
// Keeps styles/theme.css and styles/layout.css in step with the list in
// scripts/design/surfaces.js, and checks the values the site relies on.
// Computed styles before/after adoption are compared in the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const meta = require(path.join(SITE, 'scripts/design/surfaces.js'));
const read = f => readFileSync(path.join(SITE, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const THEME = read('styles/theme.css'), LAYOUT = read('styles/layout.css');

// Rules with their @media context: [{ media, selectors, decls }].
function rules(css) {
  const out = [];
  const walk = (text, media) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (depth && j < text.length) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@media')) walk(body, head.replace(/^@media\s*/, ''));
      else if (!head.startsWith('@')) {
        const decls = new Map();
        for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decls.set(d.slice(0, k).trim(), d.slice(k + 1).trim()); }
        out.push({ media, selectors: head.split(',').map(s => s.trim().replace(/\s+/g, ' ')), decls });
      }
      i = j;
    }
  };
  walk(css, null);
  return out;
}
const T = rules(THEME), L = rules(LAYOUT);
const decl = (set, sel, prop, media = null) => {
  const r = set.filter(x => x.media === media && x.selectors.includes(sel) && x.decls.has(prop));
  return r.length ? r[r.length - 1].decls.get(prop) : undefined;
};

test('the spacing scale is 4, 8, 12, 16, 20, 24, 32px', () => {
  const want = { '--space-1': '4px', '--space-2': '8px', '--space-3': '12px', '--space-4': '16px', '--space-5': '20px', '--space-6': '24px', '--space-8': '32px' };
  for (const [t, v] of Object.entries(want)) assert.equal(decl(T, ':root', t), v, t);
  assert.deepEqual(meta.spacing.map(s => s.token), Object.keys(want), 'documented in scale order');
});

test('radii: every documented radius is defined, with the existing values', () => {
  const want = { '--radius-sm': '6px', '--radius-item': '8px', '--radius-md': '10px', '--radius-card': '12px', '--radius-panel': '14px', '--radius-dialog': '16px', '--radius-pill': '999px' };
  for (const [t, v] of Object.entries(want)) assert.equal(decl(T, ':root', t), v, t);
  assert.deepEqual(meta.radii.map(r => r.token).sort(), Object.keys(want).sort());
  const defined = new Set([...THEME.matchAll(/(--radius-[a-z]+)\s*:/g)].map(m => m[1]));
  assert.deepEqual([...defined].sort(), Object.keys(want).sort(), 'no undocumented radius tokens');
});

test('elevation: dark and light values on the page and in previews', () => {
  const dark = { '--shadow-raised': '0 6px 20px rgb(0 0 0 / 0.22)', '--shadow-popover': '0 12px 32px rgb(0 0 0 / 0.35)', '--shadow-dialog': '0 18px 48px rgb(0 0 0 / 0.45)' };
  const light = { '--shadow-raised': '0 4px 14px rgb(0 0 0 / 0.08)', '--shadow-popover': '0 10px 28px rgb(0 0 0 / 0.12)', '--shadow-dialog': '0 14px 40px rgb(0 0 0 / 0.16)' };
  for (const sel of [':root', '[data-theme-preview]']) for (const [t, v] of Object.entries(dark)) assert.equal(decl(T, sel, t), v, `${sel} ${t}`);
  for (const sel of [':root[data-mode="light"]', '[data-theme-preview][data-mode="light"]']) for (const [t, v] of Object.entries(light)) assert.equal(decl(T, sel, t), v, `${sel} ${t}`);
  assert.deepEqual(meta.shadows.map(s => s.token).sort(), Object.keys(dark).sort());
});

test('page frame: two inset families and the 16px gutter, with narrow-screen values', () => {
  assert.equal(decl(L, ':root', '--page-inset-block'), 'var(--space-8)');
  assert.equal(decl(L, ':root', '--page-inset-inline'), 'var(--space-8)');
  assert.equal(decl(L, ':root', '--page-inset-widgets'), 'var(--space-6)');
  assert.equal(decl(L, ':root', '--layout-gutter'), 'var(--space-4)');
  const narrow = '(max-width: 900px)';
  assert.equal(decl(L, ':root', '--page-inset-block', narrow), 'var(--space-6)');
  assert.equal(decl(L, ':root', '--page-inset-inline', narrow), 'var(--space-4)');
  assert.equal(decl(L, ':root', '--page-inset-widgets', narrow), 'var(--space-4)');
  assert.notEqual(decl(L, ':root', '--page-inset-widgets'), decl(L, ':root', '--page-inset-inline'), 'widget pages keep their own, tighter inset');
  assert.deepEqual(meta.frame.map(f => f.token).sort(), ['--layout-gutter', '--pa-sidebar-panel-h', '--page-inset-block', '--page-inset-inline', '--page-inset-widgets']);
});

test('the frame tokens are used by the page frame and the widget pages', () => {
  assert.equal(decl(L, '.pa-main', 'padding'), 'var(--page-inset-block) var(--page-inset-inline)');
  const home = rules(read('styles/home.css')), hb = rules(read('styles/handbook.css'));
  assert.equal(decl(home, '.pa-main.home-page', 'padding'), 'var(--page-inset-widgets)');
  assert.equal(decl(hb, '.pa-main.hb-root', 'padding'), 'var(--page-inset-widgets)');
  assert.equal(decl(home, '.home', 'gap'), 'var(--layout-gutter)');
  // The homepage's widgets are placed by the Atlas Grid, whose gap is the gutter.
  assert.ok(read('styles/grid.css').includes('--atlas-gap: var(--layout-gutter'));
  // No stale fixed insets left in the narrow-screen rules.
  assert.equal(decl(L, '.pa-main', 'padding', '(max-width: 900px)'), undefined);
  assert.equal(decl(home, '.pa-main.home-page', 'padding', '(max-width: 900px)'), undefined);
  assert.equal(decl(hb, '.pa-main.hb-root', 'padding', '(max-width: 900px)'), undefined);
});

test('surface recipes name defined tokens; the list holds no values', () => {
  const tokens = new Set([...meta.radii, ...meta.shadows].map(x => x.token));
  for (const s of meta.surfaces) {
    assert.ok(tokens.has(s.radius), `${s.id}: ${s.radius}`);
    if (s.shadow) assert.ok(tokens.has(s.shadow), `${s.id}: ${s.shadow}`);
    assert.ok(s.name && s.use && s.where);
  }
  const src = readFileSync(path.join(SITE, 'scripts/design/surfaces.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\b\d+px\s*['",;]|rgb\(/.test(src.slice(src.indexOf('const spacing'), src.indexOf('const notYet'))), 'no values in the token lists');
});
