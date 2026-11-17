// Homepage renderer. Content lives in /data/home-content.js and game lookups
// in /data/entries.js; this file only builds structure.
//
// Included as a plain script right after <div id="home">, so the page renders
// while it is still parsing (no layout shift once the rest loads).
//
// Components: banner() for the featured and spotlight banners,
// contextPanel() for the right-hand panel, carousel() + tile() for the game
// strip. Each returns an element and knows nothing about the page grid.
(function () {
  const content = window.PergamonHomeContent;
  const root = document.getElementById('home');
  if (!content || !root) return;

  const ICONS = {
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    prev: '<path d="m15 6-6 6 6 6"/>',
    next: '<path d="m9 6 6 6-6 6"/>',
    games: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M7 10v4M5 12h4M15.5 11h.01M18 13h.01"/>'
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

  // ── Banner (featured / spotlight) ─────────────────────────────────────
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

    if (variant === 'featured') {
      copy.append(action);
      section.append(copy, art(item.art, 'home-banner-art'));
    } else {
      const actions = el('div', 'home-banner-action');
      actions.append(action);
      section.append(copy, art(item.art, 'home-banner-art'), actions);
    }
    return section;
  }

  // ── Contextual panel (purpose undecided: neutral placeholder) ─────────
  function contextPanel(data) {
    const panel = el('aside', 'home-context');
    panel.dataset.slot = 'context';
    const headingId = uid('home-context');
    panel.setAttribute('aria-labelledby', headingId);
    const h = el('h2', 'home-context-title', data.title); h.id = headingId;
    const list = el('ul', 'home-context-list');
    data.items.forEach(label => {
      const li = el('li', 'home-context-row');
      li.append(art(null, 'home-context-thumb'), el('span', 'home-context-label', label));
      list.append(li);
    });
    panel.append(h, list);
    if (data.action) {
      // Placeholder only: not a control, so it isn't focusable or clickable.
      panel.append(el('div', 'home-context-action', data.action));
    }
    return panel;
  }

  // ── Carousel tile ─────────────────────────────────────────────────────
  function tile(game, entry) {
    const card = el('a', 'home-tile');
    card.href = norm(entry.path) + '/';
    card.dataset.category = game.category;
    card.append(art(game.art, 'home-tile-art'));
    const meta = el('div', 'home-tile-meta');
    const text = el('div', 'home-tile-text');
    text.append(el('h3', 'home-tile-title', game.title || entry.name), el('span', 'home-tile-category', game.category));
    meta.append(text);
    meta.insertAdjacentHTML('beforeend', icon('play', 'home-tile-play'));
    card.append(meta);
    return card;
  }

  // ── Carousel ──────────────────────────────────────────────────────────
  function carousel(data) {
    const section = el('section', 'home-carousel');
    const headingId = uid('home-carousel');
    section.setAttribute('aria-labelledby', headingId);

    const head = el('div', 'home-carousel-head');
    const h = el('h2', 'home-carousel-title'); h.id = headingId;
    h.innerHTML = icon('games', 'home-carousel-icon');
    h.append(el('span', '', data.title));

    const tabs = el('div', 'home-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Filter games by category');
    const tabButtons = data.categories.map((name, i) => {
      const b = el('button', 'home-tab', name);
      b.type = 'button';
      b.dataset.category = i === 0 ? '' : name;
      b.setAttribute('aria-pressed', String(i === 0));
      tabs.append(b);
      return b;
    });

    const nav = el('div', 'home-carousel-nav');
    const prev = el('button', 'home-nav-button'); prev.type = 'button';
    prev.setAttribute('aria-label', 'Scroll games left'); prev.innerHTML = icon('prev');
    const next = el('button', 'home-nav-button'); next.type = 'button';
    next.setAttribute('aria-label', 'Scroll games right'); next.innerHTML = icon('next');
    nav.append(prev, next);
    head.append(h, tabs, nav);

    const track = el('div', 'home-track');
    track.setAttribute('role', 'list');
    track.setAttribute('aria-label', data.title);
    const tiles = [];
    data.games.forEach(game => {
      const entry = liveGame(game.path);
      if (!entry) { console.warn('Homepage: carousel game is not a live page:', game.path); return; }
      const item = el('div', 'home-track-item');
      item.setAttribute('role', 'listitem');
      item.dataset.category = game.category;
      item.append(tile(game, entry));
      track.append(item);
      tiles.push(item);
    });
    const empty = el('p', 'home-track-empty', 'No games in this category yet.');
    empty.hidden = true;
    track.append(empty);

    section.append(head, track);

    // Filtering: show only tiles whose category matches the pressed tab.
    tabButtons.forEach(b => b.addEventListener('click', () => {
      tabButtons.forEach(t => t.setAttribute('aria-pressed', String(t === b)));
      let shown = 0;
      tiles.forEach(item => {
        const match = !b.dataset.category || item.dataset.category === b.dataset.category;
        item.hidden = !match;
        if (match) shown++;
      });
      empty.hidden = shown > 0;
      track.scrollLeft = 0;
      updateNav();
    }));

    // Scroll buttons step by most of a view; disabled at either end.
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const step = dir => track.scrollBy({ left: dir * Math.max(track.clientWidth * 0.8, 180), behavior: reduceMotion ? 'auto' : 'smooth' });
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    function updateNav() {
      const max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= max - 1;
    }
    track.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', updateNav);
    requestAnimationFrame(updateNav);
    return section;
  }

  // ── Page ──────────────────────────────────────────────────────────────
  // .home is the shell grid: sidebar | upper on row 1, lower across row 2.
  const title = el('h1', 'pa-visually-hidden', 'PergamonAtlas');
  const upper = el('div', 'home-upper');
  const grid = el('div', 'home-feature-grid');
  const banners = el('div', 'home-banners');
  if (content.featured) banners.append(banner(content.featured, 'featured'));
  if (content.spotlight) banners.append(banner(content.spotlight, 'spotlight'));
  grid.append(banners);
  if (content.context) grid.append(contextPanel(content.context));
  else grid.classList.add('no-context');

  upper.append(grid);
  root.append(title, upper);
  if (content.explore) {
    const lower = el('div', 'home-lower');
    lower.append(carousel(content.explore));
    root.append(lower);
  }
  // Take the shared sidebar into this grid (layout.js holds it back on pages
  // with data-layout="home"). The page title stays first in reading order.
  if (window.PergamonLayout) window.PergamonLayout.mountSidebar(root, upper);

  // A password-reset link that Supabase sent to the Site URL (the homepage)
  // instead of the reset page: finish it there. auth.js loads after this file.
  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.PergamonAuth;
    if (!auth) return;
    try {
      auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') {
          try { sessionStorage.setItem('pa-password-recovery', '1'); } catch (e) {}
          window.location.replace('/account/reset-password/');
        }
      });
    } catch (e) {}
  });
})();
