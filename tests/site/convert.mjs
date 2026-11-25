// Converting the homepage's cards to the Game Library, end to end, with the real
// migrations in the emulated database; sign-in is a stand-in (lib.mjs). Needs the local
// development server.
//
//   node tests/site/convert.mjs [folder for pictures]
//
// A homepage like production's (every picture an upload, framed on the card) and a
// library with other pictures: what the review says, each choice, undo, saving and
// publishing in order; then the same views before and after (markup, every element's
// place and text style, the pictures, a screenshot): widths, modes, sidebar, cached,
// offline. Shared updates with the Games page, visibility, editing a converted card,
// history, legacy pages, roles, phone, keyboard.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, context, database, open } from './lib.mjs';

let bad = 0;
const shots = process.argv[2];
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
// (The database keeps keys in its own order.)
const sorted = v => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
const J = v => JSON.stringify(sorted(v));
const FEATURED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../PergamonAtlas.V1/images/featured');
const db = await database(), sql = (q, v) => db.env.db.query(q, v);
const boss = (await sql("select id from public.profiles where role = 'admin' limit 1")).rows[0].id;
// Eight uploads, each its own picture.
const FILES = ['chess-forge-960', 'connect-four-1100', 'battleship-card', 'breakout-card', 'pong-card', 'blackjack-card', 'connect-four-card', 'snake-card'];
const M = n => `0000000${n}-0000-4000-8000-000000000000`, hash = n => String(n).repeat(64);
for (let n = 1; n <= 8; n++) await sql('insert into public.site_media (id, draft_path, declared_mime, declared_bytes, public_path, mime, bytes, width, height, sha256, uploaded_by, prepared_at) values ($1, $2, $3, 1000, $4, $3, 1000, 960, 576, $5, $6, now())', [M(n), `uploads/${M(n)}.webp`, 'image/webp', `media/${hash(n)}.webp`, hash(n), boss]);
const up = (n, more) => Object.assign({ source: { media: M(n) }, alt: '' }, more);
const GAMES = ['battleship', 'breakout', 'pong', 'blackjack', 'connect-four', 'snake'], NAME = { battleship: 'Battleship', breakout: 'Breakout', pong: 'Pong', blackjack: 'Blackjack', 'connect-four': 'Connect Four', snake: 'Snake', 'chess-forge': 'Chess Forge', 'tic-tac-toe': 'Tic-Tac-Toe' }, CAT = { battleship: 'Strategy', breakout: 'Arcade', pong: 'Arcade', blackjack: 'Card', 'connect-four': 'Strategy', snake: 'Arcade', 'chess-forge': 'Strategy', 'tic-tac-toe': 'Classic' };
const HOME = { schema: 1, components: Object.assign({
  'home.featured': { title: 'Chess Forge', cta: 'Play Now', href: '/games/chess-forge/', style: { rules: true }, art: up(1, { focus: { x: 50, y: 50 }, scale: 1.3, focusNarrow: { x: 80, y: 10 } }) },
  'home.spotlight': { title: 'Connect Four', cta: 'Go', href: '/games/connect-four/', style: { rules: true }, art: up(2, { fit: 'height', base: '#030916', scale: 1.5, anchor: { x: 50, y: 50 } }) },
  'home.carousel': { order: GAMES },
  'site.sidebar': { sections: [{ items: [{ id: 'home', label: 'Start', icon: 'home', href: '/', visible: true }, { id: 'games', label: 'All games', icon: 'games', href: '/games/', visible: true }] }] }
}, Object.fromEntries(GAMES.map((g, i) => ['home.carousel.' + g, { title: NAME[g], category: CAT[g], href: `/games/${g}/`, art: up(i + 3, { focus: { x: 20 + i * 10, y: 50 }, ...(i === 2 ? { scale: 1.5 } : {}) }) }]))) };
const LIBRARY = { schema: 1, components: Object.assign({ 'library.games': { order: Object.keys(NAME) } }, Object.fromEntries(Object.keys(NAME).map(g => ['library.games.' + g, { name: NAME[g], category: CAT[g], destination: `/games/${g}/`, availability: g === 'tic-tac-toe' ? 'coming-soon' : 'available', art: { source: { static: `/images/featured/${g}-card.webp` }, alt: '' } }]))) };
const call = async (fn, a) => { const r = await db.answer('second', fn, a); if (r.error) throw new Error(fn + ' ' + r.error.message); return r.data; };
async function put(page, doc) { const d = await call('get_draft', { p_page: page }); const s = await call('save_draft', { p_page: page, p_content: doc, p_expected_draft_id: d.draft ? d.draft.id : null }); return call('publish', { p_page: page, p_draft_id: s.draft_id, p_expected_published_id: d.published ? d.published.id : null }); }
const row = async (page, status) => ((await sql('select id::int, content from public.site_content_versions where page = $1 and status = $2', [page, status])).rows[0] || null);
const lib = async fn => { const d = structuredClone((await row('library', 'published')).content); fn(d.components); await put('library', d); };
await put('home', HOME); await put('library', LIBRARY);
await put('games', { schema: 2, regions: [{ id: 'main', frame: 'sidebar', rowHeight: 23.43, widgets: [{ id: 'grid', type: 'card-grid', col: 1, row: 1, cols: 20, rows: 7 }] }], components: Object.assign({ 'games.grid': { order: GAMES } }, Object.fromEntries(GAMES.map(g => ['games.grid.' + g, { game: g }]))) });

