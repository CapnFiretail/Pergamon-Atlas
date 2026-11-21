// Typography registry checks (Handbook H1). No dependencies:
//   node --test tests/design
// Keeps the registry, the generated stylesheet and the site's CSS in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from '../../tools/build-typography.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'PergamonAtlas.V1');
const require = createRequire(import.meta.url);
const typo = require(path.join(SITE, 'scripts/design/typography.js'));
const { registry } = typo;

// ── A small CSS reader: rules with their at-rule context ─────────────────
// Files or the inline <style> blocks of HTML pages. Comments are dropped.
function rules(file) {
  const text = readFileSync(path.join(SITE, file), 'utf8');
  const css = file.endsWith('.html') ? (text.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).map(s => s.replace(/<\/?style[^>]*>/g, '')).join('\n') : text;
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [], stack = [];
  let buf = '';
  for (const ch of clean) {
    if (ch === '{') { stack.push(buf.trim().replace(/\s+/g, ' ')); buf = ''; }
    else if (ch === '}') {
      const head = stack.pop();
      if (head !== undefined && !head.startsWith('@') && buf.trim()) {
        const decls = {};
        for (const d of buf.split(';')) {
          const i = d.indexOf(':');
          if (i > 0) decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
        }
        out.push({ at: norm(stack.filter(s => s.startsWith('@')).join(' ')), selector: head, decls });
      }
      buf = '';
    } else buf += ch;
  }
  return out;
}
const norm = s => String(s).replace(/\s+/g, ' ').replace(/\s*([(),:/])\s*/g, '$1').trim().toLowerCase();

// Declared typography of one rule, in registry terms (font shorthand expanded).
function declared(d) {
  const t = {};
  if (d.font) {
    const m = d.font.match(/^(?:(\d{3}|bold|normal)\s+)?((?:clamp\([^)]*\)|[\d.]+px))(?:\s*\/\s*([\d.]+|normal))?\s+(.+)$/);
    assert.ok(m, `can't read font shorthand "${d.font}"`);
    if (m[1]) t.weight = m[1] === 'bold' ? 700 : Number(m[1]);
    t.size = m[2];
    t.leading = m[3] || 'normal';            // the shorthand resets line-height
    t.family = m[4];
  }
  if (d['font-family']) t.family = d['font-family'];
  if (d['font-size']) t.size = d['font-size'];
  if (d['font-weight']) t.weight = Number(d['font-weight']);
  if (d['line-height']) t.leading = d['line-height'];
  if (d['letter-spacing']) t.tracking = d['letter-spacing'] === '0' ? 'normal' : d['letter-spacing'];
  if (d['text-transform']) t.transform = d['text-transform'];
  return t;
}
const familyMatches = (value, familyId) => {
  const f = registry.families[familyId];
  return norm(value) === norm(`var(${f.token})`) || norm(value) === norm(f.stack.join(', '));
};
// px values with a leading zero dropped in CSS (.5px) are equal.
const same = (a, b) => norm(String(a)).replace(/(^|[^\d])\./g, '$10.') === norm(String(b)).replace(/(^|[^\d])\./g, '$10.');

test('registry is valid', () => {
  assert.deepEqual(typo.validate(registry), []);
});

test('the validator rejects bad drafts (for a future editor)', () => {
  const draft = JSON.parse(JSON.stringify(registry));
  draft.roles[0].weight = 300;                                  // not loaded for the display font
  draft.roles[1].size = '1.2rem';
  draft.roles.push(Object.assign({}, draft.roles[2]));          // duplicate id
  draft.roles.push({ id: 'orphan', name: 'Orphan', use: 'x', kind: 'variant', of: 'missing', status: 'active', family: 'ui', size: '12px', weight: 400, leading: '1', tracking: 'normal', transform: 'none' });
  const errors = typo.validate(draft).join('\n');
  assert.match(errors, /page-title: weight 300 is not loaded/);
  assert.match(errors, /section-title: size "1\.2rem"/);
  assert.match(errors, /duplicate id/);
  assert.match(errors, /variant of unknown role "missing"/);
});

