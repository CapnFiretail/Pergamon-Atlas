// CMS content translation: a stored content document (schema v1, see
// docs/cms/ARCHITECTURE.md) -> the render model scripts/home.js draws.
//
// The document keeps positions as numbers (percent / px); this is the only
// place they become CSS. Card identity is the component id
// (home.featured, home.spotlight, home.carousel.<id>); card type comes from
// the id's pattern, never from game names. Works in the browser
// (window.PergamonCMS.content) and in Node (module.exports) for tests.
(function (root) {
  'use strict';

  const SCHEMA = 1;
  const CAROUSEL = 'home.carousel';
  const CARD_TYPES = { 'home.featured': 'feature', 'home.spotlight': 'spotlight' };

  // Card type for a component id, or null if it isn't a card.
  function cardType(id) {
    if (CARD_TYPES[id]) return CARD_TYPES[id];
    if (typeof id === 'string' && id.indexOf(CAROUSEL + '.') === 0) return 'tile';
    return null;
  }

  const isNum = n => typeof n === 'number' && isFinite(n);
  const pct = n => n + '%';
  const point = p => (p && isNum(p.x) && isNum(p.y) ? pct(p.x) + ' ' + pct(p.y) : undefined);
  // anchor {x: percent, offset: px} -> "50%" or "calc(50% - 60px)"
  function anchorX(a) {
    if (!a || !isNum(a.x)) return undefined;
    const off = isNum(a.offset) ? a.offset : 0;
    return off ? 'calc(' + pct(a.x) + (off < 0 ? ' - ' : ' + ') + Math.abs(off) + 'px)' : pct(a.x);
  }
  const anchorY = a => (a && isNum(a.y) ? pct(a.y) : undefined);

  // Image model for the renderer, or null when there is no usable image.
  // ctx.staticImages: { path: { srcset, width, height } }
  // ctx.media: { mediaId: { url, width, height } }   (resolved by the caller)
  function artModel(art, ctx) {
    if (!art || !art.source) return null;
    ctx = ctx || {};
    let src, info = {};
    if (art.source.static) {
      src = art.source.static;
      info = (ctx.staticImages && ctx.staticImages[src]) || {};
    } else if (art.source.media) {
      const m = ctx.media && ctx.media[art.source.media];
      if (!m || !m.url) return null;
      src = m.url;
      info = { width: m.width, height: m.height };
    } else {
      return null;
    }
    const fit = art.fit === 'height' ? 'height' : 'cover';
    const out = {
      src: src,
      srcset: info.srcset,
      width: info.width,
      height: info.height,
      alt: typeof art.alt === 'string' ? art.alt : '',
      fit: fit
    };
    if (fit === 'cover') {
      out.focus = point(art.focus);
      out.focusNarrow = point(art.focusNarrow);
      out.zoom = isNum(art.scale) ? art.scale : 1;
      out.zoomNarrow = isNum(art.scaleNarrow) ? art.scaleNarrow : out.zoom;
    } else {
      out.scale = isNum(art.scale) ? art.scale : undefined;
      out.scaleNarrow = isNum(art.scaleNarrow) ? art.scaleNarrow : undefined;
      out.x = anchorX(art.anchor);
      out.xNarrow = anchorX(art.anchorNarrow);
      out.y = anchorY(art.anchor);
      out.yNarrow = anchorY(art.anchorNarrow);
      out.base = typeof art.base === 'string' && /^#[0-9a-fA-F]{6}$/.test(art.base) ? art.base : undefined;
    }
    return out;
  }

  function cardModel(id, c, ctx) {
    if (!c || typeof c !== 'object') return null;
    const type = cardType(id);
    const model = { id: id, type: type, title: String(c.title || ''), href: String(c.href || ''), art: artModel(c.art, ctx) };
    if (type === 'tile') model.category = String(c.category || '');
    else model.cta = String(c.cta || '');
    return model;
  }

  // Document -> { featured, spotlight, carousel: [tile models in order] }.
  // A malformed or unknown-schema document returns null so the caller can
  // fall back to the static copy.
  function toModel(doc, ctx) {
    if (!doc || doc.schema !== SCHEMA || !doc.components || typeof doc.components !== 'object') return null;
    const comps = doc.components;
    const order = (comps[CAROUSEL] && Array.isArray(comps[CAROUSEL].order)) ? comps[CAROUSEL].order : [];
    return {
      featured: cardModel('home.featured', comps['home.featured'], ctx),
      spotlight: cardModel('home.spotlight', comps['home.spotlight'], ctx),
      carousel: order
        .map(cardId => cardModel(CAROUSEL + '.' + cardId, comps[CAROUSEL + '.' + cardId], ctx))
        .filter(Boolean)
    };
  }

  // Defence in depth for documents arriving from the network or a cache. The
  // server (validate_content) is the real gate; this mirrors its essentials so
  // a bad or tampered document can't put an external link, script URL or
  // unexpected image on the page. Returns true only for a usable document.
  const INTERNAL_PATH = /^\/(?!\/)[a-z0-9\/_-]*$/i;         // site path: no scheme, no //, no query
  const STATIC_IMAGE = /^\/images\/featured\/[a-z0-9][a-z0-9-]{0,63}\.(webp|png|jpg)$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const CARD_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const isText = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[<>]/.test(s);
  function validArt(a) {
    if (a === undefined || a === null) return true;
    if (typeof a !== 'object' || !a.source || typeof a.source !== 'object') return false;
    if (a.source.static !== undefined) return typeof a.source.static === 'string' && STATIC_IMAGE.test(a.source.static) && a.source.media === undefined;
    return typeof a.source.media === 'string' && UUID.test(a.source.media);
  }
  function validCard(c, tile) {
    if (!c || typeof c !== 'object') return false;
    if (!isText(c.title, tile ? 40 : 60) || typeof c.href !== 'string' || !INTERNAL_PATH.test(c.href)) return false;
    if (tile ? !isText(c.category, 40) : !isText(c.cta, 24)) return false;
    return validArt(c.art);
  }
  function validateDocument(doc) {
    if (!doc || doc.schema !== SCHEMA || !doc.components || typeof doc.components !== 'object') return false;
    const comps = doc.components;
    if (!validCard(comps['home.featured'], false) || !validCard(comps['home.spotlight'], false)) return false;
    const carousel = comps[CAROUSEL];
    if (!carousel || !Array.isArray(carousel.order) || carousel.order.length > 24) return false;
    return carousel.order.every(id => typeof id === 'string' && CARD_ID.test(id) && validCard(comps[CAROUSEL + '.' + id], true));
  }

  // Media ids a document references (for resolving image URLs).
  function mediaIds(doc) {
    const ids = [];
    const comps = (doc && doc.components) || {};
    Object.keys(comps).forEach(k => {
      const a = comps[k] && comps[k].art;
      if (a && a.source && a.source.media && ids.indexOf(a.source.media) < 0) ids.push(a.source.media);
    });
    return ids;
  }

  const api = { SCHEMA: SCHEMA, CAROUSEL: CAROUSEL, cardType: cardType, artModel: artModel, cardModel: cardModel, toModel: toModel, mediaIds: mediaIds, validateDocument: validateDocument };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.content = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
