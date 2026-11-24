// What visitors see of the homepage, for a before / after comparison of a change
// that must not alter it. Needs the local development server.
//
//   node tests/site/snapshot.mjs take before.json      (on the old code)
//   node tests/site/snapshot.mjs take after.json       (on the new code)
//   node tests/site/snapshot.mjs compare before.json after.json
//
// For each published content (none, schema 1, schema 2 with added widgets,
// invalid, no answer), screen width, theme and sidebar state: the page's
// markup, every element's rectangle and text style, the requests for data, what
// the browser stores, and the picture. Script tags and `data-atlas-page` (which
// draw nothing) are left out of the markup.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'compare') {
  const x = JSON.parse(readFileSync(a, 'utf8')), y = JSON.parse(readFileSync(b, 'utf8'));
  let bad = 0;
  // (The class on <html> follows the first frames, not the page.)
  [x, y].forEach(v => Object.values(v).forEach(p => { p.root = p.root.replace(/ class="[^"]*"/, ''); }));
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    const d = x[k] && y[k] ? Object.keys(x[k]).filter(f => JSON.stringify(x[k][f]) !== JSON.stringify(y[k][f])) : ['missing'];
    if (!d.length) continue;
    bad++;
    console.log(k, 'differs:', d.join(', '));
    if (d.includes('boxes')) { const i = x[k].boxes.findIndex((v, n) => v !== y[k].boxes[n]); console.log('  ', x[k].boxes[i], '\n  ', y[k].boxes[i]); }
    if (d.includes('html')) { let i = 0; while (x[k].html[i] === y[k].html[i]) i++; console.log('  ', x[k].html.slice(Math.max(0, i - 80), i + 120), '\n  ', y[k].html.slice(Math.max(0, i - 80), i + 120)); }
    ['calls', 'errs', 'store'].forEach(f => { if (d.includes(f)) console.log('  ', JSON.stringify(x[k][f]), JSON.stringify(y[k][f])); });
  }
  console.log(bad ? `${bad} of ${Object.keys(x).length} differ` : `${Object.keys(x).length} views identical`);
  process.exit(bad ? 1 : 0);
}

const { chromium, context, open } = await import('./lib.mjs');
const M = n => `0000000${n}-0000-4000-8000-000000000000`;
const art = n => ({ source: { media: M(n) }, alt: '', focus: { x: 30, y: 70 }, scale: 1.2 });
const tile = (title, category, href, n) => ({ title, category, href, art: art(n) });
const components = {
  'home.featured': { title: 'Published Featured', cta: 'Play', href: '/games/chess-forge/', art: art(1), style: { rules: true } },
  'home.spotlight': { title: 'Published Spotlight', cta: 'Go', href: '/games/connect-four/', art: { source: { static: '/images/featured/connect-four.webp' }, fit: 'height', scale: 1.3, anchor: { x: 50, offset: -60, y: 50 }, base: '#030916' } },
  'home.carousel': { order: ['snake', 'pong', 'gone'] },
  'home.carousel.snake': tile('Snake', 'Arcade', '/games/snake/', 2),
  'home.carousel.pong': tile('Pong', 'Arcade', '/games/pong/', 3),
  'home.carousel.gone': tile('Not a live game', 'Classic', '/games/tic-tac-toe/', 3),
  'site.sidebar': { sections: [{ items: [{ id: 'home', label: 'Start', icon: 'home', href: '/', visible: true }, { id: 'games', label: 'All games', icon: 'games', href: '/games/', visible: true }] }] }
};
const regions = [
  { id: 'upper', frame: 'sidebar', rowHeight: 23.43, stack: ['navigation', 'featured', 'spotlight'], widgets: [
    { id: 'featured', type: 'feature-hero', col: 1, row: 1, cols: 14, rows: 8 }, { id: 'spotlight', type: 'feature-spotlight', col: 1, row: 9, cols: 14, rows: 5 },
    { id: 'navigation', type: 'atlas-navigation', col: 15, row: 1, cols: 6, rows: 13 }] },
  { id: 'lower', rowHeight: 23.43, widgets: [
    { id: 'carousel', type: 'carousel', col: 1, row: 1, cols: 20, rows: 11 }, { id: 'carousel-2', type: 'carousel', col: 1, row: 12, cols: 10, rows: 12 },
    { id: 'featured-2', type: 'feature-hero', col: 11, row: 12, cols: 10, rows: 10 }] }
];
const two = Object.assign({}, components, { 'home.carousel-2': { order: ['a'] }, 'home.carousel-2.a': tile('Blackjack', 'Card', '/games/blackjack/', 2), 'home.featured-2': { title: 'A second featured card with a long title to fit', cta: 'Open', href: '/games/' } });
const payload = content => ({ page: 'home', version: 7, schema: 1, published_at: '2026-11-01T00:00:00Z', content, media: Object.fromEntries([1, 2, 3].map(n => [M(n), { path: `media/${String(n).repeat(64)}.webp`, width: 960, height: 576 }])) });
const CONTENT = {
  none: () => ({ data: null }),
  schema1: () => ({ data: payload({ schema: 1, components }) }),
  schema2: () => ({ data: payload({ schema: 2, regions, components: two }) }),
  invalid: () => ({ data: payload({ schema: 2, regions: [], components }) }),
  down: () => null
};
const SIZES = [1920, 1440, 1280, 1000, 900, 768, 390];
const out = {};
const browser = await chromium.launch();
async function take(name, o, role) {
  const ctx = await context(browser, o);
  const p = await open(ctx, '/', role || 'guest', 1500);
  if (o.again) { await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900); }        // from this browser's cached copy
  await p.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 150)); window.scrollTo(0, 0); await Promise.all([...document.images].map(i => Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 1000))]))); });
  const r = await p.evaluate(() => {
    const boxes = [...document.querySelectorAll('.pa-page *')].filter(n => !/^(SCRIPT|BR|PATH|RECT|CIRCLE)$/i.test(n.tagName)).map(n => {
      const b = n.getBoundingClientRect(), s = getComputedStyle(n);
      return `${n.tagName}.${n.getAttribute('class') || ''} ${[b.x, b.y, b.width, b.height].map(v => Math.round(v * 100) / 100)} ${s.color} ${s.backgroundColor} ${s.fontSize} ${s.fontWeight} ${s.display} ${s.opacity}`;
    });
    const copy = document.querySelector('.pa-page').cloneNode(true);
    copy.querySelectorAll('script').forEach(s => s.remove());
    copy.querySelectorAll('[data-atlas-page]').forEach(n => n.removeAttribute('data-atlas-page'));
    return { boxes, html: copy.innerHTML.replace(/\s+/g, ' '), title: document.title, root: document.documentElement.outerHTML.match(/<html[^>]*>/)[0], store: Object.keys(localStorage).sort() };
  });
  r.shot = createHash('sha256').update(await p.screenshot({ fullPage: true })).digest('hex');
  r.calls = ctx.calls; r.errs = ctx.errs;
  out[name] = r;
  await ctx.close();
}
for (const [c, answer] of Object.entries(CONTENT)) for (const w of SIZES) await take(`${c} ${w}`, { size: [w, 900], answer });
for (const w of [1440, 390]) {
  await take(`light ${w}`, { size: [w, 900], answer: CONTENT.schema1, storage: { 'pa-appearance': '{"palette":"obsidian","mode":"light"}' }, theme: 'light' });
  await take(`expanded ${w}`, { size: [w, 900], answer: CONTENT.schema2, storage: { paSidebarCollapsed: '0' } });
  await take(`cached ${w}`, { size: [w, 900], answer: CONTENT.schema2, again: true });
  await take(`member ${w}`, { size: [w, 900], answer: CONTENT.schema1 }, 'user');
}
await browser.close();
writeFileSync(a, JSON.stringify(out));
console.log(Object.keys(out).length, 'views;', Object.values(out).filter(v => v.errs.length).length, 'with errors');
