// Homepage renderer. Card content is a CMS document (data/home-content.js is
// the static copy), translated by scripts/cms/content.js; game lookups come
// from /data/entries.js. This file only builds structure.
//
// Included as a plain script right after <div id="home">, so the page renders
// while it is still parsing (no layout shift once the rest loads).
//
// Components: featureCard() for the featured and spotlight games,
// atlasNavigation() for the right-hand panel, carousel() + tile() for the
// explore strip. Each knows nothing about the page grid. Card components are
// built once and then apply(model) in place, so they can be redrawn from a
// new document (window.PergamonHome.render) without rebuilding the page.
(function () {
  const content = window.PergamonHomeContent;
  const cms = window.PergamonCMS && window.PergamonCMS.content;
  const root = document.getElementById('home');
  if (!content || !cms || !root) return;

  const ICONS = {
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    playSolid: '<path d="M5 2.5v19l16.5-9.5z"/>',
    prev: '<path d="m15 6-6 6 6 6"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
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

  // Artwork slot: the image (cover crop, focal point and zoom from the art
  // model; separate phone values), or the neutral placeholder when empty.
  function art(a, className) {
    const box = el('div', 'home-art ' + (className || ''));
    if (a && a.src) {
      const img = el('img');
      img.src = a.src;
      if (a.width) img.width = a.width;
      if (a.height) img.height = a.height;
      img.alt = a.alt || '';
      img.decoding = 'async';
      img.loading = 'lazy';
      if (!a.alt) box.setAttribute('aria-hidden', 'true');
      box.classList.add('has-art');
      const set = (prop, v) => { if (v !== undefined) box.style.setProperty(prop, v); };
      set('--art-focus', a.focus); set('--art-focus-narrow', a.focusNarrow);
      if (a.zoom !== 1 || a.zoomNarrow !== 1) {
        box.dataset.artZoom = '';
        set('--art-zoom', String(a.zoom)); set('--art-zoom-narrow', String(a.zoomNarrow));
      }
      box.append(img);
    } else {
      box.setAttribute('aria-hidden', 'true');
      box.append(el('span', 'home-art-label', 'Artwork'));
    }
    return box;
  }

  // ── Data ──────────────────────────────────────────────────────────────
  const entries = (window.atlasEntries && window.atlasEntries.games) || [];
  const norm = path => String(path || '').replace(/\/+$/, '');
  const liveGame = path => entries.find(e => norm(e.path) === norm(path) && !e.archived && e.visibility === 'public' && e.status !== 'coming-soon') || null;

  // ── Featured / spotlight cards ────────────────────────────────────────
  // Full-bleed artwork, a shade, then the title lockup (ornament rules
  // around a live heading) and the Play Now link. Everything but the image
  // comes from CSS, so another game only needs new data. The featured card
  // stacks the button under the title; the spotlight puts it on the right.
  // Built once; apply(model) sets text, link and art in place.
  const FEATURE_VARS = ['--feature-focus', '--feature-focus-narrow', '--feature-zoom', '--feature-zoom-narrow',
    '--feature-art-scale', '--feature-art-scale-narrow', '--feature-art-x', '--feature-art-x-narrow',
    '--feature-art-y', '--feature-art-y-narrow', '--feature-base'];

  function featureCard(variant) {
    const spotlight = variant === 'spotlight';
    const section = el('section', spotlight
      ? 'home-banner home-banner--spotlight home-feature home-feature--spotlight'
      : 'home-banner home-banner--featured home-feature');
    const headingId = uid('home-feature');
    section.setAttribute('aria-labelledby', headingId);

    const shade = el('div', 'home-feature-shade');
    shade.setAttribute('aria-hidden', 'true');
    const copy = el('div', 'home-feature-copy');
    const lockup = el('div', 'home-feature-lockup');
    const rule = modifier => {
      const r = el('div', `home-feature-rule home-feature-rule--${modifier}`);
      r.setAttribute('aria-hidden', 'true');
      r.innerHTML = modifier === 'top' ? '<span></span><i></i><span></span>' : '<span></span>';
      return r;
    };
    const h = el('h2', 'home-feature-title'); h.id = headingId;
    lockup.append(rule('top'), h, rule('bottom'));
    const action = el('a', 'home-feature-play');
    action.innerHTML = icon('playSolid', 'home-feature-play-icon');
    const label = el('span', '');
    action.append(label);
    if (spotlight) {
      copy.append(lockup);
      section.append(shade, copy, action);
    } else {
      copy.append(lockup, action);
      section.append(shade, copy);
    }

    let img = null;
    function applyArt(a) {
      FEATURE_VARS.forEach(v => section.style.removeProperty(v));
      delete section.dataset.artFit;
      delete section.dataset.artZoom;
      if (!a || !a.src) { if (img) { img.remove(); img = null; } return; }
      if (!img) { img = el('img', 'home-feature-art'); section.prepend(img); }
      if (img.getAttribute('src') !== a.src) {
        if (a.srcset) { img.srcset = a.srcset; img.sizes = '(max-width: 900px) 100vw, 60vw'; }
        else { img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
        if (a.width) img.width = a.width; else img.removeAttribute('width');
        if (a.height) img.height = a.height; else img.removeAttribute('height');
        img.src = a.src;
      }
      img.alt = a.alt || '';
      if (a.alt) img.removeAttribute('aria-hidden'); else img.setAttribute('aria-hidden', 'true');
      img.decoding = 'async';
      img.setAttribute('fetchpriority', spotlight ? 'auto' : 'high');
      const set = (prop, v) => { if (v !== undefined) section.style.setProperty(prop, v); };
      if (a.fit === 'height') {
        // fit: 'height' sizes the art by the card's height (scale × height,
        // scaleNarrow on phones) instead of covering it, centres it at x / xNarrow, and
        // feathers its sides into the card colour (`base`). For artwork much
        // narrower than the card, where "cover" would crop away the subject.
        section.dataset.artFit = 'height';
        set('--feature-art-scale', a.scale !== undefined ? String(a.scale) : undefined);
        set('--feature-art-scale-narrow', a.scaleNarrow !== undefined ? String(a.scaleNarrow) : undefined);
        set('--feature-art-x', a.x); set('--feature-art-x-narrow', a.xNarrow);
        set('--feature-art-y', a.y); set('--feature-art-y-narrow', a.yNarrow);
        set('--feature-base', a.base);
      } else {
        set('--feature-focus', a.focus);
        set('--feature-focus-narrow', a.focusNarrow);
        // Cover zoom (scale past "cover", around the focal point).
        if (a.zoom !== 1 || a.zoomNarrow !== 1) {
          section.dataset.artZoom = '';
          set('--feature-zoom', String(a.zoom)); set('--feature-zoom-narrow', String(a.zoomNarrow));
        }
      }
    }

    function apply(item) {
      section.dataset.cmsId = item.id;
      h.textContent = item.title;
      action.href = item.href;
      action.setAttribute('aria-label', `${item.cta}: ${item.title}`);
      label.textContent = item.cta;
      applyArt(item.art);
    }

    return { element: section, apply };
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

  // ── Carousel tile ─────────────────────────────────────────────────────
  function tile(item, entry) {
    const card = el('a', 'home-tile');
    card.href = norm(entry.path) + '/';
    if (item.id) card.dataset.cmsId = item.id;
    card.append(art(item.art, 'home-tile-art'));
    const meta = el('div', 'home-tile-meta');
    const text = el('div', 'home-tile-text');
    text.append(el('h3', 'home-tile-title', item.title || entry.name), el('span', 'home-tile-category', item.category));
    meta.append(text);
    meta.insertAdjacentHTML('beforeend', icon('play', 'home-tile-play'));
    card.append(meta);
    return card;
  }

  // ── Carousel ──────────────────────────────────────────────────────────
  // Two independent navigation levels:
  //   Level 1, sections: the top-right arrows switch Games ⇄ Tools
  //            (state: sectionIndex; handler: switchSection).
  //   Level 2, card pages: the arrows beside the cards step through pages of
  //            the current category (state: view.page; handler: turnPage).
  // Only the current page's cards are in the DOM. The page size is how many
  // CARD_MIN-wide cards fit in the measured viewport (recomputed on resize);
  // the cards then share the row, up to 200px each (see home.css).
  const CARD_MIN = 170;
  const CARD_GAP = 12;

  // Carousel items: { item, entry } for cards that link to a live game.
  function liveItems(items) {
    return (items || []).map(item => {
      const target = item.href || item.path;
      if (!target) return null;
      const entry = liveGame(target);
      if (!entry) { console.warn('Homepage: carousel item is not a live page:', target); return null; }
      return { item, entry };
    }).filter(Boolean);
  }

  // `cards` = tile models for sections that take their items from a document
  // component (section.component); other sections use their own `items`.
  function carousel(data, cards) {
    const sections = data.sections.map(sec => ({
      ...sec,
      items: liveItems(sec.component ? cards : sec.items)
    }));

    let sectionIndex = 0;                       // level 1
    const view = { category: '', page: 0 };     // level 2
    let perPage = 1;

    const section = el('section', 'home-carousel');
    const headingId = uid('home-carousel');
    section.setAttribute('aria-labelledby', headingId);

    const head = el('div', 'home-carousel-head');
    const h = el('h2', 'home-carousel-title'); h.id = headingId;
    const tabs = el('div', 'home-tabs');
    tabs.setAttribute('role', 'group');

    const sectionNav = el('div', 'home-section-nav');
    const prevSection = el('button', 'home-section-button'); prevSection.type = 'button';
    prevSection.setAttribute('aria-label', 'Previous section'); prevSection.innerHTML = icon('prev');
    const nextSection = el('button', 'home-section-button'); nextSection.type = 'button';
    nextSection.setAttribute('aria-label', 'Next section'); nextSection.innerHTML = icon('next');
    sectionNav.append(prevSection, nextSection);
    head.append(h, tabs, sectionNav);

    const body = el('div', 'home-carousel-body');
    const prevPage = el('button', 'home-page-button'); prevPage.type = 'button';
    prevPage.setAttribute('aria-label', 'Previous card page'); prevPage.innerHTML = icon('prev');
    const nextPage = el('button', 'home-page-button'); nextPage.type = 'button';
    nextPage.setAttribute('aria-label', 'Next card page'); nextPage.innerHTML = icon('next');
    const viewport = el('div', 'home-track');
    viewport.setAttribute('role', 'list');
    body.append(prevPage, viewport, nextPage);

    const status = el('p', 'pa-visually-hidden');
    status.setAttribute('aria-live', 'polite');
    section.append(head, body, status);

    const current = () => sections[sectionIndex];
    const filtered = () => current().items.filter(({ item }) => !view.category || item.category === view.category);
    const pageCount = () => Math.max(1, Math.ceil(filtered().length / perPage));

    function measure() {
      const width = viewport.clientWidth;
      return Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN + CARD_GAP)));
    }

    function renderHead() {
      const sec = current();
      h.innerHTML = icon(sec.icon, 'home-carousel-icon');
      h.append(el('span', '', sec.title));
      tabs.setAttribute('aria-label', `Filter ${sec.id} by category`);
      tabs.replaceChildren(...sec.categories.map((name, i) => {
        const b = el('button', 'home-tab', name);
        b.type = 'button';
        const value = i === 0 ? '' : name;
        b.setAttribute('aria-pressed', String(view.category === value));
        b.addEventListener('click', () => selectCategory(value));
        return b;
      }));
      prevSection.disabled = sectionIndex === 0;
      nextSection.disabled = sectionIndex === sections.length - 1;
    }

    function renderPage() {
      const sec = current();
      const list = filtered();
      view.page = Math.min(view.page, pageCount() - 1);
      const start = view.page * perPage;
      const shown = list.slice(start, start + perPage);
      viewport.replaceChildren(...shown.map(({ item, entry }) => {
        const wrap = el('div', 'home-track-item');
        wrap.setAttribute('role', 'listitem');
        wrap.append(tile(item, entry));
        return wrap;
      }));
      if (!shown.length) {
        const message = sec.items.length ? sec.emptyCategory : sec.emptyMessage;
        const empty = el('div', 'home-track-empty');
        if (!sec.items.length) empty.append(el('span', 'home-track-tag', 'Coming Soon'));
        empty.append(el('p', '', message));
        viewport.replaceChildren(empty);
      }
      prevPage.disabled = view.page === 0;
      nextPage.disabled = view.page >= pageCount() - 1;
      status.textContent = shown.length
        ? `${sec.title}: page ${view.page + 1} of ${pageCount()}`
        : `${sec.title}: ${sec.items.length ? sec.emptyCategory : sec.emptyMessage}`;
    }

    // Level 1: a new section starts on its first category and first page.
    function switchSection(delta) {
      const next = sectionIndex + delta;
      if (next < 0 || next >= sections.length) return;
      sectionIndex = next;
      view.category = '';
      view.page = 0;
      renderHead();
      renderPage();
    }

    // Level 2: page within the current category.
    function turnPage(delta) {
      const next = view.page + delta;
      if (next < 0 || next >= pageCount()) return;
      view.page = next;
      renderPage();
    }

    function selectCategory(value) {
      view.category = value;
      view.page = 0;
      renderHead();
      renderPage();
    }

    prevSection.addEventListener('click', () => switchSection(-1));
    nextSection.addEventListener('click', () => switchSection(1));
    prevPage.addEventListener('click', () => turnPage(-1));
    nextPage.addEventListener('click', () => turnPage(1));

    function start() {
      perPage = measure();
      renderHead();
      renderPage();
      if (window.ResizeObserver) {
        new ResizeObserver(() => {
          const fit = measure();
          if (fit === perPage) return;
          // Keep the first visible card on screen when the page size changes.
          const first = view.page * perPage;
          perPage = fit;
          view.page = Math.floor(first / perPage);
          renderPage();
        }).observe(viewport);
      }
    }

    // Replace the cards of document-driven sections, keeping the current
    // section, category and (where it still exists) page.
    function setItems(cards) {
      let changed = false;
      sections.forEach(sec => { if (sec.component) { sec.items = liveItems(cards); changed = true; } });
      if (changed) renderPage();
    }

    // Bring a document card onto the current page (the card editor's live
    // preview): its section, then "all" if the filter hides it, then its page.
    // Nothing changes if it is already shown.
    function reveal(cardId) {
      const target = sections.findIndex(sec => sec.component && sec.items.some(({ item }) => item.id === cardId));
      if (target < 0) return false;
      if (target !== sectionIndex) { sectionIndex = target; view.category = ''; view.page = 0; renderHead(); }
      let index = filtered().findIndex(({ item }) => item.id === cardId);
      if (index < 0) { view.category = ''; renderHead(); index = filtered().findIndex(({ item }) => item.id === cardId); }
      const page = Math.floor(index / perPage);
      if (page !== view.page || !viewport.querySelector(`[data-cms-id="${CSS.escape(cardId)}"]`)) { view.page = page; renderPage(); }
      return true;
    }

    return { element: section, start, setItems, reveal };
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
    const card = featureCard(key === 'spotlight' ? 'spotlight' : 'featured');
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
  if (content.explore) {
    const lower = el('div', 'home-lower');
    explore = carousel(content.explore, model.carousel);
    lower.append(explore.element);
    root.append(lower);
  }
  // Take the shared sidebar into this grid (layout.js holds it back on pages
  // with data-layout="home"). The page title stays first in reading order.
  if (window.PergamonLayout) window.PergamonLayout.mountSidebar(root, upper);
  // Pages are sized from the carousel's measured width, so render once it is in place.
  if (explore) explore.start();

  // ── Public API ────────────────────────────────────────────────────────
  // render(doc, { media }) redraws the cards from another document in place
  // (published content, or an admin's working copy). Returns false, and
  // leaves the page as it is, if the document can't be read. Cards are
  // addressed by component id; the featured/spotlight slots exist from the
  // first render, so a document can change their content but not add slots.
  window.PergamonHome = {
    render(doc, extra) {
      const next = cms.toModel(doc, Object.assign({}, staticCtx, extra || {}));
      if (!next) return false;
      model = next;
      if (cards['home.featured'] && next.featured) cards['home.featured'].apply(next.featured);
      if (cards['home.spotlight'] && next.spotlight) cards['home.spotlight'].apply(next.spotlight);
      if (explore) explore.setItems(next.carousel);
      return true;
    },
    model: () => model,
    cardIds: () => Object.keys(cards).concat(model.carousel.map(c => c.id)),
    element: id => (cards[id] ? cards[id].element : root.querySelector(`.home-tile[data-cms-id="${CSS.escape(id)}"]`)),
    // Make sure a card is drawn (carousel cards may be on another page or filtered out).
    reveal: id => (cards[id] ? true : !!(explore && explore.reveal(id)))
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
