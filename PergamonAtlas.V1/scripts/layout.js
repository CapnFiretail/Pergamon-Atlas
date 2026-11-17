// Shared site chrome: header, sidebar and the mobile drawer.
//
// Every page includes this as a plain (synchronous) script at the top of
// .pa-page. It writes the header and sidebar in place while the page is
// still parsing, so they are present on first paint with no layout shift.
// To add a page to the navigation, edit HEADER_LINKS or SIDEBAR_SECTIONS.
// Requires /scripts/theme.js in <head> (sets data-sidebar on <html>).
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

  // Sidebar groups, separated by a divider. Later sections (categories,
  // benchmarks, daily challenges...) are added here as further entries.
  var SIDEBAR_SECTIONS = [
    {
      title: null,
      items: [
        { href: '/', label: 'Home', icon: 'home' },
        { href: '/games/', label: 'Games', icon: 'games' },
        { href: '/suggestions/', label: 'Suggestions', icon: 'suggestions' }
      ]
    },
    {
      title: null,
      items: [
        { href: '/achievements/', label: 'Achievements', icon: 'achievements' },
        { href: '/leaderboards/', label: 'Leaderboards', icon: 'leaderboards' }
      ]
    }
  ];

  var root = document.documentElement;
  var section = function (path) { return '/' + (String(path).split('/')[1] || ''); };
  var current = section(window.location.pathname);
  var isCurrent = function (href) { return section(href) === current; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var icon = function (name) { return '<svg class="pa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'; };
  var currentAttr = function (href) { return isCurrent(href) ? ' aria-current="page"' : ''; };

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
      '<nav class="pa-sidebar-nav" aria-label="Sections">' +
        SIDEBAR_SECTIONS.map(function (s) {
          return '<div class="pa-sidebar-section">' +
            (s.title ? '<p class="pa-sidebar-heading">' + esc(s.title) + '</p>' : '') +
            s.items.map(function (item) {
              return '<a href="' + item.href + '" data-tip="' + esc(item.label) + '"' +
                (isCurrent(item.href) ? ' class="active" aria-current="page"' : '') + '>' +
                icon(item.icon) + '<span class="pa-nav-label">' + esc(item.label) + '</span></a>';
            }).join('') +
          '</div>';
        }).join('') +
      '</nav>' +
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
  toggle.addEventListener('click', function () {
    var collapsed = root.getAttribute('data-sidebar') !== 'collapsed';
    root.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');
    try { localStorage.setItem('paSidebarCollapsed', collapsed ? '1' : '0'); } catch (e) {}
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

  // ── Home layout: the page places the sidebar in its own grid ──────────
  window.PergamonLayout = {
    sidebar: sidebar,
    // Insert the sidebar into parent, before `before` (default: first child).
    mountSidebar: function (parent, before) {
      sidebar.classList.add('is-inline');
      parent.insertBefore(sidebar, before || parent.firstChild);
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    if (!sidebar.isConnected) backdrop.insertAdjacentElement('afterend', sidebar);
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
