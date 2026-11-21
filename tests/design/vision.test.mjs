// The Handbook's Vision page is generated from docs/design/ATLAS_VISION.md.
// These tests keep the two in step and make sure nothing is lost on the way.
//   node --test tests/design/vision.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, parse, SOURCE, OUT } from '../../tools/build-vision.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const md = readFileSync(path.join(ROOT, SOURCE), 'utf8');
const require = createRequire(import.meta.url);

test('generated vision-content.js is up to date with the Markdown', () => {
  const current = readFileSync(path.join(ROOT, OUT), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current, build(md), 'run node tools/build-vision.mjs');
});

test('the generated file loads as the same data in Node', () => {
  delete require.cache[path.join(ROOT, OUT)];
  assert.deepEqual(require(path.join(ROOT, OUT)), JSON.parse(JSON.stringify(parse(md))));
});

test('every ## heading becomes a section with a unique id', () => {
  const doc = parse(md);
  const headings = md.split(/\r?\n/).filter(l => /^## /.test(l)).map(l => l.slice(3).trim());
  assert.deepEqual(doc.sections.map(s => s.title), headings);
  const ids = doc.sections.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);
});

test('no words are lost or reordered', () => {
  // The Markdown's words, without markup, in order…
  const words = s => s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^\|?\s*:?-{3,}.*$/gm, '')
    .replace(/[*`]/g, '').replace(/[#>|]/g, ' ').replace(/^\s*(-|\d+\.)\s/gm, ' ').split(/\s+/).filter(Boolean);
  // …and the generated data's words, in reading order.
  const doc = parse(md);
  const text = parts => parts.map(p => (typeof p === 'string' ? p : p[1])).join('');
  const out = [doc.title];
  for (const [k, v] of doc.meta) out.push(k + ': ' + v);
  const blocks = bs => {
    for (const b of bs) {
      if (b.type === 'p' || b.type === 'quote' || b.type === 'h3' || b.type === 'h4') out.push(text(b.text));
      else if (b.type === 'ul' || b.type === 'ol') b.items.forEach(i => out.push(text(i)));
      else if (b.type === 'table') { out.push(b.head.map(text).join(' ')); b.rows.forEach(r => out.push(r.map(text).join(' '))); }
      else assert.fail('unknown block ' + b.type);
    }
  };
  blocks(doc.intro);
  for (const s of doc.sections) { out.push(s.title); blocks(s.blocks); }
  assert.deepEqual(words(out.join('\n')), words(md));
});

test('unsupported Markdown is rejected, not dropped', () => {
  assert.throws(() => parse('# T\n\n## A\n\n```\ncode\n```\n'), /not supported/);
  assert.throws(() => parse('# T\n\n## A\n\n- a\n  - b\n'), /nested lists/);
  assert.throws(() => parse('# T\n\n## A\n\nsome **unclosed text\n'), /unsupported inline/);
  assert.throws(() => parse('# T\n\n# U\n\n## A\n'), /one top-level heading/);
});
