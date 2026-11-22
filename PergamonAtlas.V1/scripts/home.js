// Homepage: composition, game and CMS adaptation, and placement. Card content
// is a CMS document (data/home-content.js is the static copy), translated by
// scripts/cms/content.js; game lookups come from /data/entries.js.
//
// Included as a plain script right after <div id="home">, so the page renders
// while it is still parsing (no layout shift once the rest loads).
//
// The reusable components live in scripts/components/ and know nothing about
// games, the CMS or this page:
//   featureBanner  the Featured (variant 'hero') and Spotlight ('banner') cards
//   contentCard    one carousel card (here: a game)
//   carousel       the explore strip (here: Games and Tools, filtered by category)
// This file turns CMS cards and game entries into their neutral inputs
// (featureSlot, gameCard, gamesCarousel), places them, and keeps the API Admin
// Mode uses (window.PergamonHome). atlasNavigation() is the right-hand panel,
// a homepage widget. Cards are built once and then updated in place, so they
// can be redrawn from a new document (PergamonHome.render) without rebuilding
// the page.
(function () {
  const content = window.PergamonHomeContent;
  const cms = window.PergamonCMS && window.PergamonCMS.content;
  const root = document.getElementById('home');
  const C = window.PergamonComponents;
  if (!content || !cms || !root || !C || !C.featureBanner || !C.contentCard || !C.carousel) return;

  const ICONS = {
    games: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M7 10v4M5 12h4M15.5 11h.01M18 13h.01"/>',
    tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a1.5 1.5 0 0 0 2.1 2.1l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-2.1z"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    updates: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    suggestions: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>'
  };
  const icon = (name, cls) => `<svg class="${cls || 'home-svg'}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let idCount = 0;
  const uid = prefix => `${prefix}-${++idCount}`;

  // ── Data ──────────────────────────────────────────────────────────────
  const entries = (window.atlasEntries && window.atlasEntries.games) || [];
  const norm = path => String(path || '').replace(/\/+$/, '');
  const liveGame = path => entries.find(e => norm(e.path) === norm(path) && !e.archived && e.visibility === 'public' && e.status !== 'coming-soon') || null;

  // ── Featured / spotlight cards ────────────────────────────────────────
  // A CMS card (home.featured / home.spotlight, or a saved card) shown by the
  // feature banner: the Featured slot is the 'hero' variant, the Spotlight
  // the 'banner'. The card's `cta` is the banner's action label.
  function featureSlot(slot) {
    const b = C.featureBanner({ variant: slot === 'home.spotlight' ? 'banner' : 'hero' });
    return {
      element: b.element,
      applyArt: b.applyArt,
      apply(item) {
        b.element.dataset.cmsId = item.id;
        b.apply({ title: item.title, actionLabel: item.cta, href: item.href, art: item.art });
      }
    };
  }

  // ── Atlas Navigation (right-hand panel) ───────────────────────────────
  // Whole-row links. The account row reads "Account" for signed-in visitors.
  // It follows theme.js's sign-in state: first the stored-session guess (so
  // the first paint is right), then the auth client's answer (layout.js), and
  // Admin Mode's guest preview (see the bottom of this file).
  const accountRows = [];
  function setAccountState(signedIn) {
    accountRows.forEach(({ link, title, desc, data }) => {
      const label = signedIn && data.signedInLabel ? data.signedInLabel : data.label;
      title.textContent = label;
      if (data.signedInDescription) desc.textContent = signedIn ? data.signedInDescription : data.description;
    });
  }

  function atlasNavigation(data) {
    const panel = el('nav', 'home-context home-atlas-nav');
    panel.dataset.slot = 'context';
    const headingId = uid('home-context');
    panel.setAttribute('aria-labelledby', headingId);
    const h = el('h2', 'home-context-title', data.title); h.id = headingId;
    const list = el('ul', 'home-context-list');
    data.links.forEach(item => {
      const li = el('li', 'home-context-item');
      const link = el('a', 'home-context-row');
      link.href = item.href;
      link.insertAdjacentHTML('beforeend', `<span class="home-context-icon">${icon(item.icon, 'home-svg')}</span>`);
      const text = el('span', 'home-context-text');
      const title = el('span', 'home-context-label', item.label);
      const desc = el('span', 'home-context-desc', item.description || '');
      text.append(title, desc);
      link.append(text);
      link.insertAdjacentHTML('beforeend', icon('chevron', 'home-context-chevron'));
      li.append(link);
      list.append(li);
      if (item.signedInLabel) accountRows.push({ link, title, desc, data: item });
    });
    panel.append(h, list);
    const theme = window.PergamonTheme;
    setAccountState(!!(theme && theme.get().signedIn));
    return panel;
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
  // The explore strip: one carousel with two sections (Games, Tools; the
  // top-right arrows), each filtered by category (the tabs). A section with
  // `component` takes its cards from that document component; only cards
  // that link to a live game are shown.
  function liveItems(items) {
    return (items || []).map(item => {
      const target = item.href || item.path;
      if (!target) return null;
      const entry = liveGame(target);
      if (!entry) { console.warn('Homepage: carousel item is not a live page:', target); return null; }
      return { key: item.id || norm(entry.path), element: gameCard(item, entry), label: item.title || entry.name, facet: item.category };
    }).filter(Boolean);
  }

  // `cards` = tile models for sections that take their items from a document
  // component (section.component); other sections use their own `items`.
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

  // ── Document → model ──────────────────────────────────────────────────
  // First render: the last published version this browser received (see
  // scripts/cms/loader.js), else the static document. The loader then swaps
  // in the fresh published version, if it differs, via PergamonHome.render.
  const loader = window.PergamonCMS.loader;
  const staticCtx = { staticImages: content.staticImages || {} };
  const cached = loader && loader.initial();
  const cachedModel = cached ? cms.toModel(cached.doc, Object.assign({}, staticCtx, { media: cached.media })) : null;
  const fallbackModel = cms.toModel(content.document, staticCtx);
  let model = cachedModel || fallbackModel || { featured: null, spotlight: null, carousel: [] };

  // ── Page ──────────────────────────────────────────────────────────────
  // .home is the shell grid: sidebar | upper on row 1, lower across row 2.
  const title = el('h1', 'pa-visually-hidden', 'PergamonAtlas');
  const upper = el('div', 'home-upper');
  const grid = el('div', 'home-feature-grid');
  const banners = el('div', 'home-banners');
  const cards = {};                              // component id -> card component
  [['featured', 'home.featured'], ['spotlight', 'home.spotlight']].forEach(([key, id]) => {
    if (!model[key]) return;
    const card = featureSlot(id);
    card.apply(model[key]);
    cards[id] = card;
    banners.append(card.element);
  });
  grid.append(banners);
  if (content.context) grid.append(atlasNavigation(content.context));
  else grid.classList.add('no-context');

  upper.append(grid);
  root.append(title, upper);
  let explore = null;
  if (content.explore && window.PergamonGlide) {
    const lower = el('div', 'home-lower');
    explore = gamesCarousel(content.explore, model.carousel);
    lower.append(explore.element);
    root.append(lower);
  }
  // Take the shared sidebar into this grid (layout.js holds it back on pages
  // with data-layout="home"). The page title stays first in reading order.
  if (window.PergamonLayout) window.PergamonLayout.mountSidebar(root, upper);
  // The carousel measures its width to decide whether to glide, so render once it is in place.
  if (explore) explore.start();

  // ── Public API ────────────────────────────────────────────────────────
  // render(doc, { media }) redraws the cards from another document in place
  // (published content, or an admin's working copy). Returns false, and
  // leaves the page as it is, if the document can't be read. Cards are
  // addressed by component id; the featured/spotlight slots exist from the
  // first render, so a document can change their content but not add slots.
  let artCtx = cachedModel ? Object.assign({}, staticCtx, { media: cached.media }) : staticCtx;
  // A saved card drawn in its slot instead of the active one, while Admin
  // Mode edits it: { slot, id }. Visitors never have one.
  let previewing = null;
  const slotKey = slot => (slot === 'home.spotlight' ? 'spotlight' : 'featured');
  const savedModel = id => {
    const slot = cms.slotOf(id);
    return slot && model.saved ? (model.saved[slot] || []).find(c => c.id === id) || null : null;
  };
  // The slot (home.featured / home.spotlight) that shows card `id` now, or null.
  const slotShowing = id => (cards[id] ? id : previewing && previewing.id === id && cards[previewing.slot] ? previewing.slot : null);
  function drawSlot(slot) {
    const shownItem = (previewing && previewing.slot === slot && savedModel(previewing.id)) || model[slotKey(slot)];
    if (cards[slot] && shownItem) cards[slot].apply(shownItem);
  }
  window.PergamonHome = {
    render(doc, extra) {
      const nextCtx = Object.assign({}, staticCtx, extra || {});
      const next = cms.toModel(doc, nextCtx);
      if (!next) return false;
      model = next;
      artCtx = nextCtx;
      if (previewing && !savedModel(previewing.id)) previewing = null;
      drawSlot('home.featured');
      drawSlot('home.spotlight');
      if (explore) explore.setItems(next.carousel);
      return true;
    },
    model: () => model,
    cardIds: () => Object.keys(cards).concat(model.carousel.map(c => c.id)),
    element: id => {
      const slot = slotShowing(id);
      return slot ? cards[slot].element : root.querySelector(`.home-tile[data-cms-id="${CSS.escape(id)}"]`);
    },
    // Make sure a card is drawn (carousel cards may be out of view or filtered out).
    reveal: id => (slotShowing(id) ? true : !!(explore && explore.reveal(id))),
    // Admin Mode editing: hold the carousel still (true) or let it glide again.
    holdMotion: on => { if (explore) explore.hold(on); },
    // Admin Mode: show a saved card in its slot (null: the active cards again).
    previewSaved(id) {
      const was = previewing;
      previewing = id && savedModel(id) ? { slot: cms.slotOf(id), id } : null;
      [was && was.slot, previewing && previewing.slot].filter(Boolean).forEach(drawSlot);
      return !!previewing;
    },
    // Admin Mode: a tile after the carousel cards while it is held (null removes it).
    setCarouselTail: node => { if (explore) explore.setTail(node); },
    carouselCategory: () => (explore ? explore.category() : ''),
    // Card editor (Admin Mode). Art from a document → how this page draws it,
    // with the images of the last render.
    artModel: a => cms.artModel(a, artCtx),
    // Redraw one card's artwork in place (live framing while dragging),
    // without redrawing the page. False if the card isn't on the page.
    previewArt(id, a) {
      const m = cms.artModel(a, artCtx);
      const slot = slotShowing(id);
      if (slot) { cards[slot].applyArt(m); return true; }
      const card = root.querySelector(`.home-tile[data-cms-id="${CSS.escape(id)}"]`);
      if (!card) return false;
      C.contentCard.setArt(card, m);
      return true;
    },
    // A detached copy of a card, drawn like the page draws it (the editor's
    // framing preview): { element, art(a) } where art(a) redraws its artwork.
    sample(id) {
      const slot = cards[id] ? id : cms.slotOf(id);
      const item = cards[id] ? model[slotKey(id)] : savedModel(id) || model.carousel.find(c => c.id === id);
      if (!item) return null;
      if (slot) {
        const copy = featureSlot(slot);
        copy.apply(item);
        return { element: copy.element, art: a => copy.applyArt(cms.artModel(a, artCtx)) };
      }
      const card = gameCard(item, liveGame(item.href) || { path: item.href, name: item.title });
      return { element: card, art: a => C.contentCard.setArt(card, cms.artModel(a, artCtx)) };
    }
  };

  // Published content (staging previews and local development; production
  // keeps the static document until the CMS is approved there).
  if (loader) loader.attach(window.PergamonHome, root, cachedModel ? cached.version : null, content.document);

  // The Atlas Navigation account row follows the sign-in state theme.js shows.
  const theme = window.PergamonTheme;
  if (theme) theme.onChange(s => setAccountState(s.signedIn));

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
