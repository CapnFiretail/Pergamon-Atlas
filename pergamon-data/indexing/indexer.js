#!/usr/bin/env node

const fs  = require('fs');
const path = require('path');
const PA  = require('../pergamon-address');

const ROOT    = path.resolve(__dirname, '../../');
const SECTORS = {
  tools: { dir: path.join(ROOT, 'sectors/atlas/tools'), chamber: 'TL' },
  games: { dir: path.join(ROOT, 'sectors/atlas/games'), chamber: 'GM' }
};
const ENTRIES_OUT   = path.join(__dirname, 'entries.js');
const COLLISION_OUT = path.join(ROOT, 'pergamon-data', 'collisions.json');

// --- RNG ---

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashPath(str) {
  let h = 0x12345678;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

// Coordinate space: ±16,777,215 per axis (from pergamon-address.js)
const CMAX = PA.COORD_MAX; // 16,777,215

function inRange(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Seed is derived from path only — type/sector does not influence position.
// This prevents content type from clustering in coordinate space.
function computeSeed(pagePath) {
  return hashPath(pagePath) >>> 0;
}

function computeCoords(seed) {
  const xStream = mulberry32((seed ^ 0xDEAD) >>> 0);
  const yStream = mulberry32((seed ^ 0xBEEF) >>> 0);
  const zStream = mulberry32((seed ^ 0xCAFE) >>> 0);
  return {
    x: inRange(xStream, -CMAX, CMAX),
    y: inRange(yStream, -CMAX, CMAX),
    z: inRange(zStream, -CMAX, CMAX)
  };
}

// --- HTML metadata helpers ---

function extractMeta(html) {
  const match = html.match(/<script[^>]+id="atlas-meta"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function injectOrUpdateMeta(html, meta) {
  const json = JSON.stringify(meta, null, 2);
  const tag  = `<script type="application/json" id="atlas-meta">\n${json}\n</script>`;

  if (/<script[^>]+id="atlas-meta"/.test(html)) {
    return html.replace(/<script[^>]+id="atlas-meta"[^>]*>[\s\S]*?<\/script>/, tag);
  }
  return html.replace('<head>', '<head>\n  ' + tag);
}

const ATLAS_SCRIPTS = [
  '/pergamon-data/pergamon-address.js',
  '/pergamon-data/indexing/entries.js',
  '/pergamon-data/atlas-reference.js',
];

const OLD_SCRIPTS = [
  '/pergamon-data/indexing/generator.js',
  '/pergamon-data/indexing/auto-atlas.js',
];

function stripOldScripts(html) {
  let result = html;
  for (const src of OLD_SCRIPTS) {
    result = result.replace(new RegExp(`<script[^>]+src="${src.replace(/\//g, '\\/')}"[^>]*><\\/script>`, 'g'), '');
  }
  return result;
}

function ensureAtlasScripts(html) {
  let result = html;
  for (const src of ATLAS_SCRIPTS) {
    if (!result.includes(src)) {
      result = result.replace('</body>', `<script src="${src}"></script>\n</body>`);
    }
  }
  return result;
}

// --- Utilities ---

const ACRONYMS = new Set(['gpa', 'bmi', 'qr', 'json', 'url', 'rng', 'rgb', 'dna']);

function toTitleCase(slug) {
  return slug.split('-').map(w =>
    ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// --- Index ---

const allEntries = [];
const coordMap   = {};
const collisions = [];

for (const [type, sector] of Object.entries(SECTORS)) {
  if (!fs.existsSync(sector.dir)) continue;

  const dirs = fs.readdirSync(sector.dir)
    .filter(d => fs.statSync(path.join(sector.dir, d)).isDirectory())
    .sort();

  for (const dir of dirs) {
    const htmlPath = path.join(sector.dir, dir, 'index.html');
    if (!fs.existsSync(htmlPath)) continue;

    const html         = fs.readFileSync(htmlPath, 'utf-8');
    const pagePath     = `/sectors/atlas/${type}/${dir}`;
    const existing     = extractMeta(html) || {};

    const seed    = computeSeed(pagePath);
    const coords  = computeCoords(seed);
    const address = PA.coordsToAddress(coords.x, coords.y, coords.z);

    const meta = {
      name:      existing.name      || toTitleCase(dir),
      date:      existing.date      || today(),
      chamber:   sector.chamber,
      seed,
      code_seed: existing.code_seed || nowSeconds(),
      coords,
      address
    };
    if (existing.description) meta.description = existing.description;
    if (existing.tags)        meta.tags        = existing.tags;

    let updated = injectOrUpdateMeta(html, meta);
    updated = stripOldScripts(updated);
    updated = ensureAtlasScripts(updated);
    fs.writeFileSync(htmlPath, updated);

    // Collision tracking
    const key = `${coords.z},${coords.y},${coords.x}`;
    if (!coordMap[key]) coordMap[key] = [];
    coordMap[key].push(pagePath);

    allEntries.push({ type, ...meta, path: pagePath });
  }
}

// --- Collision report ---

for (const [key, pages] of Object.entries(coordMap)) {
  if (pages.length > 1) {
    const [z, y, x] = key.split(',').map(Number);
    collisions.push({ coords: { z, y, x }, pages });
  }
}

if (collisions.length > 0) {
  fs.writeFileSync(COLLISION_OUT, JSON.stringify(collisions, null, 2));
  console.warn(`⚠  ${collisions.length} collision(s) detected → pergamon-data/collisions.json`);
} else {
  if (fs.existsSync(COLLISION_OUT)) fs.unlinkSync(COLLISION_OUT);
  console.log('✓  No coordinate collisions');
}

// --- Write entries.js ---

const tools = allEntries.filter(e => e.type === 'tools');
const games = allEntries.filter(e => e.type === 'games');

function formatEntry(e) {
  let s = `    { path: "${e.path}", name: "${e.name}", date: "${e.date}", chamber: "${e.chamber}", seed: ${e.seed}, address: "${e.address}", coords: { x: ${e.coords.x}, y: ${e.coords.y}, z: ${e.coords.z} }`;
  if (e.description) s += `, description: "${e.description}"`;
  if (e.tags)        s += `, tags: ${JSON.stringify(e.tags)}`;
  s += ' }';
  return s;
}

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

fs.writeFileSync(ENTRIES_OUT, output);
console.log(`✓  Indexed ${tools.length} tools, ${games.length} games → entries.js`);
