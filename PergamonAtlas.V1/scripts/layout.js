// Shared site chrome: header, sidebar and the mobile drawer.
//
// Every page includes this as a plain (synchronous) script at the top of
// .pa-page. It writes the header and sidebar in place while the page is
// still parsing, so they are present on first paint with no layout shift.
// Requires /scripts/theme.js in <head> (sets data-sidebar on <html>).
//
// Sidebar navigation: one renderer, different destinations (data only).
//   Site Navigation  every regular page. Administrators edit it in Admin Mode
//                    (component `site.sidebar` of the homepage CMS document,
//                    published with the homepage); BUILT_IN_NAV is the fallback
//                    when nothing is published (or the CMS can't be reached).
//                    The last published version is cached in localStorage so
//                    later visits draw it on first paint.
//   override         a page section with its own navigation (the Handbook)
//                    replaces the destinations while it is open:
//                    PergamonLayout.setNavigation({ sections, icons, title, current })
//                    / clearNavigation().
//   preview          Admin Mode's unsaved Site Navigation, on the homepage only.
// Hiding or removing a link never protects a page: pages keep their own checks.
//
// Layout modes (data-layout on .pa-page):
//   (none)  the sidebar is a fixed rail below the header, full height.
//   home    the sidebar is not inserted here; the page mounts it inside its
//           own grid with PergamonLayout.mountSidebar(parent, before)
//           (see home.js).
//           If the page never does, it falls back to the default position.
// On tablet and phone widths the sidebar is the slide-out drawer in both modes.
(function () {
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    games: '<rect x="2" y="6" width="20" height="12" rx="4"/><path d="M7 10v4M5 12h4M15.5 11h.01M18 13h.01"/>',
    suggestions: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    achievements: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 21h7M10 17h4v4h-4z"/>',
    leaderboards: '<path d="M4 20V11h4v9M10 20V5h4v15M16 20v-6h4v6M3 20h18"/>',
    updates: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    account: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3.2"/><path d="M6.2 18.4a6.5 6.5 0 0 1 11.6 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m15 6-6 6 6 6"/>'
  };

  // Text links inside the header capsule.
  var HEADER_LINKS = [
    { href: '/', label: 'Home' },
    { href: '/games/', label: 'Games' },
    { href: '/suggestions/', label: 'Suggestions' }
  ];

  // Site Navigation, built in: the fallback, and where a new site.sidebar
  // starts. Same shape as the CMS component (validated by the server's
  // cms_check_nav, 0013): groups separated by a divider, items in order.
  var BUILT_IN_NAV = {
    sections: [
      { items: [
        { id: 'home', label: 'Home', icon: 'home', href: '/', visible: true },
        { id: 'games', label: 'Games', icon: 'games', href: '/games/', visible: true },
        { id: 'suggestions', label: 'Suggestions', icon: 'suggestions', href: '/suggestions/', visible: true }
      ] },
      { items: [
        { id: 'achievements', label: 'Achievements', icon: 'achievements', href: '/achievements/', visible: true },
        { id: 'leaderboards', label: 'Leaderboards', icon: 'leaderboards', href: '/leaderboards/', visible: true }
      ] }
    ]
  };
  // What Site Navigation may contain (mirrors cms_check_nav; the server decides).
  var NAV_ICONS = ['home', 'games', 'suggestions', 'achievements', 'leaderboards', 'updates', 'settings', 'account'];
  var NAV_PAGES = [
    { href: '/', label: 'Home' }, { href: '/games/', label: 'Games' }, { href: '/suggestions/', label: 'Suggestions' },
    { href: '/achievements/', label: 'Achievements' }, { href: '/leaderboards/', label: 'Leaderboards' },
    { href: '/updates/', label: 'Update Log' }, { href: '/settings/', label: 'Settings' }, { href: '/account/', label: 'Account' }
  ];
  var NAV_LIMITS = { sections: 4, perSection: 12, total: 16, label: 24 };
  var NAV_CACHE = 'pa-site-nav';

  var root = document.documentElement;
  var section = function (path) { return '/' + (String(path).split('/')[1] || ''); };
  var current = section(window.location.pathname);
  var isCurrent = function (href) { return section(href) === current; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var icon = function (name, set) { return '<svg class="pa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ((set && set[name]) || ICONS[name] || '') + '</svg>'; };
  var currentAttr = function (href) { return isCurrent(href) ? ' aria-current="page"' : ''; };

  // A Site Navigation document this code can draw: right shape, known icons,
  // the site's own pages (or a game page) only, plain labels. Anything else
  // (a damaged cache, an unexpected answer) falls back to the built-in links.
  var GAME_PATH = /^\/games\/[a-z0-9][a-z0-9-]{0,63}\/$/;
  function validNav(nav) {
    if (!nav || typeof nav !== 'object' || !Array.isArray(nav.sections)) return false;
    if (nav.sections.length < 1 || nav.sections.length > NAV_LIMITS.sections) return false;
    var ids = {}, total = 0;
    for (var s = 0; s < nav.sections.length; s++) {
      var items = nav.sections[s] && nav.sections[s].items;
      if (!Array.isArray(items) || items.length < 1 || items.length > NAV_LIMITS.perSection) return false;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        total++;
        if (!it || typeof it.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(it.id) || ids[it.id]) return false;
        ids[it.id] = true;
        if (typeof it.label !== 'string' || !it.label.trim() || it.label.length > NAV_LIMITS.label || /[<>]/.test(it.label)) return false;
        if (NAV_ICONS.indexOf(it.icon) < 0 || typeof it.visible !== 'boolean') return false;
        if (typeof it.href !== 'string' || !(NAV_PAGES.some(function (p) { return p.href === it.href; }) || GAME_PATH.test(it.href))) return false;
      }
    }
    return total <= NAV_LIMITS.total;
  }

  // The sections' links (visible items only; empty groups left out).
  // opts: { icons, current(href) → bool, headings: true }
  function navHtml(nav, opts) {
    opts = opts || {};
    var all = [];
    nav.sections.forEach(function (s) { s.items.forEach(function (it) { if (it.visible !== false) all.push(it.href); }); });
    // The page's own link if there is one, otherwise its section's (a game page marks Games).
    var exact = all.indexOf(window.location.pathname) >= 0;
    var on = opts.current || function (href) { return exact ? href === window.location.pathname : isCurrent(href); };
    return nav.sections.map(function (s) {
      var items = s.items.filter(function (it) { return it.visible !== false; });
      if (!items.length) return '';
      return '<div class="pa-sidebar-section">' +
        (s.title ? '<p class="pa-sidebar-heading">' + esc(s.title) + '</p>' : '') +
        items.map(function (item) {
          var here = on(item.href);
          return '<a href="' + esc(item.href) + '" data-tip="' + esc(item.label) + '"' +
            (here ? ' class="active" aria-current="page"' : '') + '>' +
            icon(item.icon, opts.icons) + '<span class="pa-nav-label">' + esc(item.label) + '</span></a>';
        }).join('') +
      '</div>';
    }).join('');
  }

  function readNavCache() {
    try {
      var c = JSON.parse(localStorage.getItem(NAV_CACHE) || 'null');
      if (c && (c.nav === null || validNav(c.nav))) return c.nav;
    } catch (e) {}
    return undefined;
  }
  var published = readNavCache();          // site.sidebar last published (null: none; undefined: unknown)
  var preview = null;                      // { nav } Admin Mode's unsaved Site Navigation
  var override = null;                     // { sections, icons, title, current, prefKey } e.g. the Handbook
  var sitePref = null;                     // the site's data-sidebar while an override has its own
  var siteNav = function () { return (preview ? preview.nav : published) || BUILT_IN_NAV; };

  var header =
    '<header class="pa-header">' +
      '<button class="pa-menu-button" type="button" aria-label="Open menu" aria-controls="pa-sidebar" aria-expanded="false">' + icon('menu') + '</button>' +
      '<a class="pa-brand" href="/" aria-label="PergamonAtlas home">' +
        '<img class="pa-logo" src="/images/logo.png" alt="" width="245" height="240">' +
        '<span class="pa-brand-name">PergamonAtlas</span>' +
      '</a>' +
      '<div class="pa-capsule">' +
        '<nav class="pa-nav" aria-label="Main navigation">' +
          HEADER_LINKS.map(function (l) { return '<a href="' + l.href + '"' + currentAttr(l.href) + '>' + esc(l.label) + '</a>'; }).join('') +
        '</nav>' +
        '<div class="pa-actions">' +
          // Game search is not built yet: an inert, clearly labelled control.
          '<button class="pa-icon-button pa-search" type="button" aria-disabled="true" aria-label="Search games (coming soon)" data-tip="Search coming soon">' + icon('search') + '</button>' +
          '<a class="pa-icon-button pa-settings" href="/settings/" aria-label="Settings" data-tip="Settings"' + currentAttr('/settings/') + '>' + icon('settings') + '</a>' +
          '<a class="pa-icon-button pa-profile" href="/account/" aria-label="Account" data-tip="Account"' + currentAttr('/account/') + '>' + icon('account') + '</a>' +
        '</div>' +
      '</div>' +
    '</header>';

  var sidebarHtml =
    '<aside class="pa-sidebar" id="pa-sidebar" aria-label="Sidebar">' +
      '<div class="pa-drawer-head">' +
        '<span class="pa-drawer-title">Menu</span>' +
        '<button class="pa-drawer-close" type="button" aria-label="Close menu">' + icon('close') + '</button>' +
      '</div>' +
      '<nav class="pa-sidebar-nav" aria-label="Sections">' + navHtml(siteNav()) + '</nav>' +
      '<button class="pa-sidebar-toggle" type="button">' + icon('chevron') + '<span class="pa-nav-label">Collapse</span></button>' +
    '</aside>';

  var holder = document.createElement('div');
  holder.innerHTML = sidebarHtml;
  var sidebar = holder.firstElementChild;
  var backdrop = document.createElement('div');
  backdrop.className = 'pa-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  var script = document.currentScript;
  var page = script && script.closest ? script.closest('.pa-page') : null;
  var homeMode = !!page && page.getAttribute('data-layout') === 'home';

  if (script) script.insertAdjacentHTML('beforebegin', header);
  else document.body.insertAdjacentHTML('afterbegin', header);
  var headerEl = document.querySelector('.pa-header');
  headerEl.insertAdjacentElement('afterend', backdrop);
  if (!homeMode) backdrop.insertAdjacentElement('afterend', sidebar);

  // ── Desktop collapse ──────────────────────────────────────────────────
  var toggle = sidebar.querySelector('.pa-sidebar-toggle');
  var syncToggle = function () {
    var collapsed = root.getAttribute('data-sidebar') === 'collapsed';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.setAttribute('data-tip', collapsed ? 'Expand' : 'Collapse');
  };
  syncToggle();
  // While a section's own navigation is shown it keeps its own expanded /
  // collapsed preference (prefKey), so the site's stays as it was.
  var prefKey = function () { return override && override.prefKey ? override.prefKey : 'paSidebarCollapsed'; };
  toggle.addEventListener('click', function () {
    var collapsed = root.getAttribute('data-sidebar') !== 'collapsed';
    root.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');
    try { localStorage.setItem(prefKey(), collapsed ? '1' : '0'); } catch (e) {}
    syncToggle();
  });
  new MutationObserver(syncToggle).observe(root, { attributes: true, attributeFilter: ['data-sidebar'] });

  // ── Mobile drawer ─────────────────────────────────────────────────────
  var menuButton = headerEl.querySelector('.pa-menu-button');
  var setDrawer = function (open, restoreFocus) {
    if (open) root.setAttribute('data-drawer', 'open');
    else root.removeAttribute('data-drawer');
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) {
      // Wait a frame: the drawer is visibility:hidden until the attribute applies.
      requestAnimationFrame(function () {
        var first = sidebar.querySelector('.pa-sidebar-nav a');
        if (first) first.focus();
      });
    } else if (restoreFocus) {
      menuButton.focus();
    }
  };
  menuButton.addEventListener('click', function () { setDrawer(root.getAttribute('data-drawer') !== 'open'); });
  // A link that stays on this page (the Handbook's sections) closes the drawer.
  sidebar.addEventListener('click', function (event) {
    if (event.target.closest && event.target.closest('.pa-sidebar-nav a') && root.getAttribute('data-drawer') === 'open') setDrawer(false);
  });
  sidebar.querySelector('.pa-drawer-close').addEventListener('click', function () { setDrawer(false, true); });
  backdrop.addEventListener('click', function () { setDrawer(false, true); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && root.getAttribute('data-drawer') === 'open') setDrawer(false, true);
  });
  // Leaving the drawer breakpoint closes it.
  var drawerQuery = window.matchMedia('(max-width: 900px)');
  var onBreakpoint = function () { if (!drawerQuery.matches) setDrawer(false); };
  if (drawerQuery.addEventListener) drawerQuery.addEventListener('change', onBreakpoint);
  else if (drawerQuery.addListener) drawerQuery.addListener(onBreakpoint);

  // ── Navigation: draw whichever destinations apply now ─────────────────
  var navEl = sidebar.querySelector('.pa-sidebar-nav');
  var drawn = navEl.innerHTML;
  function drawNav() {
    var html;
    if (override) {
      html = (override.title ? '<div class="pa-sidebar-title" data-tip="' + esc(override.title.label) + '">' + icon(override.title.icon, override.icons) +
        '<span class="pa-nav-label">' + esc(override.title.label) + '</span></div>' : '') +
        navHtml(override, { icons: override.icons, current: function (href) { return href === override.current; } });
    } else {
      html = navHtml(siteNav());
    }
    if (html === drawn) return;
    drawn = html;
    navEl.innerHTML = html;
    navEl.setAttribute('aria-label', override && override.label ? override.label : 'Sections');
    sidebar.classList.toggle('has-override', !!override);
  }

  // The published Site Navigation: from the homepage's CMS loader when it is
  // on the page (one request), otherwise one public request of our own.
  function usePublished(nav) {
    published = validNav(nav) ? nav : null;
    try { localStorage.setItem(NAV_CACHE, JSON.stringify({ nav: published })); } catch (e) {}
    drawNav();
  }
  function navOf(doc) { return doc && doc.components ? doc.components['site.sidebar'] : undefined; }
  function loadPublished() {
    var cms = window.PergamonCMS;
    if (cms && cms.loader && cms.loader.enabled) {
      cms.loader.settled().then(function () { var p = cms.loader.published(); if (p) usePublished(navOf(p.doc)); });
      return;
    }
    var base = window.PERGAMON_SUPABASE_URL, key = window.PERGAMON_SUPABASE_ANON_KEY;
    if (!base || !key || typeof fetch !== 'function') return;
    fetch(base + '/rest/v1/rpc/get_published_content?p_page=home', {
      headers: { apikey: key, Accept: 'application/json' }, cache: 'no-store', credentials: 'omit'
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (p) {
        if (p === null) return usePublished(null);                      // nothing published: built-in
        if (p && p.page === 'home' && p.content) usePublished(navOf(p.content));
      })
      .catch(function () {});                                           // keep what is shown
  }

  // ── Home layout: the page places the sidebar in its own grid ──────────
  window.PergamonLayout = {
    sidebar: sidebar,
    // Insert the sidebar into parent, before `before` (default: first child).
    // On desktop it is then the floating, rounded rail (styles/layout.css
    // .is-inline); the page frame drops the fixed rail's margin.
    mountSidebar: function (parent, before) {
      sidebar.classList.add('is-inline');
      if (page) page.classList.add('has-inline-sidebar');
      parent.insertBefore(sidebar, before || parent.firstChild);
    },
    // Back to the default fixed rail (e.g. when the Handbook closes).
    unmountSidebar: function () {
      if (!sidebar.classList.contains('is-inline')) return;
      sidebar.classList.remove('is-inline');
      if (page) page.classList.remove('has-inline-sidebar');
      backdrop.insertAdjacentElement('afterend', sidebar);
    },
    // A section's own navigation in place of Site Navigation (the Handbook):
    // { label, title: { label, icon }, icons: { name: svg paths },
    //   sections: [{ title, items: [{ label, icon, href }] }], current: href }
    // prefKey: localStorage key of its own expanded / collapsed preference
    // (expanded unless collapsed there before).
    setNavigation: function (nav) {
      var first = !override;
      override = nav;
      if (first && nav.prefKey) {
        sitePref = root.getAttribute('data-sidebar');
        var c = null;
        try { c = localStorage.getItem(nav.prefKey); } catch (e) {}
        root.setAttribute('data-sidebar', c === '1' ? 'collapsed' : 'expanded');
      }
      drawNav();
    },
    setCurrent: function (href) { if (override) { override.current = href; drawNav(); } },
    clearNavigation: function () {
      if (override && override.prefKey && sitePref) root.setAttribute('data-sidebar', sitePref);
      override = null; sitePref = null;
      drawNav();
    },
    // Admin Mode: draw an unsaved Site Navigation (null: the built-in links);
    // previewSiteNavigation() returns to the published one.
    previewSiteNavigation: function (nav) {
      preview = arguments.length && nav !== undefined ? { nav: validNav(nav) ? nav : null } : null;
      drawNav();
    },
    // Admin Mode after publish / rollback: the new published Site Navigation.
    setPublishedSiteNavigation: function (nav) { usePublished(nav); },
    // For editors and the Handbook's previews.
    siteNavigation: {
      builtIn: function () { return JSON.parse(JSON.stringify(BUILT_IN_NAV)); },
      published: function () { return published ? JSON.parse(JSON.stringify(published)) : null; },
      valid: validNav,
      icons: NAV_ICONS.slice(),
      pages: NAV_PAGES.map(function (p) { return { href: p.href, label: p.label }; }),
      limits: { sections: NAV_LIMITS.sections, perSection: NAV_LIMITS.perSection, total: NAV_LIMITS.total, label: NAV_LIMITS.label },
      iconSvg: function (name) { return ICONS[name] || ''; },
      // The links of a navigation document as the sidebar draws them (the
      // same markup, inside .pa-sidebar-nav); current: href marked as the page.
      html: function (nav, opts) { opts = opts || {}; return navHtml(nav, { icons: opts.icons, current: function (h) { return h === opts.current; } }); }
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    if (!sidebar.isConnected) backdrop.insertAdjacentElement('afterend', sidebar);
    loadPublished();
  });

  // Enable transitions only after first paint, so restoring state never animates.
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('pa-ready'); }); });

  // ── Confirm sign-in state for palette rules ──────────────────────────
  // theme.js starts from Supabase's stored session; pages that load the auth
  // client correct it here. Pages without auth keep the stored-session guess.
  document.addEventListener('DOMContentLoaded', function () {
    var auth = window.PergamonAuth;
    var theme = window.PergamonTheme;
    if (!auth || !theme) return;
    auth.getSession()
      .then(function (res) { theme.setSignedIn(!!(res && res.data && res.data.session)); })
      .catch(function () {});
    try { auth.onAuthStateChange(function (event, session) { theme.setSignedIn(!!session); }); } catch (e) {}
  });
})();
