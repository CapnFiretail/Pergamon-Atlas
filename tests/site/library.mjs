// The Game Library and editing the Games page, end to end, with the real migrations
// (0016 too) in the emulated database; sign-in is a stand-in (lib.mjs). Needs the
// local development server.
//
//   node tests/site/library.mjs [folder for pictures]
//
// The first library from the built-in games, its fields, ids, artwork and framing,
// drafts, publishing, the warning about a changed identity, history, conflicts,
// archiving and removing; the Games page in Content and Layout Mode: choosing games,
// its own framings, missing and unpublished games, publishing; what visitors get,
// cached, offline and tampered with; members and guests; the homepage beside it.
import { chromium, context, database, open } from './lib.mjs';

let bad = 0;
const shots = process.argv[2];
const ok = (c, what) => { if (!c) bad++; console.log(c ? 'ok  ' : 'FAIL', what); };
const db = await database();
let offline = false, change = null;
const answer = async (role, fn, a) => { if (offline) return null; const r = await db.answer(role, fn, a); return change ? change(r, fn, a) : r; };
const browser = await chromium.launch();
// (The ad script can't load locally: expected.)
const errs = c => c.errs.filter(e => !/googlesyndication/.test(e));
const OVERRIDES = JSON.stringify([{ path: '/games/pong', visibility: 'admin' }]);
async function ctx(o = {}) {
  const c = await context(browser, Object.assign({ size: [1440, 900], answer, storage: { paSidebarCollapsed: '0' } }, o));
  if (shots) await c.unroute(/fonts\.g/);
  await c.route(/atlas_visibility_overrides/, r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: OVERRIDES }));
  c.files = [];
  c.on('request', r => c.files.push(new URL(r.url()).pathname));
  return c;
}
const row = async (page, status) => ((await db.env.db.query('select id::int, content from public.site_content_versions where page = $1 and status = $2', [page, status])).rows[0] || null);
const count = async page => (await db.env.db.query('select count(*)::int as n from public.site_content_versions where page = $1', [page])).rows[0].n;
const guest = async (o = {}) => {
  const c = await ctx(o), p = await open(c, o.url || '/games/', o.role || 'guest', 1300);
  const v = await p.evaluate(() => ({ cards: [...document.querySelectorAll('.card-grid .home-tile')].map(a => a.querySelector('.home-tile-title').textContent), hrefs: [...document.querySelectorAll('.card-grid .home-tile')].map(a => a.getAttribute('href')), count: (document.querySelector('.page-heading-count-num') || {}).textContent, featured: (document.querySelector('.home-feature-title') || {}).textContent, vis: document.querySelector('.home-feature') ? getComputedStyle(document.querySelector('.home-feature')).visibility : '', focus: [...document.querySelectorAll('.card-grid .home-art')].map(n => n.style.getPropertyValue('--art-focus')).filter(Boolean) }));
  return Object.assign(v, { c, p, async close() { await c.close(); } });
};

let c, p;
const click = async (q, wait = 350) => { await p.locator(q).filter({ visible: true }).first().click(); await p.waitForTimeout(wait); };
const btn = (text, wait) => click(`.cms-publish:not([hidden]) button:text-is("${text}")`, wait);
const says = () => p.locator('.cms-library-dialog .cms-publish-status').innerText();
const dialogText = () => p.locator('.cms-publish-dialog:visible').innerText();
const shot = async n => { if (shots) await p.screenshot({ path: `${shots}/${n}.png` }); };
const tiles = () => p.locator('.card-grid .home-tile-title').allTextContents();
const notes = () => p.locator('.cms-card-note').allTextContents();
const panel = async on => { if (await p.locator('#cms-admin-panel').isVisible() !== on) await click('#cms-admin-button', 500); };
const openLibrary = async () => { await panel(true); await click('#cms-admin-panel button:text-is("Game Library")', 900); };
const closeLibrary = () => click('.cms-library-dialog button:text-is("Done")', 500);
const pick = id => click(`.cms-library [data-game="${id}"]`);
async function admin(url = '/games/', role = 'admin', o = {}) {
  c = await ctx(o); p = await open(c, url, role, 1900);
  await click('#cms-admin-button'); if (await p.locator('.cms-admin-switch').getAttribute('aria-checked') !== 'true') await click('.cms-admin-switch', 1200);
}