let offline = false;
const answer = (role, fn, a) => (offline ? null : db.answer(role, fn, a));
const errs = c => c.errs.filter(e => !/googlesyndication/.test(e));
const browser = await chromium.launch();
async function ctx(o = {}) {
  const c = await context(browser, Object.assign({ size: [1440, 900], answer, storage: { paSidebarCollapsed: '0' } }, o));
  await c.route(/storage\/v1\/object\/public\/site-media\/media\//, r => { const n = +/media\/(\d)/.exec(r.request().url())[1]; r.fulfill({ contentType: 'image/webp', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(`${FEATURED}/${FILES[n - 1]}.webp`) }); });
  return c;
}

// ── What a visitor sees ──
const settle = p => p.evaluate(async () => { document.querySelectorAll('img').forEach(i => { i.loading = 'eager'; }); window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 200)); window.scrollTo(0, 0); await Promise.all([...document.images].map(i => Promise.race([i.decode().catch(() => {}), new Promise(r => setTimeout(r, 1500))]))); });
async function look(p) {
  await settle(p);
  const v = await p.evaluate(() => ({
    html: document.querySelector('[data-atlas-page]').innerHTML.replace(/pa-feature-\d+/g, 'pa-feature'),
    boxes: [...document.querySelectorAll('[data-atlas-page] *')].map(n => { const b = n.getBoundingClientRect(), s = getComputedStyle(n); return [n.tagName, n.className.baseVal === undefined ? n.className : '', b.x, b.y + scrollY, b.width, b.height, s.font, s.color, s.objectPosition, s.transform].join('|'); }),
    pictures: [...document.querySelectorAll('[data-atlas-page] img')].map(i => [i.getAttribute('src'), i.alt, i.naturalWidth])
  }));
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  v.shot = (await p.screenshot({ fullPage: true, animations: 'disabled' })).toString('base64');
  return v;
}
// Two screenshots, pixel by pixel → { n: how many differ, most: by how much (0–255) }.
async function pixels(a, b) {
  if (a === b) return { n: 0, most: 0 };
  const c = await browser.newContext(), q = await c.newPage();
  const r = await q.evaluate(async ([x, y]) => {
    const read = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const n = document.createElement('canvas'); n.width = i.width; n.height = i.height; const g = n.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height); };
    const [m, n] = [await read(x), await read(y)];
    if (m.width !== n.width || m.height !== n.height) return { n: -1, most: 255 };
    let count = 0, most = 0;
    for (let i = 0; i < m.data.length; i += 4) { const d = Math.max(...[0, 1, 2].map(k => Math.abs(m.data[i + k] - n.data[i + k]))); if (d) count++; if (d > most) most = d; }
    return { n: count, most };
  }, [a, b]);
  await c.close();
  return r;
}
const VIEWS = [];
for (const w of [1920, 1440, 1280, 1000, 900, 768, 390]) for (const collapsed of ['0', '1']) VIEWS.push([w, 'dark', collapsed, 'obsidian']);
for (const palette of ['obsidian', 'sapphire', 'emerald', 'copper']) VIEWS.push([1440, 'light', '0', palette]);
VIEWS.push([390, 'light', '1', 'obsidian']);
async function views() {
  const out = {};
  for (const [w, mode, collapsed, palette] of VIEWS) {
    const c = await ctx({ size: [w, 900], theme: mode, storage: { paSidebarCollapsed: collapsed, 'pa-appearance': J({ palette, mode }), ...(palette === 'obsidian' ? {} : { 'sb-aaaaaaaaaaaaaaaaaaaa-auth-token': '{}' }) } });
    const p = await open(c, '/', palette === 'obsidian' ? 'guest' : 'user', 1300);
    out[`${w} ${mode} ${collapsed === '1' ? 'collapsed' : 'expanded'} ${palette}`] = await look(p);
    if (errs(c).length) ok(false, `${w}: ${errs(c)}`);
    await c.close();
  }
  return out;
}
const before = await views();
ok(Object.values(before).every(v => v.pictures.length >= 8 && v.pictures.every(x => x[2] > 0)), `${VIEWS.length} views of the homepage as it is: every picture is there`);

