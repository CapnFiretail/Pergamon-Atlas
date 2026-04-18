#!/usr/bin/env node

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '../../');
const SECTORS = {
  tools: path.join(ROOT, 'sectors/atlas/tools'),
  games: path.join(ROOT, 'sectors/atlas/games')
};
const OUTPUT = path.join(__dirname, 'entries.js');

// Acronyms that should stay fully uppercase
const ACRONYMS = new Set(['gpa', 'bmi', 'qr', 'json', 'url', 'rng', 'rgb', 'dna']);

function toTitleCase(slug) {
  return slug
    .split('-')
    .map(w => ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractMeta(html) {
  const match = html.match(/<script[^>]+id="atlas-meta"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function indexSector(sectorPath, type) {
  if (!fs.existsSync(sectorPath)) return [];

  const entries = [];
  const dirs = fs.readdirSync(sectorPath)
    .filter(d => fs.statSync(path.join(sectorPath, d)).isDirectory())
    .sort();

  for (const dir of dirs) {
    const htmlPath = path.join(sectorPath, dir, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, 'utf-8');
    const meta = extractMeta(html);

    const entry = {
      path: `/sectors/atlas/${type}/${dir}`,
      name: meta?.name || toTitleCase(dir)
    };
    if (meta?.description) entry.description = meta.description;
    if (meta?.tags)        entry.tags        = meta.tags;

    entries.push(entry);
  }

  return entries;
}

function formatEntry(e) {
  let line = `    { path: "${e.path}", name: "${e.name}"`;
  if (e.description) line += `, description: "${e.description}"`;
  if (e.tags)        line += `, tags: ${JSON.stringify(e.tags)}`;
  line += ' }';
  return line;
}

const tools = indexSector(SECTORS.tools, 'tools');
const games = indexSector(SECTORS.games, 'games');

const output =
`window.atlasEntries = {

  tools: [
${tools.map(formatEntry).join(',\n')}
  ],

  games: [
${games.map(formatEntry).join(',\n')}
  ]

};
`;

fs.writeFileSync(OUTPUT, output);
console.log(`✓ Indexed ${tools.length} tools, ${games.length} games → entries.js`);