// ── Before anything is published ──
let g = await guest();
ok(g.cards.length === 7 && !g.cards.includes('Pong') && g.count === '7', 'nothing published: the built-in games, with the stored overrides');
ok(!g.c.files.some(f => /cms\/(workspace|drawer|fields|library-(editing|dialog)|publish)/.test(f)), 'a guest downloads nothing of the editor'); ok(!errs(g.c).length, 'no errors ' + errs(g.c)); await g.close();
g = await guest({ role: 'user', storage: { 'sb-aaaaaaaaaaaaaaaaaaaa-auth-token': '{}' } });
ok(g.cards.length === 7 && !g.c.files.some(f => /library-dialog/.test(f)) && await g.p.locator('#cms-admin-button').count() === 0, 'a member sees the same, and no editor'); await g.close();

// ── The first library ──
await admin();
await shot('panel');
ok(/Built-in content/.test(await p.locator('#cms-admin-panel').innerText()) && /Not started/.test(await p.locator('#cms-admin-library-note').innerText()), 'the panel: nothing stored, the library not started');
ok((await tiles()).every(t => t === 'Not in the Game Library') && (await p.locator('.card-grid .home-tile-category').allTextContents()).includes('snake'), 'no library yet: cards stay in place, with their ids, never drawn from the built-in records');
await openLibrary(); await shot('library-empty');
ok(/No games yet/.test(await dialogText()), 'the library is empty');
await click('.cms-library-start', 1000); await shot('library-started');
ok(/Added 8 games/.test(await says()) && /hidden, as set before: “Pong”/.test(await says()), 'started with the built-in games, with what the overrides said');
ok(await count('library') === 0, 'nothing is stored by that');
await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
ok(/No games yet/.test(await dialogText()), 'one step to undo'); await btn('Redo');
await pick('snake'); await shot('library-game');
ok(await p.locator('.cms-library-id').innerText() === 'snake' && await p.locator('.cms-library-form [name]').evaluateAll(n => n.map(x => x.name).join()) === 'name,description,category,destination,availability' && await p.locator('.cms-library .cms-image').count() === 2, 'its id, its fields, its two artworks');
await p.fill('.cms-library-form [name="name"]', ''); await p.waitForTimeout(250);
ok(await p.locator('.cms-library-save').isDisabled(), 'a name is needed');
await p.fill('.cms-library-form [name="name"]', 'Snake'); await p.fill('.cms-library-form [name="description"]', 'Eat and grow.'); await p.waitForTimeout(250);
await p.selectOption('.cms-library-form [name="destination"]', '__other__'); await p.fill('.cms-library-form .cms-field-other', '/games/pong/'); await p.waitForTimeout(250);
ok(/Pong already leads there/.test(await p.locator('.cms-library-form').innerText()), 'two games can’t lead to one page');
await p.fill('.cms-library-form .cms-field-other', '/games/snake/'); await p.waitForTimeout(250);
// Framing by keyboard.
const stage = p.locator('.cms-library .cms-image-stage').first(); await stage.focus(); await p.keyboard.press('+'); await p.keyboard.press('+'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
await click('.cms-library-save', 900);
ok(/Draft saved/.test(await says()), 'saved: ' + await says());
let d = (await row('library', 'draft')).content.components['library.games.snake'];
ok(d.description === 'Eat and grow.' && d.art.scale === 1.2 && d.art.focus.x > 50 && !d.wide, 'the draft has the description and the default framing');
ok(await count('games') === 0 && !(await row('library', 'published')), 'nothing else was written, nothing published');
// A new game.
await click('.cms-library .cms-nav-add'); await p.fill('.cms-library-new input >> nth=0', 'Snake'); await p.waitForTimeout(150);
ok(await p.locator('.cms-library-new input').nth(1).inputValue() === 'snake-2', 'an id is suggested, never one that is taken');
await p.locator('.cms-library-new input').nth(1).fill('snake'); await p.locator('.cms-library-new input').nth(2).fill('/games/snake/'); await click('.cms-library-new button[type="submit"]');
ok(/another game’s id/.test(await dialogText()) && /already leads there/.test(await dialogText()), 'a taken id and destination are refused');
await btn('Cancel');
await closeLibrary(); await shot('page-unpublished');
ok((await tiles()).length === 8 && (await notes()).filter(t => t === 'Not published yet').length === 7 && (await notes()).includes('Hidden'), 'the page is drawn from the library’s draft, and says so');
ok(await p.locator('.page-heading-count-num').innerText() === '7', 'the count leaves out what visitors won’t see');

// ── The page before its library ──
await panel(true); await click('.cms-admin-publish', 900);
ok(/Nothing has been saved yet/.test(await dialogText()), 'the page was never saved'); await btn('Save it as a draft', 1300); await shot('page-blocked');
ok(/Not ready to publish/.test(await dialogText()) && /Not in the published Game Library: .*“Snake”/.test(await dialogText()) && await p.locator('.cms-publish:not([hidden]) button:text-is("Publish now")').isDisabled(), 'its games are named; it can’t be published before the library');
await btn('Open Game Library', 1000);
ok(/Game Library/.test(await dialogText()) && /in the draft/.test(await dialogText()), 'the library opens, and knows the page’s draft uses its games');
await click('.cms-library-publish', 1200); await shot('library-review');
ok(/8|Added/.test(await dialogText()) && /Snake/.test(await dialogText()) && !/same game/.test(await dialogText()), 'the review lists the games; a first library needs no warning');
await btn('Publish now', 1500); ok(/Published/.test(await dialogText()), 'published'); await btn('Done', 500);
ok(/Published: version/.test(await dialogText()), 'and back in the library'); await closeLibrary();
await panel(true); await click('.cms-admin-publish', 1200);
ok(/Visitors won’t see the cards for “Pong”/.test(await dialogText()), 'publishing the page says which cards visitors won’t see');
await btn('Publish now', 1500); await btn('Done');
ok((await row('games', 'published')).content.components['games.grid.snake'].game === 'snake', 'the Games page is published, with references only');
ok(!errs(c).length, 'no errors ' + errs(c));

// ── Visitors ──
g = await guest();
ok(g.cards.length === 7 && g.count === '7' && !g.cards.includes('Pong') && g.hrefs.includes('/games/snake/'), 'a guest sees the published games');
ok(g.focus.length === 1, 'with the record’s default framing');
offline = true; await g.p.reload({ waitUntil: 'load' }); await g.p.waitForTimeout(1000);
ok((await g.p.locator('.card-grid .home-tile').count()) === 7, 'offline: what this browser last received'); offline = false;
// The library changes, the page doesn't.
const lib = async (fn, who = 'second') => { const cur = (await db.answer(who, 'get_draft', { p_page: 'library' })).data; const doc = structuredClone((cur.draft || cur.published).content); fn(doc.components); const s = await db.answer(who, 'save_draft', { p_page: 'library', p_content: doc, p_expected_draft_id: cur.draft ? cur.draft.id : null }); return s; };
const pub = async (page = 'library') => { const cur = (await db.answer('second', 'get_draft', { p_page: page })).data; return db.answer('second', 'publish', { p_page: page, p_draft_id: cur.draft.id, p_expected_published_id: cur.published ? cur.published.id : null }); };
await lib(x => { x['library.games.blackjack'].name = 'Twenty-One'; }); await pub();
await g.p.reload({ waitUntil: 'load' }); await g.p.waitForTimeout(1200);
ok((await g.p.locator('.card-grid .home-tile-title').allTextContents()).includes('Twenty-One'), 'a newer library with the same page version is drawn');
const cached = await g.p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('pa-cms-games:')))));
ok(cached.libraryRaw.games.blackjack.name === 'Twenty-One' && !cached.libraryRaw.games.pong, 'kept with the page; hidden games never reach it');
// An answer that lacks a game, or carries an unsafe one, isn't used.
for (const [what, fn] of [['lacks a game', r => { delete r.library.games.snake; }], ['has no records', r => { delete r.library; }], ['leads elsewhere', r => { r.library.games.snake.destination = 'https://x.test/'; }], ['is a hidden record', r => { r.library.games.snake.availability = 'hidden'; }]]) {
  change = (r, name, a) => { if (name === 'get_published_content' && a.p_page === 'games') { r = structuredClone(r); fn(r.data); } return r; };
  await g.p.reload({ waitUntil: 'load' }); await g.p.waitForTimeout(1000);
  ok((await g.p.locator('.card-grid .home-tile').count()) === 7 && (await g.p.locator('.card-grid .home-tile-title').allTextContents()).includes('Twenty-One'), `an answer that ${what}: the last good one stays`);
}
change = null; await g.close();

