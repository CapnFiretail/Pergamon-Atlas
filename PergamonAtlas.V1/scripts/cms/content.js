// CMS content translation: a stored content document (see
// docs/cms/ARCHITECTURE.md §3, §11) -> the render model scripts/page.js draws.
//
// The document keeps positions as numbers (percent / px); this is the only
// place they become CSS. A page document (schema 2) is regions of widget
// instances, any number of each type, whose content is under
// '<prefix>.<instance>' (the page's prefix, scripts/cms/pages.js):
//   '<prefix>.<instance>'               a card or fields, or an ordered list ('list')
//   '<prefix>.<instance>.saved'         a card widget's saved cards, in order
//   '<prefix>.<instance>.saved.<key>'   one of them
//   '<prefix>.<instance>.<key>'         a list widget's card
// What an id means depends on the document's instances, so the functions that
// answer about an id also take the documents to look in (the first that knows
// it answers; without any, the page's built-in layout). Which types there are
// and what each holds is scripts/cms/widgets.js; no type is named here.
//
// Schema 1 is the homepage's original shape: the fixed slots home.featured,
// home.spotlight (each with saved cards) and home.carousel. It is upgraded for
// drawing and editing; the stored document is never changed.
//
// forPage(id) gives these functions for one page. The api itself is the page
// this document is (data-atlas-page), or the homepage's where there is none.
// Works in the browser (window.PergamonCMS.content) and in Node
// (module.exports) for tests.
(function (root) {
  'use strict';

  const NODE = typeof module !== 'undefined' && module.exports;
  const pages = NODE ? require('./pages.js') : root.PergamonCMS.pages;
  const widgets = NODE ? require('./widgets.js') : root.PergamonCMS.widgets;

  const SCHEMA = 1;
  // Schema 1's slots.
  const CAROUSEL = 'home.carousel';
  const SLOTS = ['home.featured', 'home.spotlight'];
  // Collection sizes. The server (validate_content, 0008 / 0012) enforces
  // the same numbers.
  const LIMITS = { saved: 12, carousel: 24 };
  const KEY = /^[a-z0-9][a-z0-9-]{0,39}$/;

  // A slot's saved-card list, and one saved card's id.
  const savedList = slot => slot + '.saved';
  const savedId = (slot, key) => slot + '.saved.' + key;

  // A new card key from its title, unique among `taken` (keys or ids ending in
  // them). "saved" is never one: it names an instance's saved list.
  function newKey(title, taken) {
    const used = new Set((taken || []).map(t => String(t).split('.').pop()).concat('saved'));
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

  // Keys listed by an ordered component ({ order: [...] }), [] when absent.
  const orderOf = (comps, list) => (comps[list] && Array.isArray(comps[list].order) ? comps[list].order : []);

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
  function validateDocumentV1(doc) {
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
    tile: [TITLE(40), DESCRIPTION, { key: 'category', label: 'Category', type: 'choice', options: CATEGORIES }, LINK(true), IMAGE(400, [ALT])],
    // A choice may name its options: { value, label }.
    heading: [
      TITLE(40),
      { key: 'subtitle', label: 'Subtitle', type: 'text', max: 40, optional: true, hint: 'Left out on narrow screens.' },
      { key: 'emblem', label: 'Emblem', type: 'choice', options: [{ value: 'games', label: 'Games' }, { value: 'compass', label: 'Compass' }, { value: 'none', label: 'None' }] },
      { key: 'count', label: 'Count', type: 'choice', options: [{ value: 'none', label: 'None' }, { value: 'cards', label: 'Cards shown on this page' }], hint: 'Counted as the page is drawn. Left out on narrow screens.' },
      { key: 'countLabel', label: 'Count label', type: 'text', max: 16, optional: true }
    ]
  };
  const optionValues = field => field.options.map(o => (o && typeof o === 'object' ? o.value : o));
  // A 'single' widget's fields: only the listed ones, each valid.
  function validFields(c, kind) {
    const fields = CARD_FIELDS[kind];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
    return Object.keys(c).every(k => fields.some(f => f.key === k)) &&
      fields.every(f => (c[f.key] === undefined ? !!f.optional || !!f.ifPresent : !checkField(f, c[f.key]) && c[f.key] !== ''));
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
    if (field.type === 'choice') return optionValues(field).indexOf(value) < 0 ? 'Choose one of the listed options.' : null;
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

  // ── Schema 2: the page as grid regions of widget instances (H5.3) ───────
  // Admin Mode's Layout Mode edits these; a schema-1 document becomes schema 2
  // with its first layout change. The server's rules are 0014's
  // cms_validate_home_v2; these mirror them.
  //   { schema: 2,
  //     regions: [{ id, frame?, rowHeight?, widgets: [{ id, type, col, row, cols, rows }] }],
  //     components: { '<prefix>.<instance>': … } }
  // An instance's content lives under '<prefix>.<instance id>': what it is
  // follows from its type (scripts/cms/widgets.js).
  const PAGE_SCHEMA = 2;
  const PAGE_LIMITS = { regions: 4, widgets: 24, columns: 20, rows: 400, minRowHeight: 8, maxRowHeight: 400 };
  const WIDGET_TYPES = widgets.types;
  const REGION_ID = /^[a-z][a-z0-9-]{0,31}$/;
  const FRAMES = ['sidebar'];
  // Only the listed fields, and every required one (the server's cms_check_keys).
  const keysOk = (o, allowed, required) => !!o && typeof o === 'object' && !Array.isArray(o) &&
    Object.keys(o).every(k => allowed.indexOf(k) >= 0) && required.every(k => k in o);
  const isInt = (n, lo, hi) => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  // An ordered list of ids under `listKey`, each with a card under prefix + id.
  function validList(comps, listKey, prefix, max, tile) {
    const list = comps[listKey];
    if (!list || !Array.isArray(list.order) || list.order.length > max || new Set(list.order).size !== list.order.length) return false;
    if (!list.order.every(k => typeof k === 'string' && CARD_ID.test(k) && !(tile && k === 'saved') && validCard(comps[prefix + k], tile))) return false;
    return Object.keys(comps).every(k => k.indexOf(prefix) !== 0 || list.order.indexOf(k.slice(prefix.length)) >= 0);
  }
  // The id of a document's layout in lists of changed components (no
  // component has it: an instance's starts with its page's prefix).
  const LAYOUT = 'page.layout';
  const named = f => Object.fromEntries(WIDGET_TYPES.map(t => [t, widgets.get(t)[f]]));
  const WIDGET_NAMES = named('name'), BASE_IDS = named('baseId');
  // A widget's name in the editor: its type, and what tells it apart.
  function instanceLabel(id, type) {
    const name = WIDGET_NAMES[type] || type, base = BASE_IDS[type];
    if (id === base) return name;
    const n = base && id.indexOf(base + '-') === 0 ? id.slice(base.length + 1) : '';
    return /^[0-9]+$/.test(n) ? `${name} ${n}` : `${name} (${id})`;
  }
  const regionLabel = r => (r.frame === 'sidebar' ? 'Upper area, beside the sidebar' : r.id === 'lower' ? 'Lower area, full width' : r.id.charAt(0).toUpperCase() + r.id.slice(1) + ' area');
  // What a new instance starts with (undefined: it has no content of its own).
  function starterContent(type, game) {
    if (widgets.isList(type)) return { order: [] };
    if (!widgets.hasCard(type)) return undefined;
    if (!widgets.hasSaved(type)) return Object.assign({}, widgets.get(type).starter);
    return { title: widgets.get(type).starter, cta: 'Play Now', href: (game && game.path) || '/games/' };
  }

  // ── One page ────────────────────────────────────────────────────────────
  function forPage(id) {
    const page = pages.get(id);
    if (!page) throw new Error('unknown page: ' + id);

    const PREFIX = page.prefix + '.';
    const instanceKey = id => PREFIX + id;
    // A component that is some instance's (not a site-wide setting).
    const isInstanceKey = key => typeof key === 'string' && key.indexOf(PREFIX) === 0;
    // Site-wide settings kept in this page's document.
    const siteKeys = page.siteNavigation ? ['site.sidebar'] : [];

    // The instance and part an id names (componentOwner), in the first of
    // `docs` that has it; without documents, in the page's built-in layout.
    function ownerOf(id, docs) {
      const list = (docs || []).filter(Boolean);
      if (!list.length) list.push(null);
      for (const doc of list) {
        const owner = componentOwner(doc && doc.schema === PAGE_SCHEMA ? doc : { regions: page.regions() }, id);
        if (owner) return owner;
      }
      return null;
    }
    // The slot a feature card belongs to, itself or as a saved card
    // (home.featured.saved.x → home.featured).
    function slotOf(id, ...docs) {
      const o = ownerOf(id, docs);
      return o && widgets.hasSaved(o.type) && (o.part === '' || o.part === 'saved-card') ? instanceKey(o.instance) : null;
    }
    const isSaved = (id, ...docs) => { const o = ownerOf(id, docs); return !!o && o.part === 'saved-card'; };
    // The ordered list a card is part of (carousel or saved), or null for an active card.
    function listOf(id, ...docs) {
      const o = ownerOf(id, docs);
      if (!o) return null;
      return o.part === 'saved-card' ? savedList(instanceKey(o.instance)) : o.part === 'card' ? instanceKey(o.instance) : null;
    }

    // Card type for a component id, or null if it isn't a card.
    function cardType(id, ...docs) {
      const o = ownerOf(id, docs);
      if (!o) return null;
      const w = widgets.get(o.type);
      const isCard = widgets.isList(o.type) ? o.part === 'card' : o.part === '' || o.part === 'saved-card';
      return isCard ? w.card : null;
    }

    // What a card is called ("Carousel card"), and said of its link.
    const typeOf = (id, docs) => (ownerOf(id, docs) || {}).type;
    const cardLabel = (id, ...docs) => widgets.cardLabel(cardType(id, ...docs), typeOf(id, docs));
    const linkHint = (id, ...docs) => widgets.linkHint(cardType(id, ...docs), typeOf(id, docs));

    function cardModel(id, c, ctx, kind) {
      if (!c || typeof c !== 'object') return null;
      const type = kind || cardType(id);
      if (type === 'heading') return Object.assign({}, c, { id: id, type: type, title: String(c.title || '') });
      const model = { id: id, type: type, title: String(c.title || ''), href: String(c.href || ''), art: artModel(c.art, ctx) };
      if (type === 'tile') model.category = String(c.category || '');
      else model.cta = String(c.cta || '');
      return model;
    }

    // Document (schema 1 or 2) -> the render model:
    //   { regions,                       the page's grid regions (schema 1: the built-in layout)
    //     instances: { id: { type, card?, saved?, cards? } },
    //     featured, spotlight, carousel, saved }   schema 1's slots, as before
    // Card widgets have a card and saved cards; list widgets their cards in
    // order; the others nothing. Visitors' documents have no saved cards
    // (the server leaves them out). Schema-1 documents are upgraded here for
    // drawing only: the stored document is never changed. A malformed or
    // unknown-schema document returns null so the caller can fall back.
    function toModel(doc, ctx) {
      const d = upgradeDocument(doc);
      if (!d || !d.components || typeof d.components !== 'object' || !Array.isArray(d.regions)) return null;
      const comps = d.components, instances = {};
      d.regions.forEach(region => (region.widgets || []).forEach(w => {
        const key = instanceKey(w.id);
        const kind = (widgets.get(w.type) || {}).card;
        if (widgets.hasCard(w.type)) {
          instances[w.id] = {
            type: w.type,
            card: cardModel(key, comps[key], ctx, kind),
            saved: orderOf(comps, key + '.saved').map(k => cardModel(key + '.saved.' + k, comps[key + '.saved.' + k], ctx, kind)).filter(Boolean)
          };
        } else if (widgets.isList(w.type)) {
          instances[w.id] = { type: w.type, cards: orderOf(comps, key).map(k => cardModel(key + '.' + k, comps[key + '.' + k], ctx, kind)).filter(Boolean) };
        } else instances[w.id] = { type: w.type };
      }));
      const inst = id => instances[id] || {};
      return {
        regions: JSON.parse(JSON.stringify(d.regions)),
        instances,
        featured: inst('featured').card || null,
        spotlight: inst('spotlight').card || null,
        carousel: inst('carousel').cards || [],
        saved: { 'home.featured': inst('featured').saved || [], 'home.spotlight': inst('spotlight').saved || [] }
      };
    }

    // Either schema: schema 2 is checked by validatePageDocument (with the grid
    // rules when scripts/grid is on the page).
    function validateDocument(doc) {
      if (doc && page.schemas.indexOf(doc.schema) < 0) return false;
      if (doc && doc.schema === PAGE_SCHEMA) {
        const G = root.PergamonGrid;
        return validatePageDocument(doc, G && G.validatePage && G.widgetTypes ? { grid: { validatePage: G.validatePage, types: G.widgetTypes.types } } : null);
      }
      return validateDocumentV1(doc);
    }

    // The fields to edit for one card (component = its current content).
    function cardFields(id, component, ...docs) {
      const fields = CARD_FIELDS[cardType(id, ...docs)] || [];
      return fields.filter(f => !f.ifPresent || (component && Object.prototype.hasOwnProperty.call(component, f.key)));
    }

    // A schema-1 document as schema 2 (the same components, the built-in layout).
    // Schema-2 documents are returned as they are.
    function upgradeDocument(doc) {
      if (!doc || doc.schema === PAGE_SCHEMA) return doc;
      if (page.schemas.indexOf(SCHEMA) < 0 || doc.schema !== SCHEMA || !doc.components || typeof doc.components !== 'object') return null;
      return { schema: PAGE_SCHEMA, regions: page.regions(), components: Object.assign({}, doc.components) };
    }
    // Where a component belongs: { instance, type, part } — part '' (the
    // instance's own content), 'saved' (its saved list), 'saved-card', 'card'
    // (a carousel card) — or null.
    function componentOwner(doc, key) {
      if (!isInstanceKey(key)) return null;
      const id = key.slice(PREFIX.length).split('.')[0], rest = key.slice(PREFIX.length + id.length);
      let w = null;
      (doc.regions || []).some(r => (w = (r.widgets || []).find(x => x.id === id)));
      if (!w || !widgets.hasContent(w.type)) return null;             // no content of its own
      if (rest === '') return { instance: id, type: w.type, part: '' };
      if (widgets.hasSaved(w.type)) {
        if (rest === '.saved') return { instance: id, type: w.type, part: 'saved' };
        if (rest.indexOf('.saved.') === 0 && KEY.test(rest.slice(7))) return { instance: id, type: w.type, part: 'saved-card' };
      }
      if (widgets.isList(w.type) && rest[0] === '.' && KEY.test(rest.slice(1))) return { instance: id, type: w.type, part: 'card' };
      return null;
    }

    // Schema-2 document check (structure and content; grid rules too when
    // opts.grid = { validatePage, types } is given: overlaps, bounds, minimums).
    function validatePageDocument(doc, opts) {
      if (!keysOk(doc, ['schema', 'regions', 'components'], ['schema', 'regions', 'components'])) return false;
      if (doc.schema !== PAGE_SCHEMA || !doc.components || typeof doc.components !== 'object' || !Array.isArray(doc.regions)) return false;
      if (!doc.regions.length || doc.regions.length > PAGE_LIMITS.regions) return false;
      const comps = doc.components, regionIds = new Set(), ids = new Set();
      for (const r of doc.regions) {
        if (!keysOk(r, ['id', 'frame', 'rowHeight', 'stack', 'widgets'], ['id', 'widgets'])) return false;
        if (!REGION_ID.test(r.id) || regionIds.has(r.id) || !Array.isArray(r.widgets)) return false;
        if (r.frame !== undefined && FRAMES.indexOf(r.frame) < 0) return false;
        if (r.rowHeight !== undefined && !(typeof r.rowHeight === 'number' && r.rowHeight >= PAGE_LIMITS.minRowHeight && r.rowHeight <= PAGE_LIMITS.maxRowHeight)) return false;
        regionIds.add(r.id);
        // An authored stacking order lists every widget of the region once.
        if (r.stack !== undefined) {
          const ids = r.widgets.map(w => w && w.id);
          if (!Array.isArray(r.stack) || r.stack.length !== ids.length || new Set(r.stack).size !== r.stack.length || !r.stack.every(id => ids.indexOf(id) >= 0)) return false;
        }
        for (const w of r.widgets) {
          if (!keysOk(w, ['id', 'type', 'col', 'row', 'cols', 'rows'], ['id', 'type', 'col', 'row', 'cols', 'rows'])) return false;
          if (!KEY.test(w.id) || ids.has(w.id) || WIDGET_TYPES.indexOf(w.type) < 0) return false;
          if (!['col', 'row', 'cols', 'rows'].every(f => isInt(w[f], 1, PAGE_LIMITS.rows))) return false;
          if (w.col + w.cols - 1 > PAGE_LIMITS.columns || w.row + w.rows - 1 > PAGE_LIMITS.rows) return false;
          ids.add(w.id);
          const key = instanceKey(w.id);
          if (widgets.hasCard(w.type) && !widgets.hasSaved(w.type)) {
            if (!validFields(comps[key], widgets.get(w.type).card)) return false;
          } else if (widgets.hasCard(w.type)) {
            if (!validCard(comps[key], false)) return false;
            // Saved cards: all listed, or none at all.
            if (comps[key + '.saved'] !== undefined ? !validList(comps, key + '.saved', key + '.saved.', LIMITS.saved, false)
              : Object.keys(comps).some(k => k.indexOf(key + '.saved.') === 0)) return false;
          } else if (widgets.isList(w.type)) {
            if (!validList(comps, key, key + '.', LIMITS.carousel, true)) return false;
          }
        }
      }
      if (ids.size > PAGE_LIMITS.widgets) return false;
      // Every component belongs to an instance (or is a site-wide setting kept here).
      if (!Object.keys(comps).every(k => siteKeys.indexOf(k) >= 0 || !!componentOwner(doc, k))) return false;
      if (opts && opts.grid && opts.grid.validatePage(doc, opts.grid.types).length) return false;
      return true;
    }

    // ── Widget instances (Layout Mode) ──────────────────────────────────────
    const regionsOf = doc => { const d = doc && doc.regions ? doc : upgradeDocument(doc); return d && Array.isArray(d.regions) ? d.regions : []; };
    // Every placed widget: [{ id, type, region, widget }].
    const instancesOf = doc => [].concat(...regionsOf(doc).map(r => (r.widgets || []).map(w => ({ id: w.id, type: w.type, region: r.id, widget: w }))));
    // An id for a new widget ('featured', 'featured-2', …), unused in every
    // given document: a widget removed but still saved or published keeps its
    // id to itself, so a new one is never taken for it.
    function newInstanceId(type, ...docs) {
      const used = new Set([].concat(...docs.map(instancesOf)).map(i => i.id));
      let id = BASE_IDS[type], n = 2;
      while (used.has(id)) id = `${BASE_IDS[type]}-${n++}`;
      return id;
    }
    // The ordered lists a document has: each card widget's saved cards, each list widget's cards.
    const listsOf = doc => [].concat(...instancesOf(doc).map(i => (widgets.isList(i.type) ? [instanceKey(i.id)] : widgets.hasSaved(i.type) ? [savedList(instanceKey(i.id))] : [])));
    // How one layout differs from another, in words: [{ label, changes }].
    // Either may be schema 1 or missing (the built-in layout).
    function layoutChanges(before, after) {
      const own = { regions: page.regions() };
      const a = upgradeDocument(before) || own, b = upgradeDocument(after) || own;
      const ia = instancesOf(a), ib = instancesOf(b), out = [];
      const regionName = (doc, id) => { const r = regionsOf(doc).find(x => x.id === id); return r ? regionLabel(r).split(',')[0].toLowerCase() : id; };
      ib.forEach(n => {
        const label = instanceLabel(n.id, n.type), o = ia.find(x => x.id === n.id && x.type === n.type);
        if (!o) { out.push({ label, changes: [`Added to the ${regionName(b, n.region)}`] }); return; }
        const changes = [], w = o.widget, v = n.widget;
        if (o.region !== n.region || w.col !== v.col || w.row !== v.row) changes.push('Moved');
        if (w.cols !== v.cols || w.rows !== v.rows) changes.push(`Resized (${w.cols} × ${w.rows} to ${v.cols} × ${v.rows})`);
        if (changes.length) out.push({ label, changes });
      });
      ia.forEach(o => { if (!ib.some(n => n.id === o.id && n.type === o.type)) out.push({ label: instanceLabel(o.id, o.type), changes: ['Removed'] }); });
      // Order on narrow screens, for the widgets both have.
      const order = r => (Array.isArray(r.stack) ? r.stack : r.widgets.slice().sort((x, y) => x.row - y.row || x.col - y.col).map(w => w.id));
      regionsOf(b).forEach(rb => {
        const ra = regionsOf(a).find(r => r.id === rb.id);
        if (!ra) return;
        const oa = order(ra), ob = order(rb);
        if (oa.filter(id => ob.indexOf(id) >= 0).join() !== ob.filter(id => oa.indexOf(id) >= 0).join()) out.push({ label: regionLabel(rb).split(',')[0], changes: ['Order on phones'] });
      });
      return out;
    }

    return {
      page: page, isInstanceKey: isInstanceKey, widgets: widgets, forPage: forPage,
      LAYOUT: LAYOUT, WIDGET_NAMES: WIDGET_NAMES, instanceKey: instanceKey, regionsOf: regionsOf, instancesOf: instancesOf, newInstanceId: newInstanceId,
      instanceLabel: instanceLabel, regionLabel: regionLabel, starterContent: starterContent, listsOf: listsOf, layoutChanges: layoutChanges, ownerOf: (id, ...docs) => ownerOf(id, docs),
      PAGE_SCHEMA: PAGE_SCHEMA, PAGE_LIMITS: PAGE_LIMITS, WIDGET_TYPES: WIDGET_TYPES,
      builtInRegions: page.regions, upgradeDocument: upgradeDocument, componentOwner: componentOwner, validatePageDocument: validatePageDocument,
      SCHEMA: SCHEMA, CAROUSEL: CAROUSEL, SLOTS: SLOTS, LIMITS: LIMITS, CATEGORIES: CATEGORIES,
      cardType: cardType, cardLabel: cardLabel, linkHint: linkHint, slotOf: slotOf, isSaved: isSaved, listOf: listOf, savedList: savedList, savedId: savedId, newKey: newKey,
      artModel: artModel, cardModel: cardModel, toModel: toModel, mediaIds: mediaIds, validateDocument: validateDocument,
      cardFields: cardFields, checkField: checkField
    };
  }

  const here = pages.current();
  const api = forPage(here ? here.page.id : 'home');
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.content = api;
  if (NODE) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
