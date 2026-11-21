// Generates PergamonAtlas.V1/scripts/handbook/vision-content.js from the
// Atlas vision (docs/design/ATLAS_VISION.md), so the Handbook's Vision &
// Architecture page shows the repository's Markdown without a second copy.
//
//   node tools/build-vision.mjs          write the generated file
//   node tools/build-vision.mjs --check  exit 1 if it is out of date
//
// The Markdown stays the source of truth; the output is committed (the Vercel
// build doesn't run this) and tests/design/vision.test.mjs fails when it is
// stale. It understands the small Markdown subset the vision uses (headings,
// paragraphs, lists, quotes, tables, `code`, **strong**, *em*, [links](url))
// and stops with an error on anything else rather than drop content. The
// output is data, not HTML: the page builds DOM nodes from it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'docs/design/ATLAS_VISION.md';
export const OUT = 'PergamonAtlas.V1/scripts/handbook/vision-content.js';

// Inline text → [string | ['strong'|'em'|'code', text] | ['a', text, href]]
export function inline(text, where) {
  const out = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(['code', m[1]]);
    else if (m[2] !== undefined) out.push(['strong', m[2]]);
    else if (m[3] !== undefined) out.push(['em', m[3]]);
    else out.push(['a', m[4], m[5]]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  for (const part of out) {
    if (typeof part === 'string' && /[*`]/.test(part)) throw new Error(`${where}: unsupported inline Markdown in "${part.trim()}"`);
  }
  return out;
}

function slug(title, used) {
  let s = title.toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
  let id = s, n = 2;
  while (used.has(id)) id = `${s}-${n++}`;
  used.add(id);
  return id;
}

const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function parse(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const used = new Set();
  const doc = { source: SOURCE, title: '', meta: [], intro: [], sections: [] };
  let blocks = doc.intro;
  let i = 0;
  const at = () => `${SOURCE}:${i + 1}`;
  const blank = l => l === undefined || l.trim() === '';
  const startsBlock = l => /^(#{1,6} |> ?|- |\d+\. |\|)/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { i++; continue; }
    let m;
    if ((m = /^# (.+)$/.exec(line))) {
      if (doc.title) throw new Error(`${at()}: only one top-level heading is allowed`);
      doc.title = m[1].trim();
      i++;
      while (i < lines.length && blank(lines[i])) i++;
      // **Key:** value lines straight after the title are the document's metadata.
      while (i < lines.length && (m = /^\*\*([^*]+):\*\*\s+(.+)$/.exec(lines[i]))) {
        doc.meta.push([m[1], m[2].trim()]);
        i++;
        while (i < lines.length && blank(lines[i])) i++;
      }
      continue;
    }
    if ((m = /^## (.+)$/.exec(line))) {
      const title = m[1].trim();
      const section = { id: slug(title, used), title, blocks: [] };
      doc.sections.push(section);
      blocks = section.blocks;
      i++; continue;
    }
    if ((m = /^(###|####) (.+)$/.exec(line))) {
      const title = m[2].trim();
      blocks.push({ type: m[1] === '###' ? 'h3' : 'h4', id: slug(title, used), text: inline(title, at()) });
      i++; continue;
    }
    if (/^#{5,} /.test(line)) throw new Error(`${at()}: headings deeper than #### are not supported`);
    if (/^> ?/.test(line)) {
      const text = [];
      while (i < lines.length && /^> ?/.test(lines[i])) { text.push(lines[i].replace(/^> ?/, '')); i++; }
      blocks.push({ type: 'quote', text: inline(text.join(' ').trim(), at()) });
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && !blank(lines[i])) {
        const l = lines[i];
        if (/^\s+\S/.test(l) && items.length && !/^\s+(- |\d+\. )/.test(l)) { items[items.length - 1] += ' ' + l.trim(); i++; continue; }
        if (/^\s+(- |\d+\. )/.test(l)) throw new Error(`${at()}: nested lists are not supported`);
        if (ordered ? !/^\d+\. /.test(l) : !/^- /.test(l)) break;
        items.push(l.replace(/^(- |\d+\. )/, '').trim());
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items: items.map(t => inline(t, at())) });
      continue;
    }
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      if (rows.length < 2 || !/^\|?\s*:?-{3,}/.test(rows[1])) throw new Error(`${at()}: a table needs a header row and a --- separator`);
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      for (const r of body) if (r.length !== head.length) throw new Error(`${at()}: table row has ${r.length} cells, header has ${head.length}`);
      blocks.push({ type: 'table', head: head.map(c => inline(c, at())), rows: body.map(r => r.map(c => inline(c, at()))) });
      continue;
    }
    if (/^(```|~~~|\s{4}\S|<)/.test(line)) throw new Error(`${at()}: code blocks and HTML are not supported`);
    const text = [];
    while (i < lines.length && !blank(lines[i]) && !(text.length && startsBlock(lines[i]))) { text.push(lines[i].trim()); i++; }
    blocks.push({ type: 'p', text: inline(text.join(' '), at()) });
  }
  if (!doc.title) throw new Error(`${SOURCE}: missing the # title`);
  if (!doc.sections.length) throw new Error(`${SOURCE}: no ## sections`);
  return doc;
}

export function build(md = readFileSync(path.join(ROOT, SOURCE), 'utf8')) {
  const data = JSON.stringify(parse(md), null, 1);
  return [
    `// GENERATED by tools/build-vision.mjs from ${SOURCE}.`,
    '// Do not edit: change the Markdown and run `node tools/build-vision.mjs`.',
    '(function (data) {',
    "  if (typeof module === 'object' && module.exports) module.exports = data;",
    "  if (typeof window !== 'undefined') (window.PergamonHandbook = window.PergamonHandbook || {}).vision = data;",
    `})(${data});`,
    ''
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const js = build();
  const out = path.join(ROOT, OUT);
  if (process.argv.includes('--check')) {
    let current = '';
    try { current = readFileSync(out, 'utf8').replace(/\r\n/g, '\n'); } catch (e) {}
    if (current !== js) { console.error(`${OUT} is out of date: run node tools/build-vision.mjs`); process.exit(1); }
    console.log(`${OUT} is up to date`);
  } else {
    writeFileSync(out, js);
    console.log('wrote', OUT);
  }
}
