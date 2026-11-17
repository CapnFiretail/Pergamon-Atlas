// Homepage renderer. Content lives in /data/home-content.js and game lookups
// in /data/entries.js; this file only builds structure.
//
// Included as a plain script right after <div id="home">, so the page renders
// while it is still parsing (no layout shift once the rest loads).
//
// Components: featureCard() for the featured game, banner() for the spotlight,
// atlasNavigation() for the right-hand panel, carousel() + tile() for the
// explore strip. Each returns an element and knows nothing about the page grid.
(function () {
  const content = window.PergamonHomeContent;
  const root = document.getElementById('home');
  if (!content || !root) return;

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

  // Neutral artwork slot. A later stage swaps in real art via `art`.
  function art(src, className) {
    const box = el('div', 'home-art ' + (className || ''));
    box.setAttribute('aria-hidden', 'true');
    if (src) {
      const img = el('img'); img.src = src; img.alt = '';
      box.append(img);
    } else {
      box.append(el('span', 'home-art-label', 'Artwork'));
    }
    return box;
  }

  // ── Data ──────────────────────────────────────────────────────────────
  const entries = (window.atlasEntries && window.atlasEntries.games) || [];
  const norm = path => String(path || '').replace(/\/+$/, '');
  const liveGame = path => entries.find(e => norm(e.path) === norm(path) && !e.archived && e.visibility === 'public' && e.status !== 'coming-soon') || null;

  // ── Featured card ─────────────────────────────────────────────────────
  // Full-bleed artwork, a left-hand shade, then the title lockup (ornament
  // rules around a live heading) and the Play Now link. Everything but the
  // image comes from CSS, so another game only needs new data.
  function featureCard(item) {
    const section = el('section', 'home-banner home-banner--featured home-feature');
    const headingId = uid('home-feature');
    section.setAttribute('aria-labelledby', headingId);

    const a = item.art;
    if (a && a.src) {
      const img = el('img', 'home-feature-art');
      img.src = a.src;
      if (a.srcset) { img.srcset = a.srcset; img.sizes = '(max-width: 900px) 100vw, 60vw'; }
      if (a.width) img.width = a.width;
      if (a.height) img.height = a.height;
      img.alt = a.alt || '';
      if (!a.alt) img.setAttribute('aria-hidden', 'true');
      img.decoding = 'async';
      img.setAttribute('fetchpriority', 'high');
      if (a.focus) section.style.setProperty('--feature-focus', a.focus);
      if (a.focusNarrow) section.style.setProperty('--feature-focus-narrow', a.focusNarrow);
      section.append(img);
    }
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
    const h = el('h2', 'home-feature-title', item.title); h.id = headingId;
    lockup.append(rule('top'), h, rule('bottom'));

    const action = el('a', 'home-feature-play');
    action.href = item.href;
    action.setAttribute('aria-label', `${item.cta}: ${item.title}`);
    action.innerHTML = icon('playSolid', 'home-feature-play-icon');
    action.append(el('span', '', item.cta));

    copy.append(lockup, action);
    section.append(shade, copy);
    return section;
  }

  // ── Banner (spotlight) ────────────────────────────────────────────────
  function banner(item, variant) {
    const section = el('section', `home-banner home-banner--${variant}`);
    const headingId = uid('home-banner');
    section.setAttribute('aria-labelledby', headingId);

    const copy = el('div', 'home-banner-copy');
    copy.append(el('p', 'home-eyebrow', item.label));
    const h = el('h2', 'home-banner-title', item.title); h.id = headingId;
    copy.append(h, el('p', 'home-banner-desc', item.description));

    const action = el('a', 'home-button');
    action.href = item.href;
    action.setAttribute('aria-label', `${item.cta}: ${item.title}`);
    action.innerHTML = icon('play', 'home-button-icon');
    action.append(el('span', '', item.cta));

    const actions = el('div', 'home-banner-action');
    actions.append(action);
    section.append(copy, art(item.art, 'home-banner-art'), actions);
    return section;
  }

  // ── Atlas Navigation (right-hand panel) ───────────────────────────────
  // Whole-row links. The account row reads "Account" for signed-in visitors:
  // first from theme.js's stored-session guess (so the first paint is right),
  // then from the auth client once it reports (see the bottom of this file).
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

  function carousel(data) {
    const sections = data.sections.map(sec => ({
      ...sec,
      items: (sec.items || []).map(item => {
        if (!item.path) return null;
        const entry = liveGame(item.path);
        if (!entry) { console.warn('Homepage: carousel item is not a live page:', item.path); return null; }
        return { item, entry };
      }).filter(Boolean)
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

    return { element: section, start };
  }

  // ── Page ──────────────────────────────────────────────────────────────
  // .home is the shell grid: sidebar | upper on row 1, lower across row 2.
  const title = el('h1', 'pa-visually-hidden', 'PergamonAtlas');
  const upper = el('div', 'home-upper');
  const grid = el('div', 'home-feature-grid');
  const banners = el('div', 'home-banners');
  if (content.featured) banners.append(featureCard(content.featured));
  if (content.spotlight) banners.append(banner(content.spotlight, 'spotlight'));
  grid.append(banners);
  if (content.context) grid.append(atlasNavigation(content.context));
  else grid.classList.add('no-context');

  upper.append(grid);
  root.append(title, upper);
  let explore = null;
  if (content.explore) {
    const lower = el('div', 'home-lower');
    explore = carousel(content.explore);
    lower.append(explore.element);
    root.append(lower);
  }
  // Take the shared sidebar into this grid (layout.js holds it back on pages
  // with data-layout="home"). The page title stays first in reading order.
  if (window.PergamonLayout) window.PergamonLayout.mountSidebar(root, upper);
  // Pages are sized from the carousel's measured width, so render once it is in place.
  if (explore) explore.start();

  // A password-reset link that Supabase sent to the Site URL (the homepage)
  // instead of the reset page: finish it there. auth.js loads after this file.
  // The same listener keeps the Atlas Navigation account row in step.
  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.PergamonAuth;
    if (!auth) return;
    auth.getSession()
      .then(res => setAccountState(!!(res && res.data && res.data.session)))
      .catch(() => {});
    try {
      auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          try { sessionStorage.setItem('pa-password-recovery', '1'); } catch (e) {}
          window.location.replace('/account/reset-password/');
          return;
        }
        setAccountState(!!session);
      });
    } catch (e) {}
  });
})();
