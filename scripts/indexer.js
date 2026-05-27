#!/usr/bin/env node

const fs  = require('fs');
const path = require('path');
const PA  = require('../data/pergamon-address');

const ROOT    = path.resolve(__dirname, '../');
const SECTORS = {
  tools: { dir: path.join(ROOT, 'tools'), chamber: 'TL' },
  games: { dir: path.join(ROOT, 'games'), chamber: 'GM' }
};

// Individual pages indexed as PG (Page) chamber — not directory-scanned
const PAGES = [
  { file: path.join(ROOT, 'index.html'),                         pagePath: '/',                  name: 'Pergamon Atlas' },
  { file: path.join(ROOT, 'atlas-explorer', 'index.html'),       pagePath: '/atlas-explorer',    name: 'Atlas Explorer' },
  { file: path.join(ROOT, 'search', 'index.html'),               pagePath: '/search',            name: 'Search'         },
  { file: path.join(ROOT, 'help', 'index.html'),        pagePath: '/help',        name: 'Help'           },
  { file: path.join(ROOT, 'suggestions', 'index.html'), pagePath: '/suggestions', name: 'Suggestions'    },
  { file: path.join(ROOT, 'account', 'index.html'),     pagePath: '/account',     name: 'Account'        },
  { file: path.join(ROOT, 'updates', 'index.html'),     pagePath: '/updates',     name: 'Update Log'     },
  { file: path.join(ROOT, 'archives', 'index.html'),             pagePath: '/archives',                name: 'Archives'          },
  { file: path.join(ROOT, 'archives', 'chess-forge-v1',        'index.html'), pagePath: '/archives/chess-forge-v1',        name: 'Chess Forge (v1)'        },
  { file: path.join(ROOT, 'archives', 'chess-forge-v2',        'index.html'), pagePath: '/archives/chess-forge-v2',        name: 'Chess Forge (v2)'        },
  { file: path.join(ROOT, 'archives', 'atlas-runner-v1',       'index.html'), pagePath: '/archives/atlas-runner-v1',       name: 'Atlas Runner (v1)'       },
  { file: path.join(ROOT, 'archives', 'tic-tac-toe-v1',        'index.html'), pagePath: '/archives/tic-tac-toe-v1',        name: 'Tic Tac Toe (v1)'        },
  { file: path.join(ROOT, 'archives', 'connect-four-v1',       'index.html'), pagePath: '/archives/connect-four-v1',       name: 'Connect Four (v1)'       },
  { file: path.join(ROOT, 'archives', 'battleship-v1',         'index.html'), pagePath: '/archives/battleship-v1',         name: 'Battleship (v1)'         },
  { file: path.join(ROOT, 'archives', 'blackjack-v1',          'index.html'), pagePath: '/archives/blackjack-v1',          name: 'Blackjack (v1)'          },
  { file: path.join(ROOT, 'archives', 'snake-v1',              'index.html'), pagePath: '/archives/snake-v1',              name: 'Snake (v1)'              },
  { file: path.join(ROOT, 'archives', 'breakout-v1',           'index.html'), pagePath: '/archives/breakout-v1',           name: 'Breakout (v1)'           },
  { file: path.join(ROOT, 'archives', 'pong-v1',               'index.html'), pagePath: '/archives/pong-v1',               name: 'Pong (v1)'               },
  { file: path.join(ROOT, 'archives', '2048-v1',               'index.html'), pagePath: '/archives/2048-v1',               name: '2048 (v1)'               },
  { file: path.join(ROOT, 'archives', 'color-match-v1',        'index.html'), pagePath: '/archives/color-match-v1',        name: 'Color Match (v1)'        },
  { file: path.join(ROOT, 'archives', 'flood-fill-v1',         'index.html'), pagePath: '/archives/flood-fill-v1',         name: 'Flood Fill (v1)'         },
  { file: path.join(ROOT, 'archives', 'hangman-v1',            'index.html'), pagePath: '/archives/hangman-v1',            name: 'Hangman (v1)'            },
  { file: path.join(ROOT, 'archives', 'higher-or-lower-v1',    'index.html'), pagePath: '/archives/higher-or-lower-v1',    name: 'Higher or Lower (v1)'    },
  { file: path.join(ROOT, 'archives', 'lights-out-v1',         'index.html'), pagePath: '/archives/lights-out-v1',         name: 'Lights Out (v1)'         },
  { file: path.join(ROOT, 'archives', 'math-blitz-v1',         'index.html'), pagePath: '/archives/math-blitz-v1',         name: 'Math Blitz (v1)'         },
  { file: path.join(ROOT, 'archives', 'maze-v1',               'index.html'), pagePath: '/archives/maze-v1',               name: 'Maze (v1)'               },
  { file: path.join(ROOT, 'archives', 'memory-match-v1',       'index.html'), pagePath: '/archives/memory-match-v1',       name: 'Memory Match (v1)'       },
  { file: path.join(ROOT, 'archives', 'minesweeper-v1',        'index.html'), pagePath: '/archives/minesweeper-v1',        name: 'Minesweeper (v1)'        },
  { file: path.join(ROOT, 'archives', 'number-memory-v1',      'index.html'), pagePath: '/archives/number-memory-v1',      name: 'Number Memory (v1)'      },
  { file: path.join(ROOT, 'archives', 'reaction-time-v1',      'index.html'), pagePath: '/archives/reaction-time-v1',      name: 'Reaction Time (v1)'      },
  { file: path.join(ROOT, 'archives', 'rock-paper-scissors-v1','index.html'), pagePath: '/archives/rock-paper-scissors-v1',name: 'Rock Paper Scissors (v1)'},
  { file: path.join(ROOT, 'archives', 'simon-says-v1',         'index.html'), pagePath: '/archives/simon-says-v1',         name: 'Simon Says (v1)'         },
  { file: path.join(ROOT, 'archives', 'sliding-puzzle-v1',     'index.html'), pagePath: '/archives/sliding-puzzle-v1',     name: 'Sliding Puzzle (v1)'     },
  { file: path.join(ROOT, 'archives', 'stroop-test-v1',        'index.html'), pagePath: '/archives/stroop-test-v1',        name: 'Stroop Test (v1)'        },
  { file: path.join(ROOT, 'archives', 'sudoku-v1',             'index.html'), pagePath: '/archives/sudoku-v1',             name: 'Sudoku (v1)'             },
  { file: path.join(ROOT, 'archives', 'tetris-v1',             'index.html'), pagePath: '/archives/tetris-v1',             name: 'Tetris (v1)'             },
  { file: path.join(ROOT, 'archives', 'tower-of-hanoi-v1',     'index.html'), pagePath: '/archives/tower-of-hanoi-v1',     name: 'Tower of Hanoi (v1)'     },
  { file: path.join(ROOT, 'archives', 'trivia-v1',             'index.html'), pagePath: '/archives/trivia-v1',             name: 'Trivia Quiz (v1)'        },
  { file: path.join(ROOT, 'archives', 'type-speed-v1',         'index.html'), pagePath: '/archives/type-speed-v1',         name: 'Type Speed Test (v1)'    },
  { file: path.join(ROOT, 'archives', 'typing-practice-v1',    'index.html'), pagePath: '/archives/typing-practice-v1',    name: 'Typing Practice (v1)'    },
  { file: path.join(ROOT, 'archives', 'whack-a-mole-v1',       'index.html'), pagePath: '/archives/whack-a-mole-v1',       name: 'Whack-a-Mole (v1)'       },
  { file: path.join(ROOT, 'archives', 'word-scramble-v1',      'index.html'), pagePath: '/archives/word-scramble-v1',      name: 'Word Scramble (v1)'      },
  { file: path.join(ROOT, 'archives', 'wordle-v1',             'index.html'), pagePath: '/archives/wordle-v1',             name: 'Wordle (v1)'             },
];
const ENTRIES_OUT   = path.join(ROOT, 'data', 'entries.js');
const COLLISION_OUT = path.join(ROOT, 'data', 'collisions.json');

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
  '/operation/scripts/atlas.js',
  '/data/pergamon-address.js',
  '/data/entries.js',
  '/data/atlas-reference.js',
];

