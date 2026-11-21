// CMS content translation: a stored content document (schema v1, see
// docs/cms/ARCHITECTURE.md) -> the render model scripts/home.js draws.
//
// The document keeps positions as numbers (percent / px); this is the only
// place they become CSS. Card identity is the component id; card type comes
// from the id's pattern, never from game names:
//   home.featured, home.spotlight            the active cards (what visitors see)
//   home.featured.saved.<key>, …spotlight…   saved cards, listed in order by
//                                            home.featured.saved / home.spotlight.saved
//   home.carousel.<key>                      carousel cards, in home.carousel's order
// Works in the browser (window.PergamonCMS.content) and in Node
// (module.exports) for tests.
(function (root) {
  'use strict';

  const SCHEMA = 1;
  const CAROUSEL = 'home.carousel';
  const SLOTS = ['home.featured', 'home.spotlight'];
  const CARD_TYPES = { 'home.featured': 'feature', 'home.spotlight': 'spotlight' };
  // Collection sizes. The server (validate_content, 0008 / 0012) enforces
  // the same numbers.
  const LIMITS = { saved: 12, carousel: 24 };
  const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;

  // A slot's saved-card list, and one saved card's id.
  const savedList = slot => slot + '.saved';
  const savedId = (slot, key) => slot + '.saved.' + key;
  // The slot a saved card belongs to (home.featured.saved.x → home.featured).
  function slotOf(id) {
    if (typeof id !== 'string') return null;
    return SLOTS.find(s => id === s || (id.indexOf(s + '.saved.') === 0 && KEY.test(id.slice(s.length + 7)))) || null;
  }
  const isSaved = id => !!slotOf(id) && id.indexOf('.saved.') > 0;
  // The ordered list a card is part of (carousel or saved), or null for an active card.
  function listOf(id) {
    if (isSaved(id)) return savedList(slotOf(id));
    if (typeof id === 'string' && id.indexOf(CAROUSEL + '.') === 0) return CAROUSEL;
    return null;
  }

  // Card type for a component id, or null if it isn't a card.
  function cardType(id) {
    if (CARD_TYPES[id]) return CARD_TYPES[id];
    if (isSaved(id)) return CARD_TYPES[slotOf(id)];
    if (typeof id === 'string' && id.indexOf(CAROUSEL + '.') === 0) return 'tile';
    return null;
  }

  // A new card key from its title, unique among `taken` (keys or ids ending in them).
  function newKey(title, taken) {
    const used = new Set((taken || []).map(t => String(t).split('.').pop()));
    const base = String(title || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34).replace(/-+$/, '') || 'card';
    let key = base, n = 2;
    while (used.has(key)) key = `${base}-${n++}`;
    return key;
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

  // Keys listed by an ordered component ({ order: [...] }), [] when absent.
  const orderOf = (comps, list) => (comps[list] && Array.isArray(comps[list].order) ? comps[list].order : []);

  // Document -> { featured, spotlight, carousel: [tile models in order],
  // saved: { 'home.featured': [models], 'home.spotlight': [models] } }.
  // Visitors' documents have no saved cards (the server leaves them out).
  // A malformed or unknown-schema document returns null so the caller can
  // fall back to the static copy.
  function toModel(doc, ctx) {
    if (!doc || doc.schema !== SCHEMA || !doc.components || typeof doc.components !== 'object') return null;
    const comps = doc.components;
    const saved = {};
    SLOTS.forEach(slot => {
      saved[slot] = orderOf(comps, savedList(slot)).map(key => cardModel(savedId(slot, key), comps[savedId(slot, key)], ctx)).filter(Boolean);
    });
    return {
      featured: cardModel('home.featured', comps['home.featured'], ctx),
      spotlight: cardModel('home.spotlight', comps['home.spotlight'], ctx),
      carousel: orderOf(comps, CAROUSEL)
        .map(cardId => cardModel(CAROUSEL + '.' + cardId, comps[CAROUSEL + '.' + cardId], ctx))
        .filter(Boolean),
      saved: saved
    };
  }

  // Defence in depth for documents arriving from the network or a cache. The
  // server (validate_content) is the real gate; this mirrors its essentials so
  // a bad or tampered document can't put an external link, script URL or
  // unexpected image on the page. Returns true only for a usable document.
  const INTERNAL_PATH = /^\/(?!\/)[a-z0-9\/_-]*$/i;         // site path: no scheme, no //, no query
  const STATIC_IMAGE = /^\/images\/featured\/[a-z0-9][a-z0-9-]{0,63}\.(webp|png|jpg)$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const CARD_ID = KEY;
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
    if (!carousel || !Array.isArray(carousel.order) || carousel.order.length > LIMITS.carousel) return false;
    if (!carousel.order.every(id => typeof id === 'string' && CARD_ID.test(id) && validCard(comps[CAROUSEL + '.' + id], true))) return false;
    // Saved cards (administrators' documents only): a list per slot, a card per listed key.
    return SLOTS.every(slot => {
      const list = comps[savedList(slot)];
      if (list === undefined) return true;
      return !!list && Array.isArray(list.order) && list.order.length <= LIMITS.saved &&
        new Set(list.order).size === list.order.length &&
        list.order.every(key => typeof key === 'string' && CARD_ID.test(key) && validCard(comps[savedId(slot, key)], false));
    });
  }

  // ── Editable fields (the card editor's declarative schema) ──────────────
  // One list per card type; the editor draws whatever the selected card's
  // type lists, in order. `ifPresent` fields appear only when the card already
  // has that field (schema v1 cards have no description, so it stays hidden).
  // Limits and rules mirror the server's validate_content (0008), which has
  // the final say.
  const CATEGORIES = ['Strategy', 'Arcade', 'Classic', 'Card'];
  const TITLE = max => ({ key: 'title', label: 'Title', type: 'text', max: max });
  const DESCRIPTION = { key: 'description', label: 'Description', type: 'textarea', max: 160, ifPresent: true };
  const LINK = (gamesOnly) => ({ key: 'href', label: 'Destination link', type: 'link', gamesOnly: gamesOnly });
  // The image slot (card.art): upload / replace, framing per layout (desktop
  // and phone, see scripts/cms/images.js) and the slot's own small fields
  // (`parts`: keys inside art; a part with `fit` shows only for art drawn
  // that way). `fit` is how a newly added image is drawn; an existing image
  // keeps its own. Below recommendedWidth the editor warns the image may look soft.
  const ALT = { key: 'alt', label: 'Image description', type: 'text', max: 140, optional: true,
    hint: 'For screen readers. Leave empty if the image is decorative.' };
  const EDGE = { key: 'base', label: 'Edge colour', type: 'color', fit: 'height',
    hint: 'Fills the card beside the image and blends into its faded edges.' };
  const IMAGE = (recommendedWidth, parts) => ({ key: 'art', label: 'Image', type: 'image', fit: 'cover', recommendedWidth: recommendedWidth, parts: parts });
  const CARD_FIELDS = {
    feature: [TITLE(60), DESCRIPTION, { key: 'cta', label: 'Button label', type: 'text', max: 24 }, LINK(false), IMAGE(1600, [ALT])],
    spotlight: [TITLE(60), DESCRIPTION, { key: 'cta', label: 'Button label', type: 'text', max: 24 }, LINK(false), IMAGE(1200, [EDGE, ALT])],
    // Tiles are drawn only for live games, so their links pick a game.
    tile: [TITLE(40), DESCRIPTION, { key: 'category', label: 'Category', type: 'choice', options: CATEGORIES }, LINK(true), IMAGE(400, [ALT])]
  };

  // The fields to edit for one card (component = its current content).
  function cardFields(id, component) {
    const fields = CARD_FIELDS[cardType(id)] || [];
    return fields.filter(f => !f.ifPresent || (component && Object.prototype.hasOwnProperty.call(component, f.key)));
  }

  // Site path the server could accept as a destination: lower-case segments, ending in "/".
  const ROUTE_PATH = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*\/$/;
  const CONTROL = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;

  // A field value's problem, as a sentence for the editor, or null if it's fine.
  function checkField(field, value) {
    if (typeof value !== 'string') return 'Enter a value.';
    if (field.type === 'link') {
      if (!value) return 'Choose where the card leads.';
      if (!ROUTE_PATH.test(value)) return 'Use a site path such as /games/chess-forge/ (lower-case, starting and ending with “/”).';
      return null;
    }
    if (field.type === 'choice') return field.options.indexOf(value) < 0 ? 'Choose one of the listed options.' : null;
    if (field.type === 'color') return /^#[0-9a-fA-F]{6}$/.test(value) ? null : 'Use a colour written like #030916.';
    if (!value.trim()) return field.optional ? null : `${field.label} can’t be empty.`;
    if (value.length > field.max) return `Use at most ${field.max} characters (now ${value.length}).`;
    if (/[<>]/.test(value)) return 'The characters < and > aren’t allowed.';
    if (CONTROL.test(value)) return 'Remove line breaks and other invisible control characters.';
    return null;
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

  const api = {
    SCHEMA: SCHEMA, CAROUSEL: CAROUSEL, SLOTS: SLOTS, LIMITS: LIMITS, CATEGORIES: CATEGORIES,
    cardType: cardType, slotOf: slotOf, isSaved: isSaved, listOf: listOf, savedList: savedList, savedId: savedId, newKey: newKey,
    artModel: artModel, cardModel: cardModel, toModel: toModel, mediaIds: mediaIds, validateDocument: validateDocument,
    cardFields: cardFields, checkField: checkField
  };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.content = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
