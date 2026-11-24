// Admin Mode on the homepage, end to end: what an administrator sees and what
// the database holds after each step, for a before / after comparison of a
// change that must not alter it. Needs the local development server; the
// database and the sign-in are stand-ins (lib.mjs).
//
//   node tests/site/admin.mjs transcript.json      then compare two transcripts
//   (git diff --no-index before.json after.json)
//
// Content Mode (cards, saved cards, carousel, Site Navigation, undo), Layout
// Mode (add, move, resize, order, remove), saving, conflicts, publishing,
// history, restore, the previews, losing access, phone width.
import { writeFileSync } from 'node:fs';
import { chromium, context, database, open } from './lib.mjs';

const { env, answer } = await database();
const browser = await chromium.launch();
const log = [];
let p = null, ctx = null;
const clean = s => String(s).replace(/\s+/g, ' ').replace(/\d{1,2}:\d{2}( ?[AP]M)?/g, 'TIME').replace(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d+, \d+, /g, 'DATE ').trim();
const rows = async () => (await env.db.query('select id::int, page, status, schema_version, content, source_version_id::int, previous_version_id::int from public.site_content_versions order by id')).rows;
const note = (what, value) => log.push([what, value]);
// What is on screen: the page's cards and controls, and every open editor.
async function see(what) {
  await p.waitForTimeout(350);
  const v = await p.evaluate(() => {
    const vis = n => n && n.offsetParent !== null || (n && getComputedStyle(n).position === 'fixed' && getComputedStyle(n).display !== 'none');
    const t = n => n.innerText;
    const all = (q, f) => [...document.querySelectorAll(q)].filter(vis).map(f || t);
    return {
      widgets: all('.atlas-grid-slot', n => { const r = n.getBoundingClientRect(); return [n.innerText.replace(/\s+/g, ' ').slice(0, 90), Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)].join('|'); }),
      controls: all('.cms-edit-pencil, .cms-manage-button, .cms-nav-pencil, .cms-add-tile, .cms-preview-badge', n => (n.getAttribute('aria-label') || n.textContent) + (n.dataset.status ? ' [' + n.dataset.status + ']' : '')),
      panel: all('.cms-admin-panel'), bar: all('.cms-admin-bar'), drawer: all('.cms-drawer'), dialog: all('.cms-publish-dialog'), nav: all('.cms-nav-dialog, .cms-nav'),
      layout: all('.cms-layout-bar', n => n.innerText + ' ## ' + [...n.querySelectorAll('button, select')].map(b => (b.getAttribute('aria-label') || b.textContent.slice(0, 40)) + (b.disabled ? ' (off)' : '')).join(' | ')),
      overlay: all('.atlas-edit-item', n => n.getAttribute('aria-label') || ''),
      sidebar: all('.pa-sidebar-nav a', n => n.textContent.trim() + ' ' + n.getAttribute('href')), button: (document.querySelector('#cms-admin-button') || { getAttribute: () => null }).getAttribute('aria-label'),
      root: [...document.documentElement.attributes].filter(a => a.name.indexOf('data-cms') === 0).map(a => a.name + '=' + a.value).sort(), focus: document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.slice(0, 40))
    };
  });
  note(what, JSON.parse(clean(JSON.stringify(v))));
}
async function stored(what) { note(what + ' (database)', (await rows()).map(r => JSON.parse(clean(JSON.stringify(r))))); }
const click = async (q, o = {}) => { await p.locator(q).filter({ visible: true }).nth(o.nth || 0).click(); await p.waitForTimeout(o.wait || 250); };
const btn = (text, o = {}) => click(`button:text-is("${text}")`, o);
const pencil = label => click(`.cms-edit-pencil[aria-label^="${label}"]`);
const panel = async open => { const shown = await p.locator('#cms-admin-panel').isVisible(); if (shown !== open) await click('#cms-admin-button', { wait: 500 }); };
const field = async (label, value) => { const f = p.locator(`.cms-drawer [name="${{ Title: 'title', 'Button label': 'cta' }[label]}"]`); await f.fill(value); await f.blur(); await p.waitForTimeout(150); };
const closeDrawer = async () => { await click('.cms-drawer-close'); };
// Between steps: every open editor closed, unsaved card edits saved.
const shown = q => p.locator(q).filter({ visible: true }).count();
async function idle() {
  for (let i = 0; i < 8; i++) {
    if (await shown('[data-choice="save"]')) await click('[data-choice="save"]', { wait: 700 });
    else if (await shown('.cms-publish-dialog')) { const b = p.locator('.cms-publish button').filter({ visible: true, hasText: /^(Done|Close|Cancel)$/ }).first(); await b.click(); }
    else if (await shown('.cms-drawer-close')) await click('.cms-drawer-close', { wait: 400 });
    else if (await shown('#cms-admin-panel')) await click('#cms-admin-button', { wait: 400 });
    else return;
    await p.waitForTimeout(200);
  }
}
const step = async (name, fn) => { try { if (p && !p.isClosed()) await idle(); await fn(); } catch (e) { note(name + ' FAILED', clean(e.message).slice(0, 300)); console.log('FAILED', name, e.message.slice(0, 900)); if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/fail-${name.replace(/ /g, '-')}.png` }); } };

async function session(role, size, settle) {
  ctx = await context(browser, { size, answer, storage: { paSidebarCollapsed: '0' } });
  p = await open(ctx, '/', role, settle || 1600);
  return p;
}
async function adminOn() { await panel(true); await click('.cms-admin-switch', { wait: 900 }); }

for (const role of ['guest', 'user']) await step(role, async () => { await session(role); await see(role + ' sees'); note(role + ' scripts', await p.evaluate(() => [...document.scripts].map(s => s.src).filter(s => /\/cms\/(?!content|loader|admin|pages|widgets)/.test(s)).map(s => new URL(s).pathname))); await ctx.close(); });

await session('admin', [1440, 900]);
await step('admin', async () => { await see('admin, off'); await adminOn(); await see('panel, on'); await panel(false); await see('Content Mode'); });
await step('edit a card', async () => {
  await pencil('Edit featured card'); await see('drawer'); await field('Title', 'Edited Title'); await see('typed'); await field('Button label', ''); await see('invalid'); await field('Button label', 'Start'); await click('.cms-drawer-primary[type="submit"]'); await p.waitForTimeout(700); await see('saved'); await stored('first draft'); await closeDrawer(); await see('closed');
});
await step('undo and redo', async () => { await pencil('Edit featured card'); await field('Title', 'Second Title'); await closeDrawer().catch(() => {}); await see('asked'); await click('[data-choice="cancel"]'); await p.keyboard.press('Escape'); await see('escape'); if (await p.locator('[data-choice="discard"]').isVisible()) await click('[data-choice="discard"]'); await see('discarded'); await panel(true); await see('panel'); await btn('Undo'); await see('undone'); await btn('Redo'); await panel(false); await see('redone'); });
await step('saved cards', async () => { await click('.cms-manage-button[data-cms-manage="home.featured"]'); await see('manage'); await btn('Add card'); await see('new saved card'); await field('Title', 'A saved one'); await idle(); await see('kept'); await click('.cms-manage-button[data-cms-manage="home.featured"]'); await btn('Make active'); await see('active'); await click('[data-action="delete"]'); await see('asked to delete'); await btn('Cancel'); await btn('Done'); await see('swapped'); });
await step('carousel', async () => { await click('.cms-manage-button[data-cms-manage="home.carousel"]'); await see('carousel cards'); await click('[data-move="down"]'); await see('moved'); await click('[data-action="delete"]', { nth: 2 }); await click('.cms-manage-danger'); await see('deleted'); await click('.cms-manage-undo'); await see('back'); await click('[data-action="delete"]', { nth: 5 }); await click('.cms-manage-danger'); await btn('Done'); await click('.cms-add-tile'); await see('added'); await field('Title', 'Added tile'); await click('.cms-drawer-primary[type="submit"]'); await p.waitForTimeout(700); await closeDrawer(); await see('in the row'); await stored('cards'); });
await step('site navigation', async () => { await click('.cms-nav-pencil'); await see('site nav'); await click('.cms-nav-pick', { nth: 1 }); const f = p.locator('.cms-nav-dialog input[type="text"], .cms-nav input[type="text"]').first(); await f.fill('All games'); await f.blur(); await see('renamed'); await btn('Save Draft', { wait: 700 }); await see('nav saved'); await idle(); await see('nav closed'); await stored('nav'); });
await step('views', async () => { await panel(true); await btn('User'); await panel(false); await see('as user'); await panel(true); await btn('Guest'); await panel(false); await see('as guest'); await btn('Back to Admin View'); await see('back'); });
await step('publish', async () => { await panel(true); await btn('Publish Changes', { wait: 800 }); await see('review'); await btn('Publish now', { wait: 1200 }); await see('published'); await btn('Done'); await stored('published'); note('cache', await p.evaluate(() => Object.keys(localStorage).filter(k => /cms|nav/.test(k)).sort())); });
await step('layout', async () => {
  await panel(true); await btn('Layout', { wait: 900 }); await see('Layout Mode');
  await p.selectOption('.cms-layout-type', 'feature-spotlight'); await p.selectOption('.cms-layout-region', 'lower'); await btn('Add widget', { wait: 500 }); await see('widget added');
  await p.keyboard.press('ArrowRight'); await see('moved right'); await p.keyboard.press('Shift+ArrowRight'); await see('wider'); await p.keyboard.press('ArrowUp'); await see('refused or moved');
  await btn('Edit card'); await see('its card'); await field('Title', 'New spotlight'); await idle(); await see('its card closed');
  await p.selectOption('.cms-layout-type', 'carousel'); await btn('Add widget', { wait: 500 }); await see('carousel added'); await btn('Manage cards'); await see('its cards'); await btn('Add card'); await see('its new card'); await idle();
  await p.selectOption('.cms-layout-type', 'atlas-navigation'); await btn('Add widget', { wait: 500 }); await see('nav added'); await btn('Earlier on phones'); await see('earlier'); await btn('Remove widget'); await see('removed'); await click('.cms-layout-float button'); await see('undone'); await click('.cms-layout-float button', { nth: 1 }); await see('redone');
  await p.locator('.cms-layout-bar').getByText('Save Draft', { exact: true }).click(); await p.waitForTimeout(800); await see('layout saved'); await stored('layout');
});
await step('conflict', async () => {
  const d = (await answer('second', 'get_draft', { p_page: 'home' })).data.draft, doc = JSON.parse(JSON.stringify(d.content));
  doc.components['home.spotlight'].title = 'Theirs';
  note('second saves', !(await answer('second', 'save_draft', { p_page: 'home', p_content: doc, p_expected_draft_id: d.id })).error);
  await p.locator('.atlas-edit-hit').last().focus(); await p.keyboard.press('ArrowDown'); await see('changed'); await p.locator('.cms-layout-bar').getByText('Save Draft', { exact: true }).click(); await p.waitForTimeout(800); await see('conflict'); await btn('Keep my changes and save', { wait: 900 }); await see('combined'); await stored('combined'); await btn('Done'); await see('Content Mode again');
});
await step('reload', async () => { await pencil('Edit spotlight card'); await field('Title', 'Unsaved over reload'); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1800); await see('reloaded'); await panel(true); await btn('Publish Changes', { wait: 800 }); await see('unsaved asked'); await btn('Publish saved draft only', { wait: 600 }); await see('review 2'); const c = p.locator('.cms-publish-dialog input[type="checkbox"]'); if (await c.filter({ visible: true }).count()) await c.filter({ visible: true }).first().check(); await btn('Publish now', { wait: 1200 }); await see('published 2'); await btn('Done'); await stored('published 2'); });
await step('history', async () => { await panel(true); await btn('Version History', { wait: 900 }); await see('history'); await btn('Restore…', { nth: 0, wait: 400 }); await see('restore?'); await click('.cms-history-dialog .cms-drawer-primary', { wait: 1500 }); await see('restored'); await btn('Done'); await see('after'); await stored('restored'); });
await step('sign out', async () => { await p.evaluate(() => window.__role('guest')); await p.waitForTimeout(900); await see('signed out'); note('working copy', await p.evaluate(() => Object.keys(sessionStorage).sort())); note('errors', ctx.errs); note('calls', [...new Set(ctx.calls)].sort()); await ctx.close(); });
await step('phone', async () => { await session('admin', [390, 844]); await adminOn(); await panel(false); await see('phone'); await pencil('Edit featured card'); await see('phone drawer'); await closeDrawer(); await panel(true); await btn('Layout', { wait: 900 }); await see('phone layout'); note('phone errors', ctx.errs); await ctx.close(); });
await step('guest after', async () => { await session('guest'); await see('guest after'); await p.reload(); await p.waitForTimeout(900); await see('guest cached'); note('guest errors', ctx.errs); await ctx.close(); });
await browser.close();
writeFileSync(process.argv[2], JSON.stringify(log, null, 1));
console.log(log.length, 'notes;', log.filter(l => /FAILED/.test(l[0])).length, 'failed steps');
process.exit(0);
