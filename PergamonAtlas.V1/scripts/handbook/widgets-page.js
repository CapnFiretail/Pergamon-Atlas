// Atlas Handbook › Library › Widgets: the reusable components Atlas pages are
// built from, one entry each (what it is, a preview, how it is configured,
// which type roles it uses, where it lives).
//
// Previews: Sidebar Navigation is drawn by the site's own sidebar renderer
// (PergamonLayout.siteNavigation.html) with the site's own sidebar styles.
// The homepage widgets are static previews, labelled as such: drawing the
// real ones would mean loading the homepage's code here. They use the
// widgets' real type roles (the .pa-type-* classes), so their text follows
// the Typography foundation.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  if (!app) return;

  const ROLES = {
    sidebar: ['nav'],
    featured: ['feature-title', 'feature-cta'],
    spotlight: ['spotlight-title', 'spotlight-cta'],
    carousel: ['section-title-large', 'tab', 'card-title', 'label', 'body-small'],
    atlas: ['section-title', 'item-title', 'caption']
  };
  const typo = window.PergamonDesign && window.PergamonDesign.typography;
  const roleName = id => { const r = typo && typo.role(id); return r ? r.name : id; };

  function render(view, ctx) {
    const { el, chip } = ctx;
    view.append(ctx.header('Widgets', 'Reusable, configurable components that Atlas pages are built from. Each entry shows what the widget is for, how it looks and how it is configured.'));

    const toc = el('ul', 'hb-wtoc');
    toc.setAttribute('aria-label', 'Widgets on this page');
    const list = el('div', 'hb-widgets');
    view.append(toc, list);

    function entry(id, name, kindChips, text) {
      const art = el('article', 'hb-widget');
      art.id = 'widget-' + id;
      const head = el('header', 'hb-widget-head');
      const h = el('h2', 'pa-type-section-title-large', name);
      h.id = 'widget-title-' + id;
      art.setAttribute('aria-labelledby', h.id);
      const chips = el('div', 'hb-chips');
      kindChips.forEach(c => chips.append(c));
      head.append(h, chips);
      art.append(head, el('p', 'pa-type-body hb-widget-text', text));
      list.append(art);
      const li = el('li');
      const a = el('a', 'pa-type-body-small', name);
      a.href = '#widget-' + id;
      a.addEventListener('click', e => { e.preventDefault(); art.scrollIntoView({ block: 'start' }); h.tabIndex = -1; h.focus({ preventScroll: true }); });
      li.append(a);
      toc.append(li);
      return art;
    }
    function facts(rows) {
      const dl = el('dl', 'hb-facts');
      rows.forEach(([k, v]) => {
        const row = el('div', 'hb-fact');
        const dd = el('dd', 'pa-type-body-small');
        (Array.isArray(v) ? v : [v]).forEach((part, i) => {
          if (i) dd.append(' ');
          if (part && part.code) dd.append(el('code', 'hb-code', part.code)); else dd.append(String(part));
        });
        row.append(el('dt', 'pa-type-label hb-muted', k), dd);
        dl.append(row);
      });
      return dl;
    }
    const roles = id => ROLES[id].map(r => ({ code: roleName(r) }));
    function stage(kind, label) {
      const fig = el('figure', 'hb-stage hb-stage--' + kind);
      const cap = el('figcaption', 'pa-type-caption hb-muted', label);
      return { fig, cap };
    }

    // ── Sidebar Navigation ─────────────────────────────────────────────
    {
      const layout = window.PergamonLayout;
      const nav = layout && layout.siteNavigation;
      const art = entry('sidebar', 'Sidebar Navigation', [chip('Site shell', 'muted'), chip('Configurable in Admin Mode', 'active')],
        'The left navigation rail on every page: a collapsible rail on desktop and a slide-out menu on phones. One component with two sets of destinations: Site Navigation for the website, and the Handbook’s own sections while you are here. Hiding a link never restricts the page it points to.');
      const s = stage('sidebar', '');
      const pair = el('div', 'hb-nav-pair');
      const panel = (title, note, html) => {
        const col = el('div', 'hb-nav-col');
        const aside = el('aside', 'pa-sidebar pa-sidebar--preview');
        aside.setAttribute('aria-label', title + ' preview');
        const inner = el('nav', 'pa-sidebar-nav');
        inner.setAttribute('aria-label', title);
        inner.innerHTML = html;
        // A preview: its links don't navigate.
        inner.querySelectorAll('a').forEach(a => { a.setAttribute('tabindex', '-1'); a.addEventListener('click', e => e.preventDefault()); });
        aside.append(inner);
        col.append(el('h3', 'pa-type-item-title', title), el('p', 'pa-type-caption hb-muted', note), aside);
        return col;
      };
      if (nav) {
        const pub = nav.published();
        const hb = ctx.sidebarNav('library/widgets');
        const hbHtml = '<div class="pa-sidebar-title">' + `<svg class="pa-icon" viewBox="0 0 24 24" aria-hidden="true">${hb.icons[hb.title.icon]}</svg>` +
          '<span class="pa-nav-label">Handbook</span></div>' + nav.html(hb, { icons: hb.icons, current: hb.current });
        pair.append(
          panel('Site Navigation', pub ? 'Published by an administrator. Every regular page shows it.' : 'The built-in links (nothing published yet). Every regular page shows them.', nav.html(pub || nav.builtIn(), { current: '/' })),
          panel('Handbook navigation', 'Defined in the Handbook’s code. Administrators only.', hbHtml)
        );
        s.cap.textContent = 'Live: drawn by the site’s sidebar code and styles. The first item is shown as the current page.';
      } else {
        pair.append(el('p', 'pa-type-body-small hb-muted', 'The sidebar component isn’t available on this page.'));
      }
      s.fig.append(pair, s.cap);
      art.append(s.fig, facts([
        ['Site Navigation', ['Edited in Admin Mode on the homepage: Admin Mode › Site Navigation. Up to 16 links in up to 4 groups: label, icon, destination (the site’s pages or a game) and visibility, in any order.']],
        ['Publishing', ['Stored as', { code: 'site.sidebar' }, 'in the homepage’s content and published with the homepage’s Publish Changes; Version History and Restore include it. The server checks every link and icon.']],
        ['Handbook navigation', ['Defined in', { code: 'scripts/handbook/handbook.js' }, '; not editable.']],
        ['Shared code', [{ code: 'scripts/layout.js' }, 'draws both;', { code: 'styles/layout.css' }, 'styles both.']],
        ['Type roles', roles('sidebar')]
      ]));
    }

    // ── Featured Game ──────────────────────────────────────────────────
    {
      const art = entry('featured', 'Featured Game', [chip('Homepage', 'muted'), chip('Configurable in Admin Mode', 'active')],
        'The large card at the top of the homepage: a highlighted game with its artwork, title and Play button. Administrators can keep saved cards and switch which one is shown.');
      const s = stage('feature', 'Static preview with the widget’s real type roles. See it live on the homepage.');
      const card = el('div', 'hb-demo-feature');
      card.append(el('span', 'hb-demo-rule'), el('p', 'pa-type-feature-title', 'Chess Forge'), el('span', 'hb-demo-rule'), el('span', 'hb-demo-cta pa-type-feature-cta', '▶ Play now'));
      s.fig.append(card, s.cap);
      art.append(s.fig, facts([
        ['Configuration', ['Title, button label, destination game, image with desktop and phone framing; saved cards (up to 12).']],
        ['Content', [{ code: 'home.featured' }, 'and', { code: 'home.featured.saved' }, '(homepage CMS document)']],
        ['Type roles', roles('featured')],
        ['Source', [{ code: 'scripts/home.js' }, { code: 'styles/home.css' }]]
      ]));
    }

    // ── Spotlight ──────────────────────────────────────────────────────
    {
      const art = entry('spotlight', 'Spotlight', [chip('Homepage', 'muted'), chip('Configurable in Admin Mode', 'active')],
        'The second, wider homepage card: a game in a banner with its own edge colour and a smaller Play button.');
      const s = stage('feature', 'Static preview with the widget’s real type roles. See it live on the homepage.');
      const card = el('div', 'hb-demo-spotlight');
      const copy = el('div');
      copy.append(el('span', 'hb-demo-rule'), el('p', 'pa-type-spotlight-title', 'Connect Four'), el('span', 'hb-demo-rule'));
      card.append(copy, el('span', 'hb-demo-cta pa-type-spotlight-cta', '▶ Play now'));
      s.fig.append(card, s.cap);
      art.append(s.fig, facts([
        ['Configuration', ['Title, button label, destination game, image with edge colour and framing; saved cards (up to 12).']],
        ['Content', [{ code: 'home.spotlight' }, 'and', { code: 'home.spotlight.saved' }]],
        ['Type roles', roles('spotlight')],
        ['Source', [{ code: 'scripts/home.js' }, { code: 'styles/home.css' }]]
      ]));
    }

    // ── Games Carousel ─────────────────────────────────────────────────
    {
      const art = entry('carousel', 'Games Carousel', [chip('Homepage', 'muted'), chip('Configurable in Admin Mode', 'active')],
        'A horizontal, gliding row of game cards with category tabs (“Explore More Games”). Administrators add, edit, delete and reorder its cards.');
      const s = stage('carousel', 'Static preview with the widget’s real type roles. See it live on the homepage.');
      const demo = el('div', 'hb-demo-carousel');
      const head = el('div', 'hb-demo-carousel-head');
      const tabs = el('div', 'hb-demo-tabs');
      ['All Games', 'Strategy', 'Arcade'].forEach((t, i) => tabs.append(el('span', 'pa-type-tab hb-demo-tab' + (i ? '' : ' is-on'), t)));
      head.append(el('span', 'pa-type-section-title-large', 'Explore More Games'), tabs);
      const row = el('div', 'hb-demo-tiles');
      [['Chess Forge', 'Strategy'], ['Snake', 'Arcade'], ['Blackjack', 'Card']].forEach(([t, c]) => {
        const tile = el('div', 'hb-demo-tile');
        tile.append(el('span', 'hb-demo-art'), el('span', 'pa-type-card-title', t), el('span', 'pa-type-caption hb-muted', c));
        row.append(tile);
      });
      demo.append(head, row);
      s.fig.append(demo, s.cap);
      art.append(s.fig, facts([
        ['Configuration', ['Cards (up to 24): title, category, destination game and image; their order.']],
        ['Content', [{ code: 'home.carousel' }, 'and', { code: 'home.carousel.<card>' }]],
        ['Type roles', roles('carousel')],
        ['Source', [{ code: 'scripts/home.js' }, { code: 'scripts/glide.js' }, { code: 'styles/home.css' }]]
      ]));
    }

    // ── Atlas Navigation panel ─────────────────────────────────────────
    {
      const art = entry('atlas-navigation', 'Atlas Navigation panel', [chip('Homepage', 'muted'), chip('Defined in code', 'muted')],
        'The homepage panel beside the Featured card, listing destinations with a short description each. It is a separate widget from the Sidebar Navigation, with its own content.');
      const s = stage('panel', 'Static preview with the widget’s real type roles. See it live on the homepage.');
      const demo = el('div', 'hb-demo-panel');
      demo.append(el('p', 'pa-type-section-title', 'Atlas Navigation'));
      [['Account', 'Your profile and sign-in details'], ['Settings', 'Display mode and colour palette'], ['Update Log', 'What’s new on PergamonAtlas']].forEach(([t, d]) => {
        const r = el('div', 'hb-demo-row');
        const txt = el('span', 'hb-demo-row-text');
        txt.append(el('span', 'pa-type-item-title', t), el('span', 'pa-type-caption hb-muted', d));
        r.append(el('span', 'hb-demo-row-icon'), txt, el('span', 'hb-demo-row-go', '›'));
        demo.append(r);
      });
      s.fig.append(demo, s.cap);
      art.append(s.fig, facts([
        ['Configuration', ['Not editable yet: its destinations are set in the homepage’s code.']],
        ['Type roles', roles('atlas')],
        ['Source', [{ code: 'scripts/home.js' }, { code: 'styles/home.css' }]]
      ]));
    }
  }

  app.register('library/widgets', { render });
  ns.widgetsPage = { render };
})();