const OLD_SCRIPTS = [
  '/data/indexing/generator.js',
  '/data/indexing/auto-atlas.js',
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

function stripInlineFetches(html) {
  const marker = "fetch('/operation/snippets/header.html')";
  const marker2 = 'fetch("/operation/snippets/header.html")';
  if (!html.includes(marker) && !html.includes(marker2)) return html;

  let result = html;
  result = result.replace(/[ \t]*const pageName\s*=\s*[^;]+;\s*\n/g, '');
  result = result.replace(/[ \t]*const pageHeaderSuffix\s*=\s*[^;]+;\s*\n/g, '');
  result = result.replace(
    /\n?[ \t]*fetch\(['"]\/function\/snippets\/header\.html['"]\)[\s\S]*?getElementById\(['"]footer-placeholder['"]\)\.innerHTML\s*=\s*\w+;\s*\n?[ \t]*\}\);\s*\n?/,
    '\n'
  );
  return result;
}

function ensureLoadSnippets(html, name) {
  if (html.includes('loadSnippets(')) return html;
  const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return html.replace(
    '<script src="/operation/scripts/atlas.js"></script>',
    `<script src="/operation/scripts/atlas.js"></script>\n<script>loadSnippets('${safe}');</script>`
  );
}

// --- Utilities ---

const ACRONYMS = new Set(['gpa', 'bmi', 'qr', 'json', 'url', 'rng', 'rgb', 'dna']);

function toTitleCase(slug) {
  return slug.split('-').map(w =>
    ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

function estNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

function today() {
  const d = estNow();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function nowTime() {
  const d = estNow();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
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
    const pagePath     = `/${type}/${dir}`;
    const existing     = extractMeta(html) || {};

    const seed    = computeSeed(pagePath);
    const coords  = computeCoords(seed);
    const address = PA.coordsToAddress(coords.x, coords.y, coords.z);

    const meta = {
      name:      existing.name      || toTitleCase(dir),
      date:      existing.date      || today(),
      time:      existing.time      || nowTime(),
      chamber:   existing.archived  ? existing.chamber : sector.chamber,
      seed,
      code_seed: existing.code_seed || nowSeconds(),
      coords,
      address
    };
    if (existing.archived)    { meta.archived = true; meta.archive_date = existing.archive_date; }
    if (existing.description) meta.description = existing.description;
    if (existing.tags)        meta.tags        = existing.tags;

    let updated = injectOrUpdateMeta(html, meta);
    updated = stripOldScripts(updated);
    updated = stripInlineFetches(updated);
    updated = ensureAtlasScripts(updated);
    const sectionName = type === 'tools' ? 'Tools' : 'Games';
    updated = ensureLoadSnippets(updated, sectionName);
    fs.writeFileSync(htmlPath, updated);

    // Collision tracking
    const key = `${coords.z},${coords.y},${coords.x}`;
    if (!coordMap[key]) coordMap[key] = [];
    coordMap[key].push(pagePath);

    const entryType = existing.archived ? 'archived' : type;
    allEntries.push({ type: entryType, ...meta, path: pagePath, code_seed: meta.code_seed, time: meta.time });
  }
}

// --- Index individual pages ---

for (const page of PAGES) {
  if (!fs.existsSync(page.file)) continue;

  const html     = fs.readFileSync(page.file, 'utf-8');
  const existing = extractMeta(html) || {};

  const seed    = computeSeed(page.pagePath);
  const coords  = computeCoords(seed);
  const address = PA.coordsToAddress(coords.x, coords.y, coords.z);

  const meta = {
    name:      page.name,
    date:      existing.date      || today(),
    time:      existing.time      || nowTime(),
    chamber:   existing.archived  ? existing.chamber : 'PG',
    seed,
    code_seed: existing.code_seed || nowSeconds(),
    coords,
    address
  };
  if (existing.archived) { meta.archived = true; meta.archive_date = existing.archive_date; }

  let updated = injectOrUpdateMeta(html, meta);
  updated = stripOldScripts(updated);
  updated = stripInlineFetches(updated);
  updated = ensureAtlasScripts(updated);
  updated = ensureLoadSnippets(updated, meta.name);
  fs.writeFileSync(page.file, updated);

  const key = `${coords.z},${coords.y},${coords.x}`;
  if (!coordMap[key]) coordMap[key] = [];
  coordMap[key].push(page.pagePath);

  const pageEntryType = existing.archived ? 'archived' : 'pages';
  allEntries.push({ type: pageEntryType, ...meta, path: page.pagePath, code_seed: meta.code_seed, time: meta.time });
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
  console.warn(`[WARN] ${collisions.length} collision(s) detected → data/collisions.json`);
} else {
  if (fs.existsSync(COLLISION_OUT)) fs.unlinkSync(COLLISION_OUT);
  console.log('[OK] No coordinate collisions');
}

// --- Write entries.js ---

const tools    = allEntries.filter(e => e.type === 'tools');
const games    = allEntries.filter(e => e.type === 'games');
const pages    = allEntries.filter(e => e.type === 'pages');
const archived = allEntries.filter(e => e.type === 'archived');

function formatEntry(e) {
  let s = `    { path: "${e.path}", name: "${e.name}", date: "${e.date}", time: "${e.time || ''}", chamber: "${e.chamber}", seed: ${e.seed}, code_seed: ${e.code_seed || 0}, address: "${e.address}", coords: { x: ${e.coords.x}, y: ${e.coords.y}, z: ${e.coords.z} }`;
  if (e.archived)    s += `, archived: true, archive_date: "${e.archive_date || ''}"`;
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
  ],

  pages: [
${pages.map(formatEntry).join(',\n')}
  ],

  archived: [
${archived.map(formatEntry).join(',\n')}
  ]

};
`;

fs.writeFileSync(ENTRIES_OUT, output);
console.log(`[OK] Indexed ${tools.length} tools, ${games.length} games, ${pages.length} pages, ${archived.length} archived → entries.js`);
