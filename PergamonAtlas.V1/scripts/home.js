// Homepage: composition, game and CMS adaptation. Card content is a CMS
// document (data/home-content.js is the static copy), translated by
// scripts/cms/content.js; game lookups come from /data/entries.js.
//
// Included as a plain script right after <div id="home">, so the page renders
// while it is still parsing (no layout shift once the rest loads).
//
// Placement is the Atlas Grid's (scripts/grid/): the document's regions
// (schema 2; a schema-1 document is drawn as today's two regions) are each
// drawn by the shared renderer, and every widget instance by its type's
// draw function below, from its own content ('home.<instance id>'). This
// file decides only how each widget type is drawn and where the regions go:
// the region with frame "sidebar" sits beside the site sidebar, the others
// run full width below it.
//
// The reusable components live in scripts/components/ and know nothing about
// games, the CMS or this page:
//   featureBanner    the Featured (hero) and Spotlight (banner) cards
//   contentCard      one carousel card (here: a game)
//   carousel         the explore strip (here: Games and Tools, by category)
//   atlasNavigation  the panel of site destinations
// This file keeps the API Admin Mode uses (window.PergamonHome). Cards are
// built once and then updated in place, so they can be redrawn from a new
// document (PergamonHome.render) without rebuilding the page.
(function () {
  const content = window.PergamonHomeContent;
  const cms = window.PergamonCMS && window.PergamonCMS.content;
  const root = document.getElementById('home');
  const C = window.PergamonComponents;
  const G = window.PergamonGrid;
  if (!content || !cms || !root || !C || !C.featureBanner || !C.contentCard || !C.carousel || !C.atlasNavigation) return;
  if (!G || !G.renderer || !G.widgetTypes) return;
  const TYPES = G.widgetTypes.types;
  const ICONS = C.atlasNavigation.ICONS;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ── Data ───────────────────────────────────────────────────
  const entries = (window.atlasEntries && window.atlasEntries.games) || [];
  const norm = path => String(path || '').replace(/\/+$/, '');
  const liveGame = path => entries.find(e => norm(e.path) === norm(path) && !e.archived && e.visibility === 'public' && e.status !== 'coming-soon') || null;
  const keyOf = id => 'home.' + id;                              // an instance's content key
  // The instance a saved card belongs to ('home.<id>.saved.<key>' → id).
  const savedOwner = key => { const m = /^home\.([a-z0-9][a-z0-9-]*)\.saved\.[a-z0-9][a-z0-9-]*$/.exec(key || ''); return m ? m[1] : null; };

  // ── Featured / spotlight cards ────────────────────────────────────────
  // A CMS card shown by the feature banner: a feature-hero instance is the
  // 'hero' variant, a feature-spotlight the 'banner'. The card's `cta` is the
  // banner's action label.
  function featureCard(type) {
    const b = C.featureBanner({ variant: type === 'feature-spotlight' ? 'banner' : 'hero' });
    return {
      element: b.element,
      applyArt: b.applyArt,
      apply(item) {
        b.element.dataset.cmsId = item.id;
        b.apply({ title: item.title, actionLabel: item.cta, href: item.href, art: item.art });
      }
    };
  }

  // ── Carousel card ─────────────────────────────────────────────────────
  // A game as a content card: its live page, its catalogue name when the
  // card has no title, its category as the card's line of metadata.
  function gameCard(item, entry) {
    const card = C.contentCard({ title: item.title || entry.name, meta: item.category, href: norm(entry.path) + '/', art: item.art, action: 'play' });
    if (item.id) card.element.dataset.cmsId = item.id;
    return card.element;
  }

  // ── Carousel ──────────────────────────────────────────────────────────
  // The explore strip: sections (switched with the top-right arrows), each
  // filtered by category (the tabs). A section with `component` takes its
  // cards from the instance's own cards; only cards that link to a live game
  // are shown.
  function liveItems(items) {
    return (items || []).map(item => {
      const target = item.href || item.path;
      if (!target) return null;
      const entry = liveGame(target);
      if (!entry) { console.warn('Homepage: carousel item is not a live page:', target); return null; }
      return { key: item.id || norm(entry.path), element: gameCard(item, entry), label: item.title || entry.name, facet: item.category };
    }).filter(Boolean);
  }
  function gamesCarousel(data, cards) {
    const docSection = (data.sections.find(sec => sec.component) || {}).id;
    const c = C.carousel({
      sections: data.sections.map(sec => ({
        id: sec.id,
        title: sec.title,
        icon: ICONS[sec.icon],
        filters: sec.categories,
        items: liveItems(sec.component ? cards : sec.items),
        emptyMessage: sec.emptyMessage,
        emptyTag: 'Coming Soon',
        emptyFilterMessage: sec.emptyCategory
      }))
    });
    return {
      element: c.element,
      start: c.start,
      // New document cards for the document-driven section (position kept).
      setItems: next => data.sections.forEach(sec => { if (sec.component) c.setItems(sec.id, liveItems(next)); }),
      reveal: c.reveal,
      hold: c.hold,
      // Admin Mode's "Add card" tile follows the document's cards only.
      setTail: node => c.setTail(node, docSection),
      category: c.filter
    };
  }
  // The page's explore sections for the homepage's own carousel; any other
  // carousel instance shows its cards as the document section alone.
  function carouselConfig(id) {
    const explore = content.explore;
    if (!explore || id === 'carousel') return explore;
    const sec = explore.sections.find(s => s.component);
    return sec ? { sections: [sec] } : explore;
  }

  // ── Document → model ──────────────────────────────────────────────────
  // First render: the last published version this browser received (see
  // scripts/cms/loader.js), else the static document. The loader then swaps
  // in the fresh published version, if it differs, via PergamonHome.render.
  // A model is drawn only if its layout is valid: a broken layout is refused
  // whole, never half-drawn.
  const usable = m => (m && Array.isArray(m.regions) && !G.validatePage({ regions: m.regions }, TYPES).length ? m : null);
  const loader = window.PergamonCMS.loader;
  const staticCtx = { staticImages: content.staticImages || {} };
  const cached = loader && loader.initial();
  const cachedModel = cached ? usable(cms.toModel(cached.doc, Object.assign({}, staticCtx, { media: cached.media }))) : null;
  const fallbackModel = usable(cms.toModel(content.document, staticCtx));
  let model = cachedModel || fallbackModel;
  if (!model) return;
  let artCtx = cachedModel ? Object.assign({}, staticCtx, { media: cached.media }) : staticCtx;

  // ── Widget instances ──────────────────────────────────────────────────
  // id → { type, card } (features), { type, carousel, started } (carousels),
  // { type, nav } (Atlas Navigation).
  const instances = {};
  const theme = window.PergamonTheme;
  const signedIn = () => !!(theme && theme.get().signedIn);
  // A saved card drawn in its instance's place while Admin Mode edits it:
  // { instance, id }. Visitors never have one.
  let previewing = null;
  const savedModel = key => {
    const owner = savedOwner(key), m = owner && model.instances[owner];
    return m && m.saved ? m.saved.find(c => c.id === key) || null : null;
  };
  function drawCard(id) {
    const inst = instances[id], m = model.instances[id];
    if (!inst || !inst.card || !m) return;
    const shown = (previewing && previewing.instance === id && savedModel(previewing.id)) || m.card;
    if (shown) inst.card.apply(shown);
  }
  const forget = id => () => { delete instances[id]; };
  const DRAW = {
    'feature-hero': { container: 'upper', render: p => drawFeature(p) },
    'feature-spotlight': { container: 'upper', render: p => drawFeature(p) },
    'carousel': { render: p => drawCarousel(p) },
    'atlas-navigation': { render: p => drawNavigation(p) }
  };
  function drawFeature(p) {
    const card = featureCard(p.type);
    instances[p.id] = { type: p.type, card };
    drawCard(p.id);
    return { element: card.element, destroy: forget(p.id) };
  }
  function drawCarousel(p) {
    const cfg = carouselConfig(p.id), m = model.instances[p.id];
    if (!cfg || !window.PergamonGlide) return { element: el('div'), destroy: forget(p.id) };
    const carousel = gamesCarousel(cfg, m ? m.cards : []);
    instances[p.id] = { type: p.type, carousel, started: false };
    return { element: carousel.element, destroy: forget(p.id) };
  }
  function drawNavigation(p) {
    const nav = C.atlasNavigation(content.context || { title: 'Atlas Navigation', links: [] });
    nav.setSignedIn(signedIn());
    instances[p.id] = { type: p.type, nav };
    return { element: nav.element, destroy: forget(p.id) };
  }
  // Carousels measure their width to decide whether to glide: start each
  // once it is in place (and hold it, while Admin Mode holds them all).
  let held = false;
  function startCarousels() {
    Object.values(instances).forEach(inst => { if (inst.carousel && !inst.started && inst.carousel.element.isConnected) { inst.carousel.start(); inst.started = true; if (held) inst.carousel.hold(true); } });
  }
  const carousels = () => Object.values(instances).filter(i => i.carousel).map(i => i.carousel);
  const carouselOfInstance = id => (instances[id] && instances[id].carousel) || null;

  // ── Page ──────────────────────────────────────────────────────────────
  // One host per region: the sidebar-framed region beside the site sidebar
  // (.home-upper), the others full width below (.home-lower).
  const title = el('h1', 'pa-visually-hidden', 'PergamonAtlas');
  root.append(title);
  let regions = [];                               // [{ id, frame, host, grid }]
  const regionSignature = m => m.regions.map(r => `${r.id}:${r.frame || ''}`).join('|');
  let signature = '';
  function buildRegions() {
    regions.forEach(r => { r.grid.destroy(); r.host.remove(); });
    regions = model.regions.map(r => {
      const host = el('div', r.frame === 'sidebar' ? 'home-region home-upper' : 'home-region home-lower');
      host.dataset.region = r.id;
      root.append(host);
      const region = { id: r.id, frame: r.frame, host, grid: null };
      region.grid = G.renderer(host, { types: TYPES, draw: DRAW, onState: () => { if (window.PergamonHome && window.PergamonHome.onRegionState) window.PergamonHome.onRegionState(region); } });
      return region;
    });
    signature = regionSignature(model);
  }
  // Each region shows its grid from its own fitting width up, stacked below.
  function drawRegions() {
    model.regions.forEach(r => {
      const region = regions.find(x => x.id === r.id);
      region.grid.setStackBelow(G.minFitWidth(r, TYPES));
      region.grid.render(r);
    });
  }
  buildRegions();
  drawRegions();
  // Take the shared sidebar into this grid (layout.js holds it back on pages
  // with data-layout="home"), beside the framed region. The page title stays
  // first in reading order.
  const framed = regions.find(r => r.frame === 'sidebar') || regions[0];
  if (window.PergamonLayout && framed) window.PergamonLayout.mountSidebar(root, framed.host);
  startCarousels();

  // Window widths the card previews fall back to, and what the page takes
  // from them (its insets; beside the expanded sidebar, that and the gutter).
  const WIDE = [1440, 1920], INSETS = 48, BESIDE = 48 + 220 + G.GUTTER;
  const COMPACT = 560;                  // feature-banner.css: the compact card's widest slot

  // ── Public API ────────────────────────────────────────────────────────
  // render(doc, { media }) redraws the page from another document in place
  // (published content, or an admin's working copy). Returns false, and
  // leaves the page as it is, if the document can't be read or its layout
  // isn't valid. Cards are addressed by component id ('home.<instance>',
  // saved cards 'home.<instance>.saved.<key>', carousel cards
  // 'home.<instance>.<key>').
  const featureIds = () => Object.keys(instances).filter(id => instances[id].card);
  // The instance that shows card `key` now (its own card, or a saved card
  // previewed in its place), or null.
  function showing(key) {
    const id = featureIds().find(i => keyOf(i) === key);
    if (id) return id;
    return previewing && previewing.id === key && instances[previewing.instance] ? previewing.instance : null;
  }
  const carouselOf = key => {
    const id = Object.keys(instances).find(i => instances[i].carousel && model.instances[i] && (model.instances[i].cards || []).some(c => c.id === key));
    return id ? instances[id].carousel : null;
  };
  window.PergamonHome = {
    render(doc, extra) {
      const nextCtx = Object.assign({}, staticCtx, extra || {});
      const next = usable(cms.toModel(doc, nextCtx));
      if (!next) return false;
      model = next;
      artCtx = nextCtx;
      if (previewing && !savedModel(previewing.id)) previewing = null;
      if (regionSignature(model) !== signature) {
        Object.keys(instances).forEach(id => delete instances[id]);
        buildRegions();
        const f = regions.find(r => r.frame === 'sidebar') || regions[0];
        if (window.PergamonLayout && f) window.PergamonLayout.mountSidebar(root, f.host);
      }
      drawRegions();
      Object.keys(instances).forEach(id => {
        const inst = instances[id], m = model.instances[id];
        if (inst.card) drawCard(id);
        else if (inst.carousel && m) inst.carousel.setItems(m.cards);
      });
      startCarousels();
      return true;
    },
    model: () => model,
    cardIds: () => featureIds().map(keyOf).concat(...Object.keys(instances).filter(i => instances[i].carousel).map(i => ((model.instances[i] || {}).cards || []).map(c => c.id))),
    element: key => {
      const id = showing(key);
      return id ? instances[id].card.element : root.querySelector(`.home-tile[data-cms-id="${CSS.escape(key)}"]`);
    },
    // Make sure a card is drawn (carousel cards may be out of view or filtered out).
    reveal: key => { if (showing(key)) return true; const c = carouselOf(key); return !!(c && c.reveal(key)); },
    // Admin Mode editing: hold every carousel still (true) or let them glide again.
    holdMotion: on => { held = !!on; carousels().forEach(c => c.hold(held)); },
    // Admin Mode: show a saved card in its instance's place (null: the active cards again).
    previewSaved(key) {
      const was = previewing;
      previewing = key && savedModel(key) ? { instance: savedOwner(key), id: key } : null;
      [was && was.instance, previewing && previewing.instance].filter(Boolean).forEach(drawCard);
      return !!previewing;
    },
    // Admin Mode: a tile after a carousel instance's cards while it is held (null removes it).
    setCarouselTail: (id, node) => { const c = carouselOfInstance(id); if (c) c.setTail(node); },
    carouselCategory: id => { const c = carouselOfInstance(id); return c ? c.category() : ''; },
    // Admin Mode: the page's regions ({ id, frame, host, grid }: the grid each
    // is drawn by) and its widgets ({ id, type, region, slot }). onRegionState
    // (set by Layout Mode) hears when a region starts or stops showing its grid.
    regions: () => regions.slice(),
    instances: () => [].concat(...model.regions.map(r => r.widgets.map(w => ({ id: w.id, type: w.type, region: r.id, slot: (regions.find(x => x.id === r.id) || { grid: { slot: () => null } }).grid.slot(w.id) })))),
    onRegionState: null,
    // The size a Featured / Spotlight card's widget is drawn at (its own or a
    // saved card's), for the card editor's previews:
    //   'desktop'  its rectangle on the grid, in this window (`room`: px an
    //              open editor takes from the page's width); where that shows
    //              the compact card, or the grid doesn't show, as in a wider
    //              window (1440px, then 1920px)
    //   'phone'    stacked on a 390px screen: at least its authored height
    // → { width, height, minHeight, compact, stacked, frame, here } | null
    cardSize(key, layout, room) {
      const id = featureIds().find(i => keyOf(i) === key) || savedOwner(key);
      const at = id && G.findInstance({ regions: model.regions }, id);
      const region = at && regions.find(r => r.id === at.region.id);
      if (!region) return null;
      const w = at.widget, frame = at.region.frame || null;
      const tall = at.region.rowHeight ? G.spanSize(w.rows, at.region.rowHeight) : 0;
      if (layout === 'phone') return { width: 358, height: null, minHeight: tall, compact: true, stacked: true, frame, here: false };
      const live = region.grid.geometry().width + (room || 0), fits = G.minFitWidth(at.region, TYPES);
      let size = null;
      for (const [width, here] of [[live, true], [WIDE[0] - (frame ? BESIDE : INSETS), false], [WIDE[1] - (frame ? BESIDE : INSETS), false]]) {
        if (width < fits - 1e-6) continue;
        const cell = G.cellSize(width), r = G.rect(w, cell, G.GUTTER, G.rowSize(at.region, cell));
        const s = { width: r.width, height: r.height, minHeight: 0, compact: r.width <= COMPACT, stacked: false, frame, here };
        if (!s.compact) return s;
        size = size || s;
      }
      return size || { width: 358, height: null, minHeight: tall, compact: true, stacked: true, frame, here: false };
    },
    // Card editor (Admin Mode). Art from a document → how this page draws it,
    // with the images of the last render.
    artModel: a => cms.artModel(a, artCtx),
    // Redraw one card's artwork in place (live framing while dragging),
    // without redrawing the page. False if the card isn't on the page.
    previewArt(key, a) {
      const m = cms.artModel(a, artCtx);
      const id = showing(key);
      if (id) { instances[id].card.applyArt(m); return true; }
      const card = root.querySelector(`.home-tile[data-cms-id="${CSS.escape(key)}"]`);
      if (!card) return false;
      C.contentCard.setArt(card, m);
      return true;
    },
    // A detached copy of a card, drawn like the page draws it (the editor's
    // framing preview): { element, art(a) } where art(a) redraws its artwork.
    sample(key) {
      const own = featureIds().find(i => keyOf(i) === key), owner = own || savedOwner(key);
      if (owner && model.instances[owner] && (model.instances[owner].type === 'feature-hero' || model.instances[owner].type === 'feature-spotlight')) {
        const item = own ? model.instances[owner].card : savedModel(key);
        if (!item) return null;
        const copy = featureCard(model.instances[owner].type);
        copy.apply(item);
        return { element: copy.element, art: a => copy.applyArt(cms.artModel(a, artCtx)) };
      }
      const id = Object.keys(model.instances).find(i => (model.instances[i].cards || []).some(c => c.id === key));
      const item = id && model.instances[id].cards.find(c => c.id === key);
      if (!item) return null;
      const card = gameCard(item, liveGame(item.href) || { path: item.href, name: item.title });
      return { element: card, art: a => C.contentCard.setArt(card, cms.artModel(a, artCtx)) };
    }
  };

  // Published content (staging previews and local development; production
  // keeps the static document until the CMS is approved there).
  if (loader) loader.attach(window.PergamonHome, root, cachedModel ? cached.version : null, content.document);

  // Atlas Navigation's account row follows the sign-in state theme.js shows.
  if (theme) theme.onChange(s => Object.values(instances).forEach(inst => { if (inst.nav) inst.nav.setSignedIn(s.signedIn); }));

  // A password-reset link that Supabase sent to the Site URL (the homepage)
  // instead of the reset page: finish it there. auth.js loads after this file.
  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.PergamonAuth;
    if (!auth) return;
    try {
      auth.onAuthStateChange(event => {
        if (event !== 'PASSWORD_RECOVERY') return;
        try { sessionStorage.setItem('pa-password-recovery', '1'); } catch (e) {}
        window.location.replace('/account/reset-password/');
      });
    } catch (e) {}
  });
})();
