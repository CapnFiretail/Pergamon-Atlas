// The Atlas Studio shell: an internal workspace for administrators. Loaded by
// gate.js only after the server confirms an admin.
//
//   sections     sections.js, shown in the site sidebar while the Studio is
//                open (PergamonLayout.setNavigation, as the Handbook does);
//                leaving or losing access restores the site's links
//   routes       #/<group>/<id>; anything else shows the default section
//   renderers    PergamonStudio.app.register('<group>/<id>', { render(el, ctx), wide? })
//                from a script listed in gate.js. wide: the section uses the whole
//                width and height. ctx: { el, chip, header, icon, onCleanup(fn),
//                onLeave({ blocked() → boolean, ask() → Promise<boolean> }) }:
//                while blocked, another section opens only once ask() says yes.
//                A section without a renderer is a placeholder
//
// Everything is drawn with the site's tokens and type roles (styles/theme.css,
// styles/typography.css); studio.css only lays it out. Nothing here depends on
// the Handbook's code beyond the shared administrator check (entry.js).
(function () {
  'use strict';
  const ns = window.PergamonStudio = window.PergamonStudio || {};
  const { DEFAULT, GROUPS, ICONS } = ns.sections;

  const renderers = {};
  let root = null;
  let content = null;
  let cleanup = null;
  let firstRender = true;
  let shown = null;                    // path of the section on screen
  let leave = null;                    // its onLeave, if any

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const chip = text => el('span', 'pa-type-label st-chip', text);
  function icon(name, cls) {
    const span = el('span', cls || 'st-icon');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[name] || ''}</svg>`;
    return span;
  }

  // ── Routing ───────────────────────────────────────────────────────────
  const pages = GROUPS.flatMap(group => group.items.map(item => ({ path: item.path, item, group })));
  const find = path => pages.find(p => p.path === path);
  const current = () => find(window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '')) || find(DEFAULT);

  // ── The site sidebar shows the Studio's sections ──────────────────────
  function showSidebar(path) {
    const layout = window.PergamonLayout;
    if (!layout || !layout.setNavigation) return;
    layout.setNavigation({
      label: 'Studio sections',
      prefKey: 'paStudioSidebarCollapsed',
      title: { label: 'Studio', icon: 'studio' },
      icons: ICONS,
      sections: GROUPS.map(g => ({ title: g.label, items: g.items.map(i => ({ label: i.label, icon: i.icon, href: '#/' + i.path })) })),
      current: '#/' + path
    });
  }

  // ── Shared page parts ─────────────────────────────────────────────────
  // Where the page is, not links: groups have no pages of their own.
  function crumbs(here) {
    const nav = el('nav', 'st-crumbs pa-type-body-small');
    nav.setAttribute('aria-label', 'Breadcrumb');
    const ol = el('ol');
    ['Studio', here.group.label, here.item.label].forEach((label, i, all) => {
      const li = el('li');
      const s = el('span', '', label);
      if (i === all.length - 1) s.setAttribute('aria-current', 'page');
      li.append(s);
      ol.append(li);
    });
    nav.append(ol);
    return nav;
  }
  function header(title, lead, chips) {
    const head = el('header', 'st-page-head');
    const h = el('h1', 'pa-type-page-title st-page-title', title);
    h.tabIndex = -1;
    head.append(h);
    if (lead) head.append(el('p', 'pa-type-body st-lead', lead));
    if (chips && chips.length) { const row = el('div', 'st-chips'); chips.forEach(c => row.append(c)); head.append(row); }
    return head;
  }

  function placeholder(view, here) {
    view.append(header(here.item.label, here.item.text, [chip('Planned')]));
    const box = el('section', 'st-empty');
    box.append(icon(here.item.icon, 'st-empty-icon'), el('h2', 'pa-type-section-title', 'Not built yet'),
      el('p', 'pa-type-body-small', 'This section is part of the Studio’s structure and arrives in a later phase.'));
    view.append(box);
  }

  // The address has already changed: put it back, and go on only after a yes.
  function askToLeave(path) {
    const from = leave;
    const back = () => window.history.replaceState(null, '', window.location.pathname + window.location.search + '#/' + shown);
    back();
    if (from.asking) return;
    from.asking = true;
    from.ask().then(yes => {
      from.asking = false;
      if (!yes || leave !== from) return;
      leave = null;
      window.location.hash = '#/' + path;
    });
  }

  function render() {
    if (!root) return;
    const here = current();
    if (here.path === shown) return;
    if (leave && leave.blocked()) { askToLeave(here.path); return; }
    const r = renderers[here.path];
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    shown = here.path; leave = null;
    const wide = !!(r && r.wide);
    content.classList.toggle('st-content--wide', wide);
    const view = el('div', 'st-view' + (wide ? ' st-view--wide' : ''));
    content.replaceChildren(view);
    view.append(crumbs(here));
    if (r) r.render(view, { el, chip, header, icon, onCleanup: fn => { cleanup = fn; }, onLeave: l => { leave = l; } });
    else placeholder(view, here);
    document.title = here.item.label + ' · Atlas Studio · Pergamon Atlas';
    showSidebar(here.path);
    // Move focus to the new page's heading (not on first load).
    if (!firstRender) { const h = content.querySelector('h1'); if (h) h.focus({ preventScroll: true }); window.scrollTo(0, 0); }
    firstRender = false;
  }

  ns.app = {
    register(path, renderer) { renderers[path] = renderer; },
    start(target) {
      if (root) ns.app.stop();
      root = target;
      root.classList.add('st-root');
      content = el('div', 'st-content');
      const shell = el('div', 'st');
      shell.append(content);
      root.replaceChildren(shell);
      // The site sidebar as the floating rail, as on the homepage and in the
      // Handbook (the same component and styles).
      if (window.PergamonLayout && window.PergamonLayout.mountSidebar) {
        window.PergamonLayout.mountSidebar(shell, content);
        shell.classList.add('has-sidebar');
      }
      window.addEventListener('hashchange', render);
      render();
    },
    stop() {
      window.removeEventListener('hashchange', render);
      if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
      if (root) root.classList.remove('st-root');
      if (window.PergamonLayout && window.PergamonLayout.clearNavigation) {
        window.PergamonLayout.clearNavigation();
        if (window.PergamonLayout.unmountSidebar) window.PergamonLayout.unmountSidebar();
      }
      root = null; content = null; firstRender = true; shown = null; leave = null;
    }
  };
})();
