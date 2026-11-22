// Colour role checks (Handbook H5.2a). No dependencies:
//   node --test tests/design
// Keeps styles/theme.css, the role list in scripts/design/colors.js and the
// palette list in scripts/theme.js in step, and checks that every palette ×
// mode, on the page and inside a [data-theme-preview] element, defines every
// role. Contrast is measured in the browser (the Handbook's Colors page).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const colors = require(path.join(SITE, 'scripts/design/colors.js'));
const themeCss = readFileSync(path.join(SITE, 'styles/theme.css'), 'utf8');
const themeJs = readFileSync(path.join(SITE, 'scripts/theme.js'), 'utf8');

const PALETTES = [...themeJs.matchAll(/\{\s*id:\s*'([a-z]+)',\s*name:/g)].map(m => m[1]);
const MODES = ['dark', 'light'];
const BASE = colors.roles.filter(r => r.group === 'base');
const DERIVED = colors.roles.filter(r => r.group === 'derived');

// Top-level rules of theme.css: [{ selectors: [...], decls: Map }].
function rules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = new Map();
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    out.push({ selectors: m[1].split(',').map(s => s.trim().replace(/\s+/g, ' ')), decls });
  }
  return out;
}
const RULES = rules(themeCss);
const declared = sel => RULES.filter(r => r.selectors.includes(sel)).reduce((set, r) => { r.decls.forEach((_, k) => set.add(k)); return set; }, new Set());

test('theme.js lists the four palettes', () => {
  assert.deepEqual(PALETTES, ['obsidian', 'sapphire', 'emerald', 'copper']);
});

test('the role list is well formed', () => {
  const ids = colors.roles.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'role ids are unique');
  for (const r of colors.roles) {
    assert.equal(r.token, '--color-' + r.id, `${r.id}: token follows the id`);
    assert.ok(['base', 'derived'].includes(r.group), `${r.id}: group`);
    assert.ok(r.name && r.use, `${r.id}: name and purpose`);
    if (r.group === 'derived') assert.ok(r.from, `${r.id}: says what it is derived from`);
  }
  assert.equal(BASE.length, 6, 'six base colours');
  for (const p of colors.contrast) {
    for (const k of ['fg', 'bg', 'over'].filter(k => p[k])) assert.ok(colors.role(p[k]), `contrast pair names a known role: ${p[k]}`);
    assert.ok(['text', 'ui'].includes(p.kind));
  }
  assert.ok(colors.exceptions.length >= 2);
  assert.ok(colors.exceptions.some(x => /Featured/.test(x.where)) && colors.exceptions.some(x => /Spotlight edge/.test(x.where)), 'artwork and CMS edge colour are documented');
});

test('every palette and mode defines the six base colours, on the page and in previews', () => {
  for (const p of PALETTES) for (const m of MODES) {
    for (const sel of [`:root[data-palette="${p}"][data-mode="${m}"]`, `[data-theme-preview="${p}"][data-mode="${m}"]`]) {
      const set = declared(sel);
      for (const r of BASE) assert.ok(set.has(r.token), `${sel} defines ${r.token}`);
    }
  }
});

test('the derived roles are declared on the page and on every preview', () => {
  const page = declared(':root'), preview = declared('[data-theme-preview]');
  for (const r of DERIVED) {
    assert.ok(page.has(r.token), `:root defines ${r.token}`);
    assert.ok(preview.has(r.token), `[data-theme-preview] defines ${r.token}`);
  }
  // Light-mode overrides apply to previews in light mode too.
  const lightPage = declared(':root[data-mode="light"]'), lightPreview = declared('[data-theme-preview][data-mode="light"]');
  assert.ok(lightPage.size > 0);
  assert.deepEqual([...lightPreview].sort(), [...lightPage].sort(), 'light-mode overrides are the same for page and preview');
});

test('every --color-* token theme.css defines is documented (aliases aside)', () => {
  const defined = new Set([...themeCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--color-[a-z-]+)\s*:/g)].map(m => m[1]));
  const documented = new Set(colors.roles.map(r => r.token));
  for (const t of defined) assert.ok(documented.has(t), `${t} is in scripts/design/colors.js`);
  for (const t of documented) assert.ok(defined.has(t), `${t} is defined in theme.css`);
});

test('colour values live only in theme.css, not in the role list', () => {
  const src = readFileSync(path.join(SITE, 'scripts/design/colors.js'), 'utf8');
  const code = src.replace(/^\s*\/\/.*$/gm, '');
  const rolesBlock = code.slice(code.indexOf('const roles'), code.indexOf('const contrast'));
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(rolesBlock), 'no hex colours in the roles');
});

// ── Contrast of the base colours (the derived pairs are measured in the
//    browser on the Handbook's Colors page) ─────────────────────────────
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const base = (p, m) => Object.fromEntries(RULES.filter(r => r.selectors.includes(`:root[data-palette="${p}"][data-mode="${m}"]`)).flatMap(r => [...r.decls]));

test('text on the page and in panels meets 4.5:1 in every palette and mode', () => {
  for (const p of PALETTES) for (const m of MODES) {
    const v = base(p, m);
    for (const fg of ['--color-text-primary', '--color-text-secondary']) for (const bg of ['--color-background', '--color-surface']) {
      const r = ratio(hex(v[fg]), hex(v[bg]));
      assert.ok(r >= 4.5, `${p}/${m}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  }
});

test('Obsidian light: labels on the gold use a dark ink, on the page and in previews', () => {
  for (const sel of [':root[data-palette="obsidian"][data-mode="light"]', '[data-theme-preview="obsidian"][data-mode="light"]']) {
    const rule = RULES.find(r => r.selectors.includes(sel) && r.decls.has('--color-on-accent'));
    assert.ok(rule, `${sel} overrides --color-on-accent`);
    assert.ok(rule.decls.has('--color-accent-hover'), `${sel} overrides --color-accent-hover`);
    const v = base('obsidian', 'light');
    const r = ratio(hex(rule.decls.get('--color-on-accent')), hex(v['--color-accent']));
    assert.ok(r >= 4.5, `ink on gold is ${r.toFixed(2)}:1`);
  }
  // The override must follow the general light-mode rule so it wins in previews.
  const at = sel => RULES.findLastIndex(r => r.selectors.includes(sel));
  assert.ok(at('[data-theme-preview="obsidian"][data-mode="light"]') > at('[data-theme-preview][data-mode="light"]'));
});
