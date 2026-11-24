// Page renderer: draws an Atlas page from its content document (a CMS
// document, scripts/cms/content.js) and keeps the API Admin Mode edits it
// through. Every page uses this one; a page file (scripts/home.js) only says
// what is the page's own and calls
//
//   PergamonPages.mount({
//     heading       the page's visually hidden <h1>; omitted, its first Page
//                   Heading widget is the <h1>
//     document      its built-in content: shown until something is published,
//                   and whenever the published content can't be read
//     staticImages  details of the images under /images/featured/ it may use
//     visibility()  a promise of listed(entry): which games may be listed for this
//                   visitor, when that isn't the records' say alone
//     settings      configuration of its widgets that isn't CMS content
//                   (scripts/page-widgets.js)
//   })  → window.PergamonPage, or null where the page can't be drawn
//
// Which page it is, and the element it is drawn in, come from the HTML
// (<div data-atlas-page="…" class="home">, scripts/cms/pages.js). Scripts are
// included right after that element, so the page renders while it is still
// parsing (no layout shift once the rest loads).
//
// Placement is the Atlas Grid's (scripts/grid/): the document's regions (a
// schema-1 document is drawn as the page's built-in ones) are each drawn by
// the shared renderer, and every widget instance by its type's adapter, from
// its own content ('<prefix>.<instance id>'). The region with frame "sidebar"
// sits beside the site sidebar, the others run full width below it.
//
// Widgets are built once and then updated in place, so the page can be redrawn
// from a new document (PergamonPage.render) without rebuilding it.
(function () {
  'use strict';
  const cms = window.PergamonCMS || {};
  const G = window.PergamonGrid;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const STACK_BELOW = 600;

  function mount(opts) {
    const content = cms.content;
    const here = cms.pages && cms.pages.current();
    if (!content || !here || content.page !== here.page || !window.PergamonPageWidgets) return null;
    if (!G || !G.renderer || !G.widgetTypes) return null;
    const root = here.root, TYPES = G.widgetTypes.types, WIDGETS = content.widgets;
    const theme = window.PergamonTheme;

    // ── Data ─────────────────────────────────────────────────
    const entries = (window.atlasEntries && window.atlasEntries.games) || [];
    const norm = path => String(path || '').replace(/\/+$/, '');
    let listed = e => !e.archived && e.visibility === 'public';
    const listedGame = path => entries.find(e => norm(e.path) === norm(path) && listed(e)) || null;
    const liveGame = path => { const e = listedGame(path); return e && e.status !== 'coming-soon' ? e : null; };
    const adapters = window.PergamonPageWidgets.create({
      liveGame,
      listedGame,
      settings: Object.assign({ signedIn: () => !!(theme && theme.get().signedIn) }, opts.settings)
    });

    // ── Document → model ─────────────────────────────────────
    // First render: the last published version this browser received (see
    // scripts/cms/loader.js), else the built-in document. The loader then swaps
    // in the fresh published version, if it differs, via PergamonPage.render.
    // A model is drawn only if its layout is valid: a broken layout is refused
    // whole, never half-drawn.
    const usable = m => (m && Array.isArray(m.regions) && !G.validatePage({ regions: m.regions }, TYPES).length ? m : null);
    const loader = cms.loader;
    const library = window.PergamonGameLibrary;
    const staticCtx = { staticImages: opts.staticImages || {}, games: library && library.games };
    const cached = loader && loader.initial();
    const cachedModel = cached ? usable(content.toModel(cached.doc, Object.assign({}, staticCtx, { media: cached.media }))) : null;
    let model = cachedModel || usable(content.toModel(opts.document, staticCtx));
    if (!model) return null;
    let artCtx = cachedModel ? Object.assign({}, staticCtx, { media: cached.media }) : staticCtx;

    // ── Widget instances ─────────────────────────────────────
    // id → { type, widget, started }
    const instances = {};
    // A saved card drawn in its instance's place while Admin Mode edits it:
    // { instance, id }. Visitors never have one.
    let previewing = null;
    const keyOf = id => content.instanceKey(id);                  // an instance's content key
    // The instance a saved card belongs to ('<prefix>.<id>.saved.<key>' → id).
    const savedOwner = key => {
      if (!content.isInstanceKey(key)) return null;
      const m = /^([a-z0-9][a-z0-9-]*)\.saved\.[a-z0-9][a-z0-9-]*$/.exec(key.slice(keyOf('').length));
      return m ? m[1] : null;
    };
    const savedModel = key => {
      const owner = savedOwner(key), m = owner && model.instances[owner];
      return m && m.saved ? m.saved.find(c => c.id === key) || null : null;
    };
    const ofKind = is => Object.keys(instances).filter(id => is(instances[id].type) && instances[id].widget);
    const cardWidgets = () => ofKind(WIDGETS.hasCard);
    const listWidgets = () => ofKind(WIDGETS.isList);
    function drawCard(id) {
      const inst = instances[id], m = model.instances[id];
      if (!inst || !inst.widget || !WIDGETS.hasCard(inst.type) || !m) return;
      const shown = (previewing && previewing.instance === id && savedModel(previewing.id)) || m.card;
      if (shown) inst.widget.setCard(shown);
    }
    function drawWidget(p) {
      const widget = adapters[p.type].create(p, model.instances[p.id]);
      if (widget) { instances[p.id] = { type: p.type, widget, started: false }; drawCard(p.id); }
      return { element: widget ? widget.element : el('div'), destroy: () => { delete instances[p.id]; } };
    }
    const DRAW = {};
    Object.keys(adapters).forEach(type => { DRAW[type] = { container: adapters[type].container, render: drawWidget }; });
    // What a widget shows about the rest of the page: how many cards its lists
    // show, and (where the page has no heading of its own) which heading is first.
    function relate() {
      const order = [].concat(...model.regions.map(r => G.stackOrder(r))).filter(id => instances[id]);
      const cards = order.reduce((n, id) => n + (instances[id].widget.shown ? instances[id].widget.shown() : 0), 0);
      const first = opts.heading ? null : order.find(id => instances[id].widget.setLevel);
      order.forEach(id => {
        const w = instances[id].widget;
        if (w.setCount) w.setCount(cards);
        if (w.setLevel) w.setLevel(id === first ? 1 : 2);
      });
    }
    // Motion: a carousel measures its width to decide whether to glide, so
    // each starts once it is in place (held, while Admin Mode holds them all).
    let held = false;
    function startWidgets() {
      Object.values(instances).forEach(inst => {
        const w = inst.widget;
        if (w.start && !inst.started && w.element.isConnected) { w.start(); inst.started = true; if (held) w.hold(true); }
      });
    }

    // ── Page ─────────────────────────────────────────────────
    // One host per region: the sidebar-framed region beside the site sidebar
    // (.home-upper), the others full width below (.home-lower).
    if (opts.heading) root.append(el('h1', 'pa-visually-hidden', opts.heading));
    let regions = [];                               // [{ id, frame, host, grid }]
    const regionSignature = m => m.regions.map(r => `${r.id}:${r.frame || ''}`).join('|');
    let signature = '';
    let page = null;                                // the public API, once it exists
    function buildRegions() {
      regions.forEach(r => { r.grid.destroy(); r.host.remove(); });
      regions = model.regions.map(r => {
        const host = el('div', r.frame === 'sidebar' ? 'home-region home-upper' : 'home-region home-lower');
        host.dataset.region = r.id;
        root.append(host);
        const region = { id: r.id, frame: r.frame, host, grid: null };
        region.grid = G.renderer(host, { types: TYPES, draw: DRAW, onState: () => { if (page && page.onRegionState) page.onRegionState(region); } });
        return region;
      });
      signature = regionSignature(model);
    }
    // Each region shows its grid from its own fitting width up (and never in less
    // than STACK_BELOW, where twenty columns are no use), stacked below.
    function drawRegions() {
      model.regions.forEach(r => {
        const region = regions.find(x => x.id === r.id);
        region.grid.setStackBelow(Math.max(STACK_BELOW, G.minFitWidth(r, TYPES)));
        region.grid.render(r);
      });
    }
    // Take the shared sidebar into this grid (layout.js holds it back on pages
    // with data-layout="inline"), beside the framed region. The page title
    // stays first in reading order.
    function mountSidebar() {
      const framed = regions.find(r => r.frame === 'sidebar') || regions[0];
      if (window.PergamonLayout && framed) window.PergamonLayout.mountSidebar(root, framed.host);
    }
    buildRegions();
    drawRegions();
    mountSidebar();
    relate();
    startWidgets();

    // Window widths the card previews fall back to, and what the page takes
    // from them (its insets; beside the expanded sidebar, that and the gutter).
    const WIDE = [1440, 1920], INSETS = 48, BESIDE = 48 + 220 + G.GUTTER;
    const COMPACT = 560;                  // feature-banner.css: the compact card's widest slot

    // ── Public API ───────────────────────────────────────────
    // render(doc, { media }) redraws the page from another document in place
    // (published content, or an admin's working copy). Returns false, and
    // leaves the page as it is, if the document can't be read or its layout
    // isn't valid. Cards are addressed by component id ('<prefix>.<instance>',
    // saved cards '<prefix>.<instance>.saved.<key>', a list's cards
    // '<prefix>.<instance>.<key>').
    // The instance that shows card `key` now (its own card, or a saved card
    // previewed in its place), or null.
    function showing(key) {
      const id = cardWidgets().find(i => keyOf(i) === key);
      if (id) return id;
      return previewing && previewing.id === key && instances[previewing.instance] ? previewing.instance : null;
    }
    const cardsOf = id => (model.instances[id] && model.instances[id].cards) || [];
    const listCard = key => root.querySelector(`.home-tile[data-cms-id="${CSS.escape(key)}"]`);
    function drawLists() {
      listWidgets().forEach(id => { if (model.instances[id]) instances[id].widget.setCards(cardsOf(id)); });
      relate();
    }
    const widgetOf = id => (instances[id] && instances[id].widget) || null;
    page = {
      root,
      builtIn: opts.document,
      render(doc, extra) {
        const nextCtx = Object.assign({}, staticCtx, extra || {});
        const next = usable(content.toModel(doc, nextCtx));
        if (!next) return false;
        model = next;
        artCtx = nextCtx;
        if (previewing && !savedModel(previewing.id)) previewing = null;
        if (regionSignature(model) !== signature) {
          Object.keys(instances).forEach(id => delete instances[id]);
          buildRegions();
          mountSidebar();
        }
        drawRegions();
        cardWidgets().forEach(drawCard);
        drawLists();
        startWidgets();
        return true;
      },
      model: () => model,
      cardIds: () => cardWidgets().map(keyOf).concat(...listWidgets().map(i => cardsOf(i).map(c => c.id))),
      element: key => {
        const id = showing(key);
        return id ? instances[id].widget.element : listCard(key);
      },
      // Make sure a card is drawn (a list's cards may be out of view or filtered out).
      reveal: key => {
        if (showing(key)) return true;
        const id = listWidgets().find(i => cardsOf(i).some(c => c.id === key));
        return !!(id && instances[id].widget.reveal(key));
      },
      // Admin Mode editing: hold everything still (true) or let it move again.
      holdMotion: on => { held = !!on; Object.values(instances).forEach(i => { if (i.widget.hold) i.widget.hold(held); }); },
      // Admin Mode: show a saved card in its instance's place (null: the active cards again).
      previewSaved(key) {
        const was = previewing;
        previewing = key && savedModel(key) ? { instance: savedOwner(key), id: key } : null;
        [was && was.instance, previewing && previewing.instance].filter(Boolean).forEach(drawCard);
        return !!previewing;
      },
      // Admin Mode: a tile after a list instance's cards while it is held (null removes it).
      setListTail: (id, node) => { const w = widgetOf(id); if (w && w.setTail) w.setTail(node); },
      listCategory: id => { const w = widgetOf(id); return w && w.category ? w.category() : ''; },
      // Admin Mode: the page's regions ({ id, frame, host, grid }: the grid each
      // is drawn by) and its widgets ({ id, type, region, slot, list: the element
      // a list's controls sit on }). onRegionState (set by Layout Mode) hears
      // when a region starts or stops showing its grid.
      regions: () => regions.slice(),
      instances: () => [].concat(...model.regions.map(r => r.widgets.map(w => {
        const region = regions.find(x => x.id === r.id), widget = widgetOf(w.id);
        return { id: w.id, type: w.type, region: r.id, slot: region ? region.grid.slot(w.id) : null, list: widget && widget.list ? widget.list() : null };
      }))),
      onRegionState: null,
      // The size a card widget is drawn at (for its own or a saved card), for
      // the card editor's previews:
      //   'desktop'  its rectangle on the grid, in this window (`room`: px an
      //              open editor takes from the page's width); where that shows
      //              the compact card, or the grid doesn't show, as in a wider
      //              window (1440px, then 1920px)
      //   'phone'    stacked on a 390px screen: at least its authored height
      // → { width, height, minHeight, compact, stacked, frame, here } | null
      cardSize(key, layout, room) {
        const id = cardWidgets().find(i => keyOf(i) === key) || savedOwner(key);
        const at = id && G.findInstance({ regions: model.regions }, id);
        const region = at && regions.find(r => r.id === at.region.id);
        if (!region) return null;
        const w = at.widget, frame = at.region.frame || null;
        const tall = at.region.rowHeight ? G.spanSize(w.rows, at.region.rowHeight) : 0;
        if (layout === 'phone') return { width: 358, height: null, minHeight: tall, compact: true, stacked: true, frame, here: false };
        const live = region.grid.geometry().width + (room || 0), fits = G.minFitWidth(at.region, TYPES);
        let size = null;
        for (const [width, isHere] of [[live, true], [WIDE[0] - (frame ? BESIDE : INSETS), false], [WIDE[1] - (frame ? BESIDE : INSETS), false]]) {
          if (width < fits - 1e-6) continue;
          const cell = G.cellSize(width), r = G.rect(w, cell, G.GUTTER, G.rowSize(at.region, cell));
          const s = { width: r.width, height: r.height, minHeight: 0, compact: r.width <= COMPACT, stacked: false, frame, here: isHere };
          if (!s.compact) return s;
          size = size || s;
        }
        return size || { width: 358, height: null, minHeight: tall, compact: true, stacked: true, frame, here: false };
      },
      // Card editor (Admin Mode). Art from a document → how this page draws it,
      // with the images of the last render.
      artModel: a => content.artModel(a, artCtx),
      // Redraw one card's artwork in place (live framing while dragging),
      // without redrawing the page. False if the card isn't on the page.
      previewArt(key, a) {
        const m = content.artModel(a, artCtx);
        const id = showing(key);
        if (id) { instances[id].widget.art(m); return true; }
        const card = listCard(key);
        if (!card) return false;
        window.PergamonComponents.contentCard.setArt(card, m);
        return true;
      },
      // A detached copy of a card, drawn like the page draws it (the editor's
      // framing preview): { element, art(a) } where art(a) redraws its artwork.
      sample(key) {
        const own = cardWidgets().find(i => keyOf(i) === key), owner = own || savedOwner(key);
        const inOwner = owner && model.instances[owner] && WIDGETS.hasCard(model.instances[owner].type);
        const id = inOwner ? owner : Object.keys(model.instances).find(i => cardsOf(i).some(c => c.id === key));
        const item = !id ? null : inOwner ? (own ? model.instances[id].card : savedModel(key)) : cardsOf(id).find(c => c.id === key);
        if (!item) return null;
        const copy = adapters[model.instances[id].type].sampleCard(item);
        return { element: copy.element, art: a => copy.art(content.artModel(a, artCtx)) };
      }
    };
    window.PergamonPage = page;
    if (opts.visibility) opts.visibility().then(fn => { if (fn) { listed = fn; drawLists(); } }, () => {});

    if (loader) loader.attach(page, root, cachedModel ? cached.version : null, opts.document);
    // Widgets with an account row follow the sign-in state theme.js shows.
    if (theme) theme.onChange(s => Object.values(instances).forEach(i => { if (i.widget.setSignedIn) i.widget.setSignedIn(s.signedIn); }));
    return page;
  }

  window.PergamonPages = { mount };
})();