test('styles/typography.css is generated from the registry and up to date', () => {
  const onDisk = readFileSync(path.join(SITE, 'styles/typography.css'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(onDisk, build(), 'run: node tools/build-typography.mjs');
});

test('every role has a class and tokens for each property', () => {
  const css = build();
  for (const r of registry.roles) {
    assert.ok(css.includes(`.pa-type-${r.id} {`), `class for ${r.id}`);
    for (const p of typo.PROPS) if (typo.value(r, p) !== 'inherit') assert.ok(css.includes(`${typo.token(r.id, p)}: `), `${r.id} ${p} token`);
  }
});

test('font families owned by theme.css match the registry', () => {
  const root = rules('styles/theme.css').filter(r => r.selector === ':root' && !r.at);
  const defined = Object.assign({}, ...root.map(r => r.decls));
  for (const [id, f] of Object.entries(registry.families)) {
    if (f.owner !== 'styles/theme.css') continue;
    assert.ok(defined[f.token], `${f.token} defined in theme.css`);
    assert.equal(norm(defined[f.token]), norm(f.stack.join(', ')), `${id} stack`);
  }
});

test('display weights match the Google Fonts request on every page', () => {
  const html = readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const m = html.match(/family=Manrope:wght@([\d;]+)&family=Roboto\+Slab:wght@([\d;]+)/);
  assert.ok(m, 'font request found');
  assert.deepEqual(m[1].split(';').map(Number), registry.families.ui.weights);
  assert.deepEqual(m[2].split(';').map(Number), registry.families.display.weights);
});

test('adoption claims match the CSS they point at', () => {
  const PROPS = ['family', 'size', 'weight', 'leading', 'tracking', 'transform'];
  const problems = [];
  for (const r of registry.roles) {
    for (const a of r.adoption || []) {
      const found = rules(a.file).filter(x => !x.at && norm(x.selector) === norm(a.selector));
      if (!found.length) { problems.push(`${r.id}: no rule "${a.selector}" in ${a.file}`); continue; }
      const d = Object.assign({}, ...found.map(x => declared(x.decls)));
      // Expected = the role's values, overridden by `current` for pending/legacy entries.
      const expect = Object.assign({}, Object.fromEntries(PROPS.map(p => [p, r[p]])), a.current || {});
      for (const p of PROPS) {
        if (!(p in d)) continue;                                   // inherited: not declared here
        const ok = p === 'family' ? familyMatches(d.family, r.family) : same(d[p], expect[p]);
        if (!ok) problems.push(`${r.id}: ${a.file} ${a.selector} ${p} is "${d[p]}", registry says "${expect[p]}"`);
      }
      if (a.status === 'equivalent' && a.current) problems.push(`${r.id}: ${a.selector} is "equivalent" but records current values`);
      if (a.status === 'pending' && !a.current) problems.push(`${r.id}: ${a.selector} is "pending" without current values`);
      // Breakpoint and container steps of equivalent entries exist in the same file.
      if (a.status === 'equivalent' || (a.status === 'legacy' && !a.current)) {
        for (const s of r.responsive || []) {
          if (s.type === 'note') continue;
          const at = norm(s.type === 'media' ? `@media ${s.query}` : `@container ${s.container} ${s.query}`);
          const step = rules(a.file).filter(x => x.at === at && norm(x.selector) === norm(a.selector)).map(x => declared(x.decls).size).filter(Boolean);
          if (!step.some(v => same(v, s.size))) problems.push(`${r.id}: ${a.file} has no ${at} step of ${s.size} for ${a.selector}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('no role is adopted yet (H1 changes no existing page)', () => {
  // When a selector starts using the tokens, mark it 'adopted' and relax this.
  const adopted = registry.roles.flatMap(r => (r.adoption || []).filter(a => a.status === 'adopted'));
  assert.equal(adopted.length, 0);
});
