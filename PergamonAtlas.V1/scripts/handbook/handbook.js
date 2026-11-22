// The Atlas Handbook: an internal, read-only design-system catalogue for
// administrators. Loaded by gate.js only after the server confirms an admin.
//
//   GROUPS       the Handbook's navigation, defined here in code. While the
//                Handbook is open it replaces the site sidebar's destinations
//                (PergamonLayout.setNavigation, the same sidebar component as
//                the rest of the site); leaving or losing access restores them
//   routes       #/<path> (one page, no server routes needed): overview,
//                vision, foundations[/<id>], library[/<id>]; anything after a
//                registered path is passed on as ctx.rest (e.g.
//                #/vision/north-star), and a renderer with navigate(rest)
//                handles changes to it without a re-render
//   renderers    PergamonHandbook.app.register(path, { render(el, ctx), specimen?, navigate? })
//                (typography-page.js, vision-page.js, widgets-page.js)
//   frame mode   /handbook/?view=specimen#/<path> draws only that section's
//                specimen (renderer.specimen) without the site chrome, for the
//                phone-width preview <iframe>
//
// Everything is drawn with the site's own tokens and type roles
// (styles/theme.css, styles/typography.css); handbook.css only lays it out.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};

  // Sidebar icons for the Handbook's own sections (24px grid, stroked like the site's).
  const ICONS = {
    book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5z"/><path d="M6 21h13v-2M8 7h7"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    vision: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    typography: '<path d="M5 7V4h14v3M12 4v16M9 20h6"/>',
    colors: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
    spacing: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    motion: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    elements: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    widgets: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><path d="M17 13v8M13 17h8"/>',
    layouts: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>'
  };

  const GROUPS = [
    { id: 'overview', label: 'Overview', items: [
      { path: 'overview', label: 'Dashboard', icon: 'dashboard' },
      { path: 'vision', label: 'Vision', icon: 'vision', text: 'Where Atlas is heading: the long-term architecture, in the team’s own words.' }
    ] },
    { id: 'foundations', label: 'Foundations', text: 'The shared design decisions everything else is built from.', items: [
      { path: 'foundations/typography', label: 'Typography', icon: 'typography', text: 'Type roles, font families and text styles, drawn by the live stylesheet.' },
      { path: 'foundations/colors', label: 'Colors', icon: 'colors', text: 'The four palettes in dark and light mode, the colour roles built on them, and contrast checks.' },
      { path: 'foundations/spacing', label: 'Spacing', icon: 'spacing', text: 'A spacing scale, radii, breakpoints and the page frame.' },
      { path: 'foundations/motion', label: 'Motion', icon: 'motion', text: 'Durations, easing and reduced-motion rules, including the carousel’s glide.' }
    ] },
    { id: 'library', label: 'Library', text: 'The reusable parts Atlas pages are made of, from small elements to whole layouts.', items: [
      { path: 'library/elements', label: 'Elements', icon: 'elements', text: 'Buttons, labels, fields, tags and icons: the small parts every page shares.' },
      { path: 'library/widgets', label: 'Widgets', icon: 'widgets', text: 'Navigation, Featured Game, Spotlight, the games carousel and other reusable components.' },
      { path: 'library/layouts', label: 'Layouts', icon: 'layouts', text: 'Page structures and arrangements: home, catalogue, game and account pages.' }
    ] }
  ];
  // Addresses from earlier versions of the Handbook.
  const ALIASES = { elements: 'library/elements', widgets: 'library/widgets', pages: 'library/layouts', exceptions: 'foundations/typography' };

  const renderers = {};
  let root = null;
  let content = null;
  let cleanup = null;
  let firstRender = true;
  let shownPath = null;
  const frame = new URLSearchParams(window.location.search).get('view') === 'specimen';

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const chip = (text, tone) => el('span', 'pa-type-label hb-chip' + (tone ? ' hb-chip--' + tone : ''), text);
  function icon(name, cls) {
    const span = el('span', cls || 'hb-icon');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name] || ''}</svg>`;
    return span;
  }

  // ── Routing ───────────────────────────────────────────────────────────
  const pages = () => GROUPS.flatMap(g => g.items.map(item => ({ path: item.path, item, group: g })));
  const groupPage = id => GROUPS.find(g => g.id === id && id !== 'overview');
  function current() {
    let path = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
    if (ALIASES[path]) path = ALIASES[path];
    const exact = pages().find(p => p.path === path);
    if (exact) return Object.assign({ rest: '' }, exact);
    if (groupPage(path)) return { path, group: groupPage(path), item: null, rest: '' };
    const base = pages().find(p => renderers[p.path] && path.indexOf(p.path + '/') === 0);
    if (base) return Object.assign({ rest: path.slice(base.path.length + 1) }, base);
    return Object.assign({ rest: '' }, pages()[0]);
  }
  const ready = path => path === 'overview' || !!renderers[path];

  // ── The site sidebar shows the Handbook's sections ────────────────────
  function sidebarNav(path) {
    return {
      label: 'Handbook sections',
      prefKey: 'paHandbookSidebarCollapsed',
      title: { label: 'Handbook', icon: 'book' },
      icons: ICONS,
      sections: GROUPS.map(g => ({ title: g.label, items: g.items.map(i => ({ label: i.label, icon: i.icon, href: '#/' + i.path })) })),
      current: '#/' + path
    };
  }
  function showSidebar(path) {
    const layout = window.PergamonLayout;
    if (!layout || !layout.setNavigation || frame) return;
    // A group page marks nothing; a page inside a section marks that section.
    const mark = pages().some(p => p.path === path) ? path : '';
    layout.setNavigation(sidebarNav(mark));
  }

  // ── Shared page parts ─────────────────────────────────────────────────
  function crumbs(here) {
    const nav = el('nav', 'hb-crumbs pa-type-body-small');
    nav.setAttribute('aria-label', 'Breadcrumb');
    const ol = el('ol');
    const add = (label, href) => {
      const li = el('li');
      if (href) { const a = el('a', '', label); a.href = href; li.append(a); }
      else { const s = el('span', '', label); s.setAttribute('aria-current', 'page'); li.append(s); }
      ol.append(li);
    };
    add('Handbook', here.path === 'overview' ? null : '#/overview');
    if (here.group && here.group.id !== 'overview') add(here.group.label, here.item ? '#/' + here.group.id : null);
    if (here.item && here.path !== 'overview') add(here.item.label, null);
    nav.append(ol);
    return nav;
  }
  function header(title, lead, chips) {
    const head = el('header', 'hb-page-head');
    const h = el('h1', 'pa-type-page-title hb-page-title', title);
    h.tabIndex = -1;
    head.append(h);
    if (lead) head.append(el('p', 'pa-type-body hb-lead', lead));
    if (chips && chips.length) { const row = el('div', 'hb-chips'); chips.forEach(c => row.append(c)); head.append(row); }
    return head;
  }

  // Small, restrained illustrations for the catalogue cards: drawn with the
  // site's own tokens and type roles, never images.
  function preview(kind) {
    const box = el('div', 'hb-pv hb-pv--' + kind);
    box.setAttribute('aria-hidden', 'true');
    const add = (cls, text) => { const n = el('span', cls, text); box.append(n); return n; };
    if (kind === 'foundations' || kind === 'typography') {
      add('hb-pv-aa', 'Aa');
      const meta = add('hb-pv-stack');
      meta.append(el('span', 'hb-pv-line hb-pv-line--title'), el('span', 'hb-pv-line'), el('span', 'hb-pv-line hb-pv-line--short'));
      if (kind === 'foundations') { const sw = add('hb-pv-swatches'); ['accent', 'surface', 'text'].forEach(s => sw.append(el('span', 'hb-pv-swatch hb-pv-swatch--' + s))); }
    } else if (kind === 'colors') {
      const sw = add('hb-pv-swatches hb-pv-swatches--large');
      ['accent', 'accent-soft', 'surface', 'border', 'text'].forEach(s => sw.append(el('span', 'hb-pv-swatch hb-pv-swatch--' + s)));
    } else if (kind === 'spacing') {
      [16, 32, 56, 88].forEach(w => { const b = add('hb-pv-bar'); b.style.width = w + 'px'; });
    } else if (kind === 'motion') {
      box.innerHTML = '<svg class="hb-pv-curve" viewBox="0 0 120 60"><path d="M4 56C40 56 46 4 116 4"/><circle cx="116" cy="4" r="4"/></svg>';
    } else if (kind === 'elements') {
      add('hb-pv-button pa-type-button-small', 'Play now');
      add('pa-type-label hb-chip hb-chip--active', 'New');
      add('hb-pv-field');
      add('hb-pv-toggle');
    } else if (kind === 'widgets') {
      const rail = add('hb-pv-rail');
      for (let i = 0; i < 4; i++) rail.append(el('span', 'hb-pv-dot' + (i ? '' : ' is-on')));
      const card = add('hb-pv-card');
      card.append(el('span', 'hb-pv-card-rule'), el('span', 'hb-pv-card-title', 'Chess Forge'), el('span', 'hb-pv-card-cta'));
    } else if (kind === 'layouts') {
      add('hb-pv-wire hb-pv-wire--head'); add('hb-pv-wire hb-pv-wire--side'); add('hb-pv-wire hb-pv-wire--main'); add('hb-pv-wire hb-pv-wire--wide');
    }
    return box;
  }

  // One catalogue card: preview, name, description, state.
  function card(path, title, text, kind, state) {
    const li = el('li', 'hb-cat' + (state === 'planned' ? ' is-planned' : ''));
    const a = el('a', 'hb-cat-link');
    a.href = '#/' + path;
    const body = el('span', 'hb-cat-body');
    const name = el('span', 'hb-cat-name pa-type-section-title', title);
    const row = el('span', 'hb-cat-row');
    row.append(name, chip(state === 'planned' ? 'Planned' : state === 'ready' ? 'Ready' : state, state === 'planned' ? 'muted' : 'active'));
    body.append(row, el('span', 'hb-cat-text pa-type-body-small', text));
    a.append(preview(kind), body);
    li.append(a);
    return li;
  }

  // ── Pages ─────────────────────────────────────────────────────────────
  function overview(view) {
    view.append(header('Atlas Handbook', 'The design system and component library behind Pergamon Atlas: the shared foundations, the parts pages are built from, and how they fit together.'));

    const cats = el('ul', 'hb-cats hb-cats--four');
    cats.setAttribute('aria-label', 'Catalogue');
    const library = GROUPS[2];
    cats.append(
      card('foundations', 'Foundations', 'Typography, colors, spacing and motion: the decisions every element is built from.', 'foundations', 'Typography and Colors ready'),
      card('library/elements', 'Elements', library.items[0].text, 'elements', 'planned'),
      card('library/widgets', 'Widgets', 'Larger reusable components: navigation, Featured Game, Spotlight and the games carousel.', 'widgets', 'ready'),
      card('library/layouts', 'Layouts', library.items[2].text, 'layouts', 'planned')
    );

    const vision = el('a', 'hb-banner');
    vision.href = '#/vision';
    const vt = el('span', 'hb-banner-text');
    vt.append(el('span', 'pa-type-label hb-banner-kicker', 'Vision & Architecture'),
      el('span', 'pa-type-section-title-large', 'Where Atlas is heading'),
      el('span', 'pa-type-body-small hb-muted', 'The long-term plan for foundations, widgets, layouts and visual editing.'));
    vision.append(icon('vision', 'hb-banner-icon'), vt, el('span', 'hb-banner-go pa-type-button-small', 'Read the vision'));

    view.append(cats, vision,
      el('p', 'pa-type-caption hb-muted hb-foot', 'Read-only. Sections marked Planned are listed so the structure is in place before they arrive.'));
  }

  function group(view, g) {
    view.append(header(g.label, g.text));
    const cats = el('ul', 'hb-cats');
    g.items.forEach(i => cats.append(card(i.path, i.label, i.text, i.icon, ready(i.path) ? 'ready' : 'planned')));
    view.append(cats);
  }

  function planned(view, here) {
    view.append(header(here.item.label, here.item.text, [chip('Planned', 'muted')]));
    const box = el('section', 'hb-planned');
    box.append(preview(here.item.icon), el('h2', 'pa-type-section-title', 'Not built yet'),
      el('p', 'pa-type-body-small hb-muted', 'This section is part of the Handbook’s structure and arrives in a later phase. Until then, the live site is the reference.'));
    view.append(box);
  }

  function render() {
    if (!root) return;
    const here = current();
    const r = renderers[here.path];
    // Same page, new position within it (e.g. a vision section): no re-render.
    if (!frame && here.path === shownPath && r && r.navigate) { r.navigate(here.rest); return; }
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    shownPath = here.path;
    const view = el('div', 'hb-view');
    const ctx = { el, chip, header, icon, frame, rest: here.rest, sidebarNav, onCleanup: fn => { cleanup = fn; } };
    if (frame) {
      if (r && r.specimen) r.specimen(view, ctx); else view.append(el('p', 'pa-type-body', 'No specimen for this section.'));
    } else {
      view.append(crumbs(here));
      if (here.path === 'overview') overview(view);
      else if (r) r.render(view, ctx);
      else if (!here.item && here.group) group(view, here.group);
      else planned(view, here);
    }
    content.replaceChildren(view);
    const name = here.item ? here.item.label : here.group ? here.group.label : 'Atlas Handbook';
    document.title = (here.path === 'overview' ? 'Atlas Handbook' : name + ' · Atlas Handbook') + ' · Pergamon Atlas';
    if (!frame) {
      showSidebar(here.path);
      // Move focus to the new page's heading (not on first load).
      if (!firstRender && !here.rest) { const h = content.querySelector('h1'); if (h) h.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    }
    firstRender = false;
  }

  ns.app = {
    register(path, renderer) { renderers[path] = renderer; },
    start(target) {
      if (root) ns.app.stop();
      root = target;
      root.classList.add('hb-root');
      content = el('div', frame ? 'hb-frame' : 'hb-content');
      if (frame) document.documentElement.setAttribute('data-handbook-frame', '');
      const shell = el('div', 'hb');
      shell.append(content);
      root.replaceChildren(frame ? content : shell);
      // The site sidebar sits in the Handbook's grid as the floating rail,
      // as on the homepage (the same component and styles).
      if (!frame && window.PergamonLayout && window.PergamonLayout.mountSidebar) {
        window.PergamonLayout.mountSidebar(shell, content);
        shell.classList.add('has-sidebar');
      }
      window.addEventListener('hashchange', render);
      render();
    },
    stop() {
      window.removeEventListener('hashchange', render);
      if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
      if (root) root.classList.remove('hb-root');
      if (!frame && window.PergamonLayout && window.PergamonLayout.clearNavigation) {
        window.PergamonLayout.clearNavigation();
        if (window.PergamonLayout.unmountSidebar) window.PergamonLayout.unmountSidebar();
      }
      root = null; content = null; firstRender = true; shownPath = null;
    },
    groups: GROUPS,
    icons: ICONS
  };
})();
