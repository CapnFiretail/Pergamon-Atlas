// scripts/cms/content.js: document (schema v1) -> render model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const cms = require('../../PergamonAtlas.V1/scripts/cms/content.js');

// The homepage's static copy, loaded the way the browser does.
const sandbox = { window: {} };
vm.runInNewContext(readFileSync(new URL('../../PergamonAtlas.V1/data/home-content.js', import.meta.url), 'utf8'), sandbox);
// JSON round trip: plain objects from this realm (the sandbox has its own Array prototype).
const home = JSON.parse(JSON.stringify(sandbox.window.PergamonHomeContent));
const ctx = { staticImages: home.staticImages };
const clone = o => JSON.parse(JSON.stringify(o));

test('static copy translates to exactly the values the cards used before', () => {
  const m = cms.toModel(home.document, ctx);
  assert.deepEqual(
    { id: m.featured.id, type: m.featured.type, title: m.featured.title, cta: m.featured.cta, href: m.featured.href },
    { id: 'home.featured', type: 'feature', title: 'Chess Forge', cta: 'Play Now', href: '/games/chess-forge/' });
  assert.deepEqual(
    { src: m.featured.art.src, fit: m.featured.art.fit, focus: m.featured.art.focus, focusNarrow: m.featured.art.focusNarrow, zoom: m.featured.art.zoom, w: m.featured.art.width, h: m.featured.art.height },
    { src: '/images/featured/chess-forge.webp', fit: 'cover', focus: '78% 5%', focusNarrow: '88% 12%', zoom: 1, w: 1619, h: 971 });
  assert.match(m.featured.art.srcset, /chess-forge-960\.webp 960w/);
  const s = m.spotlight.art;
  assert.deepEqual(
    { fit: s.fit, scale: s.scale, scaleNarrow: s.scaleNarrow, x: s.x, xNarrow: s.xNarrow, y: s.y, yNarrow: s.yNarrow, base: s.base },
    { fit: 'height', scale: 1.3, scaleNarrow: 1, x: 'calc(50% - 60px)', xNarrow: 'calc(100% - 139px)', y: '50%', yNarrow: '50%', base: '#030916' });
  assert.equal(m.spotlight.type, 'spotlight');
  assert.deepEqual(m.carousel.map(c => [c.id, c.type, c.title, c.category, c.href, c.art]), [
    ['home.carousel.battleship', 'tile', 'Battleship', 'Strategy', '/games/battleship/', null],
    ['home.carousel.breakout', 'tile', 'Breakout', 'Arcade', '/games/breakout/', null],
    ['home.carousel.pong', 'tile', 'Pong', 'Arcade', '/games/pong/', null],
    ['home.carousel.blackjack', 'tile', 'Blackjack', 'Card', '/games/blackjack/', null],
    ['home.carousel.connect-four', 'tile', 'Connect Four', 'Strategy', '/games/connect-four/', null],
    ['home.carousel.snake', 'tile', 'Snake', 'Arcade', '/games/snake/', null]
  ]);
});

test('card types come from component ids, not names', () => {
  assert.equal(cms.cardType('home.featured'), 'feature');
  assert.equal(cms.cardType('home.spotlight'), 'spotlight');
  assert.equal(cms.cardType('home.carousel.anything-new'), 'tile');
  assert.equal(cms.cardType('home.carousel'), null);
  assert.equal(cms.cardType('home.footer'), null);
});

test('positions: numbers become CSS; offsets of either sign; missing parts left to CSS defaults', () => {
  const a = cms.artModel({ source: { static: '/images/featured/x.webp' }, fit: 'height', anchor: { x: 30, offset: 25 }, anchorNarrow: { x: 70 } }, ctx);
  assert.equal(a.x, 'calc(30% + 25px)');
  assert.equal(a.xNarrow, '70%');
  assert.equal(a.y, undefined);
  assert.equal(a.scale, undefined);
  const c = cms.artModel({ source: { static: '/images/featured/x.webp' }, focus: { x: 12.5, y: 0 }, scale: 1.6 }, ctx);
  assert.deepEqual([c.focus, c.focusNarrow, c.zoom, c.zoomNarrow], ['12.5% 0%', undefined, 1.6, 1.6], 'phone zoom follows desktop unless set');
  const d = cms.artModel({ source: { static: '/images/featured/x.webp' }, scale: 1.6, scaleNarrow: 1.1 }, ctx);
  assert.deepEqual([d.zoom, d.zoomNarrow], [1.6, 1.1], 'independent phone zoom');
});

test('uploaded media resolves through the caller-provided map; unresolved media shows no image', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const art = { source: { media: id }, focus: { x: 50, y: 40 } };
  assert.equal(cms.artModel(art, ctx), null, 'no URL yet');
  const m = cms.artModel(art, { ...ctx, media: { [id]: { url: 'https://example.test/m.webp', width: 800, height: 600 } } });
  assert.deepEqual([m.src, m.width, m.height, m.focus], ['https://example.test/m.webp', 800, 600, '50% 40%']);
  const doc = clone(home.document);
  doc.components['home.carousel.pong'].art = art;
  doc.components['home.spotlight'].art.source = { media: id };
  assert.deepEqual(cms.mediaIds(doc), [id]);
});

test('unsafe or malformed values never reach CSS', () => {
  const a = cms.artModel({ source: { static: '/images/featured/x.webp' }, fit: 'height', base: 'red;background:url(x)', anchor: { x: 'calc(1px)' }, scale: '2' }, ctx);
  assert.equal(a.base, undefined);
  assert.equal(a.x, undefined);
  assert.equal(a.scale, undefined);
  const c = cms.artModel({ source: { static: '/x.webp' }, focus: { x: '1;color:red', y: 2 } }, ctx);
  assert.equal(c.focus, undefined);
});

test('wrong schema or shape -> null (caller keeps its fallback); missing cards are simply absent', () => {
  assert.equal(cms.toModel(null, ctx), null);
  assert.equal(cms.toModel({ schema: 2, components: {} }, ctx), null);
  assert.equal(cms.toModel({ schema: 1 }, ctx), null);
  const doc = clone(home.document);
  delete doc.components['home.spotlight'];
  doc.components['home.carousel'].order.push('ghost');
  const m = cms.toModel(doc, ctx);
  assert.equal(m.spotlight, null);
  assert.equal(m.carousel.length, 6, 'ids without a component are skipped');
});