// ── The review ──
let c, p;
const click = async (q, wait = 350) => { await p.locator(q).filter({ visible: true }).first().click(); await p.waitForTimeout(wait); };
const btn = (text, wait) => click(`.cms-publish:not([hidden]) button:text-is("${text}")`, wait);
const text = () => p.locator('.cms-publish-dialog:visible').innerText();
const panel = async on => { if (await p.locator('#cms-admin-panel').isVisible() !== on) await click('#cms-admin-button', 500); };
const shot = async n => { if (shots) await p.screenshot({ path: `${shots}/${n}.png` }); };
async function admin(url = '/', o = {}) { c = await ctx(o); p = await open(c, url, 'admin', 1900); await click('#cms-admin-button'); if (await p.locator('.cms-admin-switch').getAttribute('aria-checked') !== 'true') await click('.cms-admin-switch', 1200); }
const ENTRY = '#cms-admin-panel button:text-is("Use the Game Library…")';
await admin('/games/');
ok(await p.locator(ENTRY).count() === 0 || await p.locator(ENTRY).isHidden(), 'a page whose cards refer to games already has nothing to convert'); await c.close();
await admin();
ok(await p.locator(ENTRY).isVisible(), 'the homepage offers it; nothing happens by itself');
ok((await row('home', 'published')).content.schema === 1 && !(await row('home', 'draft')), 'nothing was written by looking');
await click(ENTRY, 1500); await shot('convert-review');
let t = await text();
ok(/8 cards differ from the Game Library/.test(t) && /Picture: this card’s → the game’s/.test(t), 'every card differs, in its picture; it is said');
const choice = id => p.locator(`.cms-convert-row[data-id="${id}"] select`);
ok(await choice('home.featured').inputValue() === 'picture' && await choice('home.carousel.snake').inputValue() === 'keep', 'suggested: give the game a picture it has no place taken for; never replace one');
ok(await p.locator('.cms-convert-look img').count() === 16, 'both pictures of each card are shown');
ok(/2 cards of 8 will use/.test(t), 'and how many would be converted');
await btn('Use the games’ details', 300); ok(/8 cards of 8 will use/.test(await text()), 'set all');
await btn('As suggested', 300);
for (const w of [1280, 760, 390, 320]) { await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(250); ok(await p.evaluate(() => { const b = document.querySelector('.cms-convert-dialog').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth && ![...document.querySelectorAll('.cms-convert-dialog *')].some(n => n.offsetParent && n.getBoundingClientRect().right > b.right + 1); }), `${w}px: the review fits`); if (w === 390) await shot('convert-390'); }
await p.setViewportSize({ width: 1440, height: 900 });
for (let i = 0; i < 40; i++) await p.keyboard.press('Tab');
ok(await p.evaluate(() => !!document.activeElement.closest('.cms-convert-dialog')), 'Tab stays in it'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok(await p.locator('.cms-convert-dialog').isHidden() && !(await p.evaluate(() => Object.keys(sessionStorage).some(k => /pa-cms-working/.test(k)))), 'Escape leaves everything as it was');
// As suggested, then undone.
await panel(true); await click(ENTRY, 1500); await btn('Apply to my unsaved changes', 800); await shot('convert-done');
ok(/2 cards now use the Game Library in your unsaved changes; 6 cards were kept/.test(await text()) && /Save and publish the Game Library first/.test(await text()), 'two converted, six kept, and what to do next');
await btn('Look at the page', 500);
ok((await p.locator('.cms-card-note').allTextContents()).filter(x => x === 'Not published yet').length >= 2, 'the page shows the result; what the library hasn’t published is marked');
await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
await panel(true); ok(/Unsaved\s+None/.test(await p.locator('#cms-admin-panel').innerText()), 'one step to undo');
// The library's own changes are undone there.
await click('#cms-admin-panel button:text-is("Game Library")', 1000); ok(/Unsaved changes/.test(await text()), 'the library’s change is its own, unsaved'); await btn('Undo', 400); ok(/Published: version/.test(await text()), 'and undone there'); await btn('Done', 400);

// ── All of it, with these pictures ──
await panel(true); await click(ENTRY, 1500); await btn('… with these pictures', 300); ok(/8 cards of 8 will use/.test(await text()), 'every card, with its picture');
await btn('Apply to my unsaved changes', 800);
ok(!(await row('home', 'draft')) && !(await row('library', 'draft')), 'nothing is saved by applying');
await btn('Open Game Library', 1000); await shot('convert-library');
await click('.cms-library-save', 1000); ok(/Draft saved/.test(await p.locator('.cms-library-dialog .cms-publish-status').innerText()), 'the library is saved');
// Publishing the page before the library: said.
await btn('Done', 500);
await click('.cms-edit-pencil[data-cms-edit="home.featured"]', 700);
ok(await p.locator('.cms-drawer [name]').evaluateAll(n => n.map(x => x.name).join()) === 'game,cta' && await p.locator('.cms-drawer [name="cta"]').inputValue() === 'Play Now', 'a converted card: its game, its button label, its framing');
await click('.cms-drawer-primary[type="submit"]', 1000); await click('.cms-drawer-close', 400);
let d = (await row('home', 'draft')).content;
ok(d.schema === 2 && Object.keys(d.components).filter(k => d.components[k].game).length === 8 && !Object.values(d.components).some(x => x.game && (x.title || x.href || x.art)) && J(d.components['home.carousel']) === J(HOME.components['home.carousel']) && J(d.components['site.sidebar']) === J(HOME.components['site.sidebar']), 'the draft: schema 2, eight references, nothing of a game’s own, the order and Site Navigation as they were');
await panel(true); await click('.cms-admin-publish', 1400); await shot('convert-publish-early');
ok(/the Game Library has changes that aren’t published/.test(await text()) && /Now uses the Game Library/.test(await text()), 'publishing the page first is said to show the library’s present pictures'); await btn('Cancel', 400);
await panel(true); await click('#cms-admin-panel button:text-is("Game Library")', 900); await btn('Publish…', 1300);
t = await text(); ok(/Square artwork: new image/.test(t) && /Wide artwork: image added/.test(t) && !/same game/.test(t), 'the library’s review: which pictures'); await btn('Publish now', 1500); await btn('Done', 500); await btn('Done', 500);
await panel(true); await click('.cms-admin-publish', 1400); await shot('convert-publish');
t = await text(); ok(!/aren’t published/.test(t) && (t.match(/Now uses the Game Library/g) || []).length === 8 && !/Title|Image|framing/.test(t), 'the page’s review: eight cards, and nothing else about them changes'); await btn('Publish now', 1500); await btn('Done');
ok((await row('home', 'published')).content.schema === 2, 'published'); ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();

// ── Before and after ──
const after = await views(), differ = [], raster = [];
for (const k of Object.keys(before)) {
  const f = ['html', 'boxes', 'pictures'].filter(x => J(before[k][x]) !== J(after[k][x])), px = await pixels(before[k].shot, after[k].shot);
  if (px.n) raster.push(`${k}: ${px.n} pixels, by at most ${px.most} of 255`);
  if (f.length || px.most > 3) differ.push(`${k}: ${f} ${px.n}/${px.most}`);
}
ok(!differ.length, `${VIEWS.length} views the same before and after: markup, places, text styles, pictures, screenshots ${differ.join('; ')}`);
if (raster.length) console.log('     (drawn minutely differently by the browser: ' + raster.join('; ') + ')');

// ── A visitor over time ──
const tiles = q => p.locator(q || '.home-carousel .home-tile-title').allTextContents();
c = await ctx(); p = await open(c, '/', 'guest', 1300); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
ok((await tiles()).includes('Snake'), 'drawn from this browser’s copy'); offline = true; await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
ok((await tiles()).includes('Snake') && await p.locator('.home-feature-title').first().innerText() === 'Chess Forge', 'and offline'); offline = false;
const art = '/images/featured/pong-card.webp';
await lib(x => { Object.assign(x['library.games.snake'], { name: 'Python', category: 'Classic', art: { source: { static: art }, alt: 'New' } }); });
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
const g = await ctx(), gp = await open(g, '/games/', 'guest', 1300);
const of = q => q.evaluate(() => { const n = [...document.querySelectorAll('.home-tile')].find(a => a.getAttribute('href') === '/games/snake/'); return [n.querySelector('.home-tile-title').textContent, n.querySelector('.home-tile-category').textContent, n.querySelector('img').getAttribute('src'), n.querySelector('img').alt]; });
ok(J(await of(p)) === J(await of(gp)) && J(await of(p)) === J(['Python', 'Classic', art, 'New']), 'a library change reaches the homepage and the Games page alike'); await g.close();
await lib(x => { x['library.games.pong'].availability = 'hidden'; x['library.games.blackjack'].availability = 'coming-soon'; x['library.games.chess-forge'].availability = 'archived'; });
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
const gs = await ctx(), gq = await open(gs, '/games/', 'guest', 1300);
ok((await gq.locator('.card-grid .home-tile-title').allTextContents()).includes('Blackjack') && !(await gq.locator('.card-grid .home-tile-title').allTextContents()).includes('Pong'), 'coming soon: still in the Game Catalog'); await gs.close();
ok(!(await tiles()).includes('Pong') && !(await tiles()).includes('Blackjack') && await p.evaluate(() => getComputedStyle(document.querySelector('.home-banner--featured')).visibility === 'hidden') && !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'hidden and coming soon: not in the carousel; an archived Featured game leaves its place empty'); ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();
await lib(x => { ['pong', 'blackjack', 'chess-forge'].forEach(k => { x['library.games.' + k].availability = 'available'; }); });

// ── Editing it afterwards; history ──
await lib(x => { x['library.games.blackjack'].availability = 'coming-soon'; });
await admin(); await panel(false);
ok((await tiles()).includes('Blackjack') && (await p.locator('.cms-card-note').allTextContents()).includes('Coming soon: not shown here'), 'an administrator sees the coming-soon card in its place, marked');
await p.locator('.cms-edit-pencil[data-cms-edit="home.carousel.blackjack"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
ok(/visitors don’t see this card here/.test(await p.locator('.cms-game-note').innerText()), 'and its editor says so'); await click('.cms-drawer-close', 400); await c.close();
await lib(x => { x['library.games.blackjack'].availability = 'available'; });
await admin();
ok(await p.locator(ENTRY).isHidden(), 'nothing is left to convert');
await panel(false); await p.locator('.cms-add-tile').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
ok(await p.locator('.cms-drawer [name="game"]').count() === 1, 'a new carousel card refers to a game'); await click('.cms-drawer-secondary:text-is("Discard Changes")', 500);
await p.locator('.cms-edit-pencil[data-cms-edit="home.carousel.battleship"]').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(700); await p.locator('.cms-drawer .cms-image-stage').focus(); await p.keyboard.press('+'); await p.waitForTimeout(300); await click('.cms-drawer-primary[type="submit"]', 900); await click('.cms-drawer-close', 400);
ok((await row('home', 'draft')).content.components['home.carousel.battleship'].crop.scale > 1, 'its own framing is the card’s');
await click('.cms-manage-button[data-cms-manage="home.featured"]', 500); await btn('Add card', 700);
ok(await p.locator('.cms-drawer [name="game"]').count() === 1 && await p.locator('.cms-drawer [name="cta"]').inputValue() === 'Play Now', 'a new saved card too'); await click('.cms-drawer-secondary:text-is("Discard Changes")', 500);
// Layout and Site Navigation, as before.
await panel(true); await click('button[data-mode="layout"]', 900); await p.locator('.atlas-edit-hit[data-widget-id="featured"]').focus(); await p.keyboard.press('Shift+ArrowLeft'); await p.waitForTimeout(200); await click('.cms-layout-bar button:text-is("Discard layout changes")', 400); await click('.cms-layout-bar button:text-is("Done")', 400);
await panel(true); await click('#cms-admin-panel button:has-text("Site Navigation")', 700); ok(/Links/.test(await text()), 'Site Navigation still edits'); await btn('Done', 400);
// The version before conversion, restored.
await panel(true); await click('.cms-admin-history', 1300); await shot('convert-history');
ok(/Now uses the Game Library/.test(await text()) && /Chess Forge/.test(await text()), 'history names the games');
const libNow = (await row('library', 'published')).id;
await p.locator('.cms-history button:text-is("Restore…")').last().click(); await p.waitForTimeout(500); ok(/Now has its own details/.test(await text()), 'restoring the version before says what it does'); await p.locator('.cms-history .cms-drawer-primary').first().click(); await p.waitForTimeout(1800); await btn('Done');
ok((await row('home', 'published')).content.schema === 1 && (await row('library', 'published')).id === libNow, 'the version before is live again; the library is as it was');
ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();
const back = await ctx({ storage: { paSidebarCollapsed: '0', 'pa-appearance': J({ palette: 'obsidian', mode: 'dark' }) } }), bp = await open(back, '/', 'guest', 1300);
const was = before['1440 dark expanded obsidian'], is = await look(bp);
ok(['html', 'boxes', 'pictures'].every(x => J(is[x]) === J(was[x])) && (await pixels(is.shot, was.shot)).most <= 3, 'and looks exactly as it did'); await back.close();

// ── Members and guests; signing out ──
for (const role of ['guest', 'user']) { c = await ctx(); const files = []; c.on('request', r => files.push(r.url())); p = await open(c, '/', role, 1200); ok(!files.some(f => /cms\/convert/.test(f)) && await p.locator('#cms-admin-button').count() === 0, `${role}: nothing of it`); await c.close(); }
{ const dr = (await call('get_draft', { p_page: 'home' })).draft; if (dr) await call('discard_draft', { p_page: 'home', p_expected_draft_id: dr.id }); }
await admin(); await click(ENTRY, 1500);
ok(/8 cards differ|Nothing visible changes|differ/.test(await text()), 'a restored homepage can be converted again');
await p.evaluate(() => window.__role('guest')); await p.waitForTimeout(900);
ok(await p.locator('.cms-convert').count() === 0, 'signing out removes it'); await c.close();

await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
