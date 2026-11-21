// The Atlas Handbook (H1): an internal, read-only design-system reference for
// administrators. Loaded by gate.js only after the server confirms an admin.
//
//   SECTIONS     the Handbook's navigation, one tree for every section;
//                a section is 'ready' when a renderer is registered for it
//   routes       #/<section>[/<child>] (one page, no server routes needed);
//                anything after a registered path is passed on as ctx.rest
//                (e.g. #/vision/north-star), and a renderer with
//                navigate(rest) handles changes to it without a re-render
//   renderers    PergamonHandbook.app.register(path, { title, render(el, ctx) })
//                e.g. typography-page.js registers 'foundations/typography'
//   frame mode   /handbook/?view=specimen#/<path> draws only that section's
//                specimen (renderer.specimen) without the site chrome, for the
//                phone-width preview <iframe>
//
// Layers follow the long-term model: Foundations → Elements → Widgets → Pages.
// Everything is drawn with the site's own tokens and type roles
// (styles/theme.css, styles/typography.css); handbook.css only lays it out.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};

  const SECTIONS = [
    { id: 'overview', label: 'Overview' },
    { id: 'vision', label: 'Vision & Architecture' },
    {
      id: 'foundations', label: 'Foundations',
      plan: 'The shared design decisions every element is built from.',
      children: [
        { id: 'typography', label: 'Typography' },
        { id: 'colors', label: 'Colors & Themes', plan: 'The four palettes in dark and light mode, the semantic colour tokens derived from them, and contrast checks for every pairing.' },
        { id: 'spacing', label: 'Spacing & Layout', plan: 'A spacing scale, radii, breakpoints and the page frame (header, sidebar, content width).' },
        { id: 'motion', label: 'Motion', plan: 'Durations, easing and reduced-motion rules, including the homepage carousel’s glide.' }
      ]
    },
    { id: 'elements', label: 'Elements', plan: 'Buttons, tabs, form fields, tags, icons and dialogs: the small parts every page shares, each with its variants and states.' },
    { id: 'widgets', label: 'Widgets', plan: 'Composed components such as the Featured card, carousel and navigation panel, with live previews and the type roles and tokens each one consumes.' },
    { id: 'pages', label: 'Page Architecture', plan: 'Page families (home, catalogue, game, account), their layouts and which widgets they use. The foundation for a future page builder.' },
    { id: 'exceptions', label: 'Exceptions & Migration', plan: 'Every approved exception and every legacy style still waiting to adopt the shared system, with its migration status.' }
  ];

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

  // ── Routing ───────────────────────────────────────────────────────────
  function flat() {
    const out = [];
    for (const s of SECTIONS) {
      out.push({ path: s.id, node: s, parent: null });
      for (const c of s.children || []) out.push({ path: s.id + '/' + c.id, node: c, parent: s });
    }
    return out;
  }
  function current() {
    const path = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
    const all = flat();
    const exact = all.find(x => x.path === path);
    if (exact) return Object.assign({ rest: '' }, exact);
    const base = all.find(x => renderers[x.path] && path.startsWith(x.path + '/'));
    if (base) return Object.assign({ rest: path.slice(base.path.length + 1) }, base);
    return Object.assign({ rest: '' }, all[0]);
  }
  const ready = path => path === 'overview' || !!renderers[path] || !!(flat().find(x => x.path === path) || {}).node.children;

  // ── Navigation ────────────────────────────────────────────────────────
  function link(entry, label) {
    const a = el('a', 'hb-nav-link pa-type-tab');
    a.href = '#/' + entry.path;
    a.dataset.path = entry.path;
    a.append(el('span', 'hb-nav-text', label));
    if (!ready(entry.path)) a.append(el('span', 'pa-type-caption hb-nav-soon', 'Planned'));
    return a;
  }
  function buildNav() {
    const nav = el('nav', 'hb-nav');
    nav.setAttribute('aria-label', 'Handbook sections');
    const menu = el('details', 'hb-nav-menu');
    const summary = el('summary', 'hb-nav-summary');
    summary.append(el('span', 'pa-type-label hb-nav-kicker', 'Handbook'), el('span', 'pa-type-item-title hb-nav-current'));
    const body = el('div', 'hb-nav-body');
    body.append(el('p', 'pa-type-label hb-nav-heading', 'Atlas Handbook'));
    const list = el('ul', 'hb-nav-list');
    for (const s of SECTIONS) {
      const li = el('li', 'hb-nav-item');
      li.append(link({ path: s.id }, s.label));
      if (s.children) {
        const sub = el('ul', 'hb-nav-sub');
        for (const c of s.children) { const cli = el('li', 'hb-nav-item'); cli.append(link({ path: s.id + '/' + c.id }, c.label)); sub.append(cli); }
        li.append(sub);
      }
      list.append(li);
    }
    body.append(list);
    menu.append(summary, body);
    nav.append(menu);
    // Open on wide screens; a collapsible menu on narrow ones.
    const wide = window.matchMedia('(min-width: 901px)');
    const sync = () => { menu.open = wide.matches; };
    sync();
    if (wide.addEventListener) wide.addEventListener('change', sync);
    nav.addEventListener('click', e => { if (e.target.closest('a') && !wide.matches) menu.open = false; });
    return nav;
  }
  function markNav(path) {
    root.querySelectorAll('.hb-nav-link').forEach(a => {
      const on = a.dataset.path === path;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const here = flat().find(x => x.path === path);
    const label = root.querySelector('.hb-nav-current');
    if (label && here) label.textContent = (here.parent ? here.parent.label + ' · ' : '') + here.node.label;
  }

  // ── Pages ─────────────────────────────────────────────────────────────
  function header(title, lead, chips) {
    const head = el('header', 'hb-page-head');
    const h = el('h1', 'pa-type-page-title hb-page-title', title);
    h.tabIndex = -1;
    head.append(h);
    if (chips && chips.length) { const row = el('div', 'hb-chips'); chips.forEach(c => row.append(c)); head.append(row); }
    if (lead) head.append(el('p', 'pa-type-body hb-lead', lead));
    return head;
  }

  function overview(view) {
    view.append(header('Atlas Handbook',
      'The design system behind Pergamon Atlas: the shared foundations, elements, widgets and page patterns every page is built from, with live previews drawn by the site’s own styles.',
      [chip('Read-only'), chip('Phase H1', 'muted')]));

    const layers = el('section', 'hb-section');
    layers.append(el('h2', 'pa-type-section-title', 'How Atlas is built'));
    const steps = el('ol', 'hb-layers');
    [['Foundations', 'Type, colour, spacing, motion', 'Typography ready', 'active'],
     ['Elements', 'Buttons, fields, tags, icons', 'Planned', 'muted'],
     ['Widgets', 'Cards, carousel, panels', 'Planned', 'muted'],
     ['Pages', 'Page families and layouts', 'Planned', 'muted']].forEach(([name, what, status, tone]) => {
      const li = el('li', 'hb-layer');
      li.append(el('span', 'pa-type-section-title', name), el('span', 'pa-type-caption hb-muted', what), chip(status, tone));
      steps.append(li);
    });
    layers.append(steps, el('p', 'pa-type-body-small hb-muted', 'Each layer is made only from the one before it, so a change to a foundation, such as a type role, reaches every element, widget and page that uses it.'));

    const sync = el('section', 'hb-section');
    sync.append(el('h2', 'pa-type-section-title', 'One source of truth'));
    const flow = el('ol', 'hb-flow');
    [['Registry', 'scripts/design/typography.js', 'Roles, their values, intended use and where the site uses them.'],
     ['Generated stylesheet', 'styles/typography.css', 'Tokens and classes written from the registry by tools/build-typography.mjs.'],
     ['Site and Handbook', 'Pages, widgets, these previews', 'Both draw with the same classes, so a preview here is the real style.']].forEach(([name, file, text]) => {
      const li = el('li', 'hb-flow-step');
      li.append(el('span', 'pa-type-item-title', name), el('code', 'hb-code', file), el('span', 'pa-type-caption hb-muted', text));
      flow.append(li);
    });
    sync.append(flow, el('p', 'pa-type-body-small hb-muted', 'Automated tests (tests/design) fail if the stylesheet is stale or if the registry describes the site’s CSS incorrectly.'));

    const list = el('section', 'hb-section');
    list.append(el('h2', 'pa-type-section-title', 'Sections'));
    const ul = el('ul', 'hb-section-list');
    for (const x of flat().filter(x => x.path !== 'overview')) {
      const li = el('li', 'hb-section-row' + (x.parent ? ' is-child' : ''));
      const a = el('a', 'pa-type-item-title', x.node.label); a.href = '#/' + x.path;
      li.append(a, chip(ready(x.path) && !x.node.children ? 'Ready' : x.node.children ? 'Group' : 'Planned', ready(x.path) && !x.node.children ? 'active' : 'muted'));
      ul.append(li);
    }
    list.append(ul);

    const edit = el('section', 'hb-note');
    edit.append(el('h2', 'pa-type-item-title', 'Editing is planned'),
      el('p', 'pa-type-body-small', 'This version documents the system. A later phase adds editing with preview, validation, draft, publish and rollback, so a change such as the game title’s size can be made here once and reach every page that uses it.'));
    view.append(layers, sync, list, edit);
  }

  function group(view, node, path) {
    view.append(header(node.label, node.plan));
    const ul = el('ul', 'hb-cards');
    for (const c of node.children) {
      const li = el('li', 'hb-card');
      const a = el('a', 'pa-type-section-title hb-card-link', c.label); a.href = '#/' + path + '/' + c.id;
      const isReady = ready(path + '/' + c.id);
      li.append(a, chip(isReady ? 'Ready' : 'Planned', isReady ? 'active' : 'muted'));
      if (c.plan) li.append(el('p', 'pa-type-body-small hb-muted', c.plan));
      ul.append(li);
    }
    view.append(ul);
  }

  function planned(view, node, parent) {
    view.append(header(node.label, node.plan, [chip('Planned', 'muted')].concat(parent ? [chip(parent.label, 'muted')] : [])));
    const note = el('section', 'hb-note');
    note.append(el('p', 'pa-type-body-small', 'This section isn’t built yet. It is listed so the Handbook’s structure is in place when it arrives.'));
    view.append(note);
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
    const ctx = { el, chip, header, frame, rest: here.rest, onCleanup: fn => { cleanup = fn; } };
    if (frame) {
      if (r && r.specimen) r.specimen(view, ctx); else view.append(el('p', 'pa-type-body', 'No specimen for this section.'));
    } else if (here.path === 'overview') overview(view);
    else if (r) r.render(view, ctx);
    else if (here.node.children) group(view, here.node, here.path);
    else planned(view, here.node, here.parent);
    content.replaceChildren(view);
    document.title = (here.path === 'overview' ? 'Atlas Handbook' : here.node.label + ' · Atlas Handbook') + ' · Pergamon Atlas';
    if (!frame) {
      markNav(here.path);
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
      if (frame) {
        document.documentElement.setAttribute('data-handbook-frame', '');
        content = el('div', 'hb-frame');
        root.replaceChildren(content);
      } else {
        const shell = el('div', 'hb');
        content = el('div', 'hb-content');
        shell.append(buildNav(), content);
        root.replaceChildren(shell);
      }
      window.addEventListener('hashchange', render);
      render();
    },
    stop() {
      window.removeEventListener('hashchange', render);
      if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
      if (root) root.classList.remove('hb-root');
      root = null; content = null; firstRender = true; shownPath = null;
    },
    sections: SECTIONS
  };
})();