// ── A card's own framing, another game, a game that went away ──
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1900);
await click('.cms-edit-pencil[data-cms-edit="games.grid.snake"]', 700); await shot('card-editor');
ok(await p.locator('.cms-drawer [name]').evaluateAll(n => n.map(x => x.name).join()) === 'game' && await p.locator('.cms-drawer .cms-image-file').isHidden(), 'a card’s editor: which game, and its framing; nothing of the game’s own');
ok(/uses the game’s framing/.test(await p.locator('.cms-image-follow').innerText()), 'it starts with the game’s framing');
await p.locator('.cms-drawer .cms-image-stage').focus(); await p.keyboard.press('+'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
ok(/framing of its own/.test(await p.locator('.cms-image-follow').innerText()), 'moving it gives the card its own');
await click('.cms-drawer-primary[type="submit"]', 900);
d = (await row('games', 'draft')).content.components['games.grid.snake'];
ok(d.game === 'snake' && d.crop.scale === 1.3 && !d.crop.source && (await row('library', 'published')).content.components['library.games.snake'].art.scale === 1.2, 'the crop is the card’s; the record is untouched');
await click('.cms-drawer .cms-image-link:has-text("Use the game’s framing")'); ok(await p.evaluate(() => !document.querySelector('.cms-drawer .cms-image-tools button:last-child').offsetParent), 'and back to the game’s');
await p.selectOption('.cms-drawer [name="game"]', 'breakout'); await p.waitForTimeout(400);
ok((await tiles()).filter(t => t === 'Breakout').length === 2 && await p.locator('.cms-drawer-title').innerText() === 'Breakout', 'another game is chosen');
ok((await p.locator('.cms-drawer [name="game"] option').allTextContents()).includes('Tic-Tac-Toe (coming soon)') && !(await p.locator('.cms-drawer [name="game"] option').allTextContents()).some(t => /Pong/.test(t)), 'coming soon can be chosen, hidden can’t');
await click('.cms-drawer .cms-image-link:has-text("Edit in Game Library")', 900);
ok(await p.locator('.cms-library-id').innerText() === 'breakout', 'the game opens in the library from its card'); await closeLibrary();
ok(await p.evaluate(() => document.activeElement.textContent === 'Edit in Game Library'), 'and focus comes back to the card’s editor');
await click('.cms-drawer-secondary:text-is("Discard Changes")'); await click('.cms-drawer-close', 500);
// What the server refuses, and a published game.
await openLibrary(); await pick('tic-tac-toe');
await p.selectOption('.cms-library-form [name="destination"]', '__other__'); await p.fill('.cms-library-form .cms-field-other', '/games/other/'); await p.waitForTimeout(300);
await click('.cms-library-save', 900); ok(/server didn’t accept/.test(await says()), 'a page that doesn’t exist is refused by the server, and nothing is lost: ' + await says());
await btn('Discard changes', 600);
await pick('pong'); await btn('Archive game', 500); await btn('Undo', 400);
ok(await p.locator('.cms-library button:text-is("Remove game…")').count() === 0, 'a published game can’t be removed');
await closeLibrary();
// Another administrator's draft of the library.
await lib(x => { x['library.games.tic-tac-toe'].destination = '/games/tic-tac-toe/'; x['library.games.snake'].name = 'Python'; });
await panel(true); await p.waitForTimeout(900); await panel(false);
ok((await tiles()).includes('Python') && (await notes()).filter(t => t === 'Not published yet').length === 1, 'opening the panel follows another administrator’s draft; only that game is marked');
await panel(true); await click('.cms-admin-publish', 1200);
ok(/“Python”: the Game Library has changes that aren’t published/.test(await dialogText()), 'publishing the page says it shows the published details'); await btn('Cancel');

// ── Identity ──
await openLibrary(); await pick('snake'); await p.fill('.cms-library-form [name="name"]', 'Connect Five'); await p.waitForTimeout(250);
await pick('connect-four'); await p.selectOption('.cms-library-form [name="destination"]', '__other__'); await p.fill('.cms-library-form .cms-field-other', '/games/zzz/'); await p.waitForTimeout(250);
await pick('snake'); await p.selectOption('.cms-library-form [name="destination"]', '/games/connect-four/'); await p.waitForTimeout(250);
await pick('connect-four'); await p.fill('.cms-library-form .cms-field-other', '/games/snake/'); await p.waitForTimeout(250);
await click('.cms-library-save', 900); ok(/Draft saved/.test(await says()), 'two games swapped, in a draft: ' + await says());
await click('.cms-library-publish', 1200); await shot('identity');
let text = await dialogText();
ok(/“Snake” \(snake\) changes both its name and its destination/.test(text) && /Name: Snake → Connect Five\. Destination: \/games\/snake\/ → \/games\/connect-four\//.test(text) && /Games page: 1 card live/.test(text) && /id of its own/.test(text), 'the warning names the game, both values and its pages');
ok(!/“Connect Four” \(connect-four\) changes both/.test(text), 'a new destination alone is no warning');
ok(await p.locator('.cms-publish:not([hidden]) button:text-is("Publish now")').isDisabled(), 'it has to be acknowledged');
await p.locator('.cms-publish:not([hidden]) .cms-publish-confirm input').first().check();
ok(await p.locator('.cms-publish:not([hidden]) button:text-is("Publish now")').isEnabled(), 'and may then go on');
await btn('Cancel', 400);
await btn('Discard draft…', 700); ok(/can’t be undone here/.test(await dialogText()), 'discarding the draft asks'); await btn('Discard draft', 1000);
ok(!(await row('library', 'draft')) && /discarded/.test(await says()), 'discarded; the published library is as it was');

// ── Conflict ──
await pick('breakout'); await p.fill('.cms-library-form [name="description"]', 'Mine.'); await p.waitForTimeout(250);
await lib(x => { x['library.games.breakout'].description = 'Theirs.'; x['library.games.snake'].description = 'Also theirs.'; });
await click('.cms-library-save', 1000);
ok(/another administrator saved a newer draft/.test(await says()) && /You both changed “Breakout”/.test(await says()), 'a newer draft is never overwritten');
await click('.cms-library-keep', 1000);
d = (await row('library', 'draft')).content.components;
ok(d['library.games.breakout'].description === 'Mine.' && d['library.games.snake'].description === 'Also theirs.', 'kept mine on top of theirs');
await btn('Publish…', 1200); await btn('Publish now', 1500); await btn('Done', 500);

// ── History ──
await btn('Version History', 1000); await shot('history');
ok(/Open as draft/.test(await dialogText()) && !/Restore…/.test(await dialogText()), 'an earlier library opens as a draft');
await p.locator('.cms-history button:text-is("Open as draft…")').last().click(); await p.waitForTimeout(400);
await p.locator('.cms-history .cms-drawer-primary').first().click(); await p.waitForTimeout(900);
ok(/is open as unsaved changes/.test(await says()) && (await p.locator('.cms-library [data-game="blackjack"]').innerText()).includes('Blackjack'), 'its games are back as they were, unsaved');
ok((await row('library', 'published')).content.components['library.games.blackjack'].name === 'Twenty-One', 'visitors’ library is untouched');
await btn('Undo', 400); ok((await p.locator('.cms-library [data-game="blackjack"]').innerText()).includes('Twenty-One'), 'and it can be undone');
await closeLibrary();

// ── Manage cards, missing games ──
await click('.cms-manage-button[data-cms-manage="games.grid"]'); await shot('manage');
ok(/Not published|Hidden/.test(await dialogText()) && /Snake/.test(await dialogText()), 'Manage cards: the games’ names, and which are hidden');
await click('[data-action="delete"]'); await click('.cms-manage-danger'); await btn('Add card', 700);
ok(await p.locator('.cms-drawer [name="game"]').inputValue() === 'tic-tac-toe', 'Add card starts with the first game that isn’t there');
await click('.cms-drawer-primary[type="submit"]', 900); await click('.cms-drawer-close', 500);
// A draft whose game is gone from the library (made so in the database here).
const gd = (await db.answer('second', 'get_draft', { p_page: 'games' })).data.draft;
await db.env.db.query("set session_replication_role = replica"); await db.env.db.query('update public.site_content_versions set content = jsonb_set(content, $1, $2) where id = $3', ['{components,games.grid.snake}', JSON.stringify({ game: 'ghost' }), gd.id]); await db.env.db.query("set session_replication_role = origin");
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2000); await shot('missing');
ok((await tiles()).includes('Not in the Game Library') && (await tiles()).length === 8, 'a card whose game is gone stays in its place');
await click('.cms-edit-pencil[data-cms-edit="games.grid.snake"]', 600);
ok(/“ghost” isn’t in the Game Library/.test(await p.locator('.cms-game-note').innerText()) && await p.locator('.cms-drawer button:text-is("Remove this card")').isVisible(), 'its editor says so, and offers to remove it');
await click('.cms-drawer-close', 400);
await click('.cms-edit-pencil[data-cms-edit="games.heading"]', 500); await p.fill('.cms-drawer [name="subtitle"]', 'All of them'); await click('.cms-drawer-primary[type="submit"]', 900);
ok(/Draft saved/.test(await p.locator('.cms-drawer-feedback').innerText()), 'everything else in the draft can still be saved'); await click('.cms-drawer-close', 400);
await panel(true); await click('.cms-admin-publish', 1200);
ok(/Not in the published Game Library: “ghost”/.test(await dialogText()) && await p.locator('.cms-publish:not([hidden]) button:text-is("Publish now")').isDisabled(), 'publishing names it first'); await btn('Cancel');
await click('.cms-edit-pencil[data-cms-edit="games.grid.snake"]', 600); await click('.cms-drawer button:text-is("Remove this card")', 600);
ok((await tiles()).length === 7 && !(await tiles()).includes('Not in the Game Library') && await p.locator('.cms-drawer').isHidden(), 'removed, and its editor closes');
await p.keyboard.press('Control+z'); await p.waitForTimeout(400); ok((await tiles()).includes('Not in the Game Library'), 'undo brings it back');
await p.keyboard.press('Control+y'); await p.waitForTimeout(400);

// ── Layout Mode ──
await panel(true); await click('button[data-mode="layout"]', 900); await shot('layout');
const status = () => p.locator('.cms-layout-status').innerText();
await p.locator('.atlas-edit-hit[data-widget-id="grid"]').focus(); for (let i = 0; i < 8; i++) await p.keyboard.press('ArrowDown');
await p.selectOption('.cms-layout-type', 'feature-hero'); await click('.cms-layout-bar button:text-is("Add widget")', 600);
ok(/^Added Featured Game/.test(await status()), 'a widget is added: ' + await status());
await click('.cms-layout-bar button:text-is("Edit card")', 700); await shot('layout-card');
ok(await p.locator('.cms-drawer [name]').evaluateAll(n => n.map(x => x.name).join()) === 'game,cta', 'a new Featured card refers to a game');
await p.selectOption('.cms-drawer [name="game"]', 'chess-forge'); await p.waitForTimeout(300); await click('.cms-drawer-primary[type="submit"]', 900); await click('.cms-drawer-close', 400);
ok((await row('games', 'draft')).content.components['games.featured'].game === 'chess-forge' && (await row('games', 'draft')).content.components['games.featured'].title === undefined, 'stored as a reference');
await click('.cms-layout-bar button:text-is("Done")', 400);
await panel(true); await click('.cms-admin-publish', 1200); const boxes = p.locator('.cms-publish:not([hidden]) .cms-publish-confirm input'); for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
await shot('page-review'); await btn('Publish now', 1500); ok(/Published/.test(await dialogText()), 'published with its new widget'); await btn('Done');
// Every other widget can be added here too, and draws its own content.
await panel(true); await click('button[data-mode="layout"]', 900);
await p.locator('.atlas-edit-hit[data-widget-id="grid"]').focus(); for (let i = 0; i < 36; i++) await p.keyboard.press('ArrowDown');
for (const [type, name] of [['carousel', 'Carousel'], ['atlas-navigation', 'Atlas Navigation'], ['feature-spotlight', 'Spotlight']]) { await p.selectOption('.cms-layout-type', type); await click('.cms-layout-bar button:text-is("Add widget")', 600); ok((await status()).startsWith('Added ' + name), name + ' is added: ' + await status()); }
ok(await p.locator('[data-atlas-page] .home-carousel').count() === 1 && /Suggestions/.test(await p.locator('.atlas-grid-slot[data-widget-id="navigation"]').innerText()), 'the carousel has its frame, Atlas Navigation its links');
await p.locator('.atlas-edit-hit[data-widget-id="carousel"]').focus(); await click('.cms-layout-bar button:text-is("Manage cards")', 500); await click('.cms-publish:not([hidden]) [data-action="add"]', 700);
ok(await p.locator('.cms-drawer [name="game"]').count() === 1, 'a carousel’s new card refers to a game'); await click('.cms-drawer-primary[type="submit"]', 900); await click('.cms-drawer-close', 400);
ok(await p.locator('[data-atlas-page] .home-carousel .home-tile').count() >= 1 && Object.values((await row('games', 'draft')).content.components).filter(x => x.game).every(x => !x.title && !x.href), 'and is drawn; the draft is accepted');
await shot('layout-all'); await click('.cms-layout-bar button:text-is("Done")', 400);
// Previews: what visitors have, not the working copy.
await panel(true); await click('.cms-admin-view[data-view="guest"]', 900);
ok(!(await notes()).length && !(await tiles()).includes('Pong'), 'View as Guest: the published records only'); await click('.cms-admin-bar-back', 600);
ok(!errs(c).length, 'no errors ' + errs(c));
g = await guest(); ok(g.featured === 'Chess Forge' && g.vis === 'visible' && g.cards.length >= 6, 'a guest sees the Featured game'); await g.close();
await lib(x => { x['library.games.chess-forge'].availability = 'archived'; }); await pub();
g = await guest(); ok(g.vis === 'hidden' && !g.cards.includes('Chess Forge') && !errs(g.c).length, 'archived: its Featured place is empty, its card gone, the page whole'); await g.close();
await lib(x => { x['library.games.chess-forge'].availability = 'available'; }); await pub();

// ── History of the page never changes the library ──
const libVersion = (await row('library', 'published')).id;
await panel(true); await click('.cms-admin-history', 1000); await p.locator('.cms-history button:text-is("Restore…")').last().click(); await p.waitForTimeout(500); await p.locator('.cms-history .cms-drawer-primary').first().click(); await p.waitForTimeout(1600);
ok(/Restored/.test(await dialogText()) && (await row('library', 'published')).id === libVersion, 'restoring the page leaves the library alone'); await btn('Done');

// ── Widths, themes, sign-out ──
await openLibrary();
for (const w of [1920, 1280, 1000, 760, 390, 320]) { await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(350); const v = await p.evaluate(() => { const b = document.querySelector('.cms-library-dialog').getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth, in: b.left >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5, wide: [...document.querySelectorAll('.cms-library-dialog *')].filter(n => n.offsetParent && !n.closest('.cms-image-canvas')).some(n => n.getBoundingClientRect().right > b.right + 1) }; }); ok(!v.over && v.in && !v.wide, `${w}px: the library fits ${JSON.stringify(v)}`); if (w === 390 || w === 1000) await shot('library-' + w); }
await p.setViewportSize({ width: 1440, height: 900 });
for (const mode of ['light', 'dark']) { await p.evaluate(m => window.PergamonTheme.setMode(m), mode); await p.waitForTimeout(300); const lum = await p.evaluate(() => getComputedStyle(document.querySelector('.cms-library-dialog')).backgroundColor); ok(!!lum, `${mode}: ${lum}`); await shot('library-' + mode); }
// Keyboard: focus stays in the dialog.
for (let i = 0; i < 60; i++) await p.keyboard.press('Tab');
ok(await p.evaluate(() => !!document.activeElement.closest('.cms-library-dialog')), 'Tab stays in the dialog'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
ok(await p.locator('.cms-library-dialog').isHidden(), 'Escape closes it');
await openLibrary(); await pick('snake'); await p.fill('.cms-library-form [name="name"]', 'Unsaved'); await p.waitForTimeout(300);
await p.evaluate(() => window.__role('guest')); await p.waitForTimeout(1000);
ok(await p.locator('.cms-library').count() === 0 && !(await p.evaluate(() => Object.keys(sessionStorage).some(k => /pa-cms-working/.test(k)))) && !(await p.evaluate(() => /Unsaved/.test(document.body.innerText))), 'signing out removes the library and every unsaved edit');
ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();

// ── The homepage beside it ──
await admin('/');
const calls = c.calls.filter(x => /library/.test(x));
ok(!calls.length, 'the homepage asks nothing of the library until it is opened');
ok(await p.locator('#cms-admin-panel button:text-is("Game Library")').isEnabled() && await p.locator('#cms-admin-panel button:has-text("Site Navigation")').isEnabled(), 'its panel has the Game Library too');
await openLibrary(); ok(/8 of 64 games/.test(await dialogText()) && /Games page: /.test(await dialogText()), 'the same library'); await closeLibrary(); await panel(false);
await click('.cms-edit-pencil[data-cms-edit="home.featured"]', 600);
ok(await p.locator('.cms-drawer [name]').evaluateAll(n => n.map(x => x.name).join()) === 'title,cta,href', 'its cards keep their own details'); await click('.cms-drawer-close');
ok(!errs(c).length, 'no errors ' + errs(c)); await c.close();

await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL OK');
process.exit(bad ? 1 : 0);
