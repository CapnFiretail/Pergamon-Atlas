// Atlas Handbook › Library › Widgets: the component library's catalogue.
//
//   Containers          Carousel: owns a row of content (layout, motion,
//                       arrows, filters, sections, empty state)
//   Content components  Featured Content (hero), Spotlight (banner), Content
//                       Card: own their content's presentation
//   Navigation & page   Sidebar Navigation (site shell), Atlas Navigation
//
// Live previews are drawn by the real components (scripts/components/,
// styles/components/) with the sample inputs in component-examples.js; the
// sidebar previews by the site's own sidebar code.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const app = ns.app;
  if (!app) return;

  const typo = window.PergamonDesign && window.PergamonDesign.typography;
  const roleName = id => { const r = typo && typo.role(id); return r ? r.name : id; };
  const ROLES = {
    sidebar: ['nav'],
    hero: ['feature-title', 'feature-cta'],
    banner: ['spotlight-title', 'spotlight-cta'],
    carousel: ['section-title-large', 'tab', 'body-small', 'label'],
    card: ['card-title'],
    atlas: ['section-title', 'item-title', 'caption']
  };

  function render(view, ctx) {
    const { el, chip } = ctx;
    const C = window.PergamonComponents || {};
    const X = ns.componentExamples || {};
    const carousels = [];
    ctx.onCleanup(() => carousels.forEach(c => c.hold(true)));      // stop their motion when leaving

    view.append(ctx.header('Widgets', 'The Atlas component library: reusable containers and content components, drawn here by the same code the site uses, plus the site’s navigation widgets.'));
    const toc = el('ul', 'hb-wtoc');
    toc.setAttribute('aria-label', 'Widgets on this page');
    view.append(toc);

    function group(title, text) {
      const sec = el('section', 'hb-wgroup');
      const h = el('h2', 'pa-type-label hb-wgroup-title', title);
      sec.append(h, el('p', 'pa-type-body-small hb-muted', text));
      const list = el('div', 'hb-widgets');
      sec.append(list);
      view.append(sec);
      return list;
    }
    function entry(list, id, name, chips, text) {
      const art = el('article', 'hb-widget');
      art.id = 'widget-' + id;
      const head = el('header', 'hb-widget-head');
      const h = el('h3', 'pa-type-section-title-large', name);
      h.id = 'widget-title-' + id;
      art.setAttribute('aria-labelledby', h.id);
      const row = el('div', 'hb-chips');
      chips.forEach(c => row.append(c));
      head.append(h, row);
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
    // A preview stage: a caption, optional Wide / Compact control, the content.
    function stage(caption, widths) {
      const fig = el('figure', 'hb-stage');
      const bar = el('div', 'hb-stage-bar');
      const cap = el('figcaption', 'pa-type-caption hb-muted', caption);
      bar.append(cap);
      const body = el('div', 'hb-stage-body');
      let control = null;
      if (widths) {
        control = el('div', 'hb-segmented hb-width');
        control.setAttribute('role', 'radiogroup');
        control.setAttribute('aria-label', 'Preview width');
        const name = 'hb-w-' + Math.random().toString(36).slice(2, 8);
        [['wide', 'Wide'], ['compact', 'Compact (390px)']].forEach(([v, l], i) => {
          const lab = el('label', 'hb-segment pa-type-tab');
          const input = el('input'); input.type = 'radio'; input.name = name; input.value = v; input.checked = i === 0;
          lab.append(input, el('span', '', l));
          control.append(lab);
        });
        control.addEventListener('change', e => { body.dataset.width = e.target.value; });
        bar.append(control);
      }
      body.dataset.width = 'wide';
      fig.append(bar, body);
      return { fig, body };
    }
    const missing = el('p', 'pa-type-body-small hb-muted', 'The component library isn’t available on this page.');

    // ── Containers ──────────────────────────────────────────────────────
    const containers = group('Containers', 'Own a set of content: its layout, scrolling, navigation and responsive behaviour. They place content components without knowing what they show.');
    {
      const art = entry(containers, 'carousel', 'Carousel', [chip('Container', 'active'), chip('Live preview', 'muted')],
        'A horizontal row of content elements. It glides slowly when there are enough items, steps one item with the arrows, and can filter its items with tabs and switch between sections. It never builds or inspects its items: the page gives it ready-made elements, such as content cards.');
      if (C.carousel && C.contentCard && window.PergamonGlide) {
        const items = (X.cards || []).map((c, i) => ({ key: 'ex-' + i, label: c.title, facet: c.facet, element: C.contentCard({ title: c.title, meta: c.meta, href: '#', art: c.art, action: c.action }).element }));
        items.forEach(it => it.element.addEventListener('click', e => e.preventDefault()));
        const s1 = stage('Live: filters, arrows and gliding. Compact shows its narrow layout (its own width, 640px or less).', true);
        const place = el('div', 'hb-place hb-place--carousel');
        const c1 = C.carousel({ sections: [Object.assign({}, X.carousel, { items })] });
        place.append(c1.element);
        s1.body.append(place);
        carousels.push(c1);
        const s2 = stage('Live: an empty collection, with no filters and no sections.', false);
        const c2 = C.carousel({ sections: [Object.assign({ items: [] }, X.emptyCarousel)] });
        const place2 = el('div', 'hb-place hb-place--carousel');
        place2.append(c2.element);
        s2.body.append(place2);
        carousels.push(c2);
        art.append(s1.fig, s2.fig);
        requestAnimationFrame(() => carousels.forEach(c => c.start()));
      } else art.append(missing.cloneNode(true));
      art.append(facts([
        ['Inputs', ['Sections, each with a title, optional icon, optional filter names, items', { code: '{ key, element, label, facet }' }, 'and empty messages. One section: no section arrows. No filters: no tabs.']],
        ['Owns', ['Layout, gliding and arrows (', { code: 'scripts/glide.js' }, '), filters, sections, empty state, screen-reader announcements, its responsive widths.']],
        ['Used on', ['Homepage: “Explore More Games” (sections Games and Tools; the Games cards come from the CMS component', { code: 'home.carousel' }, ').']],
        ['Admin Mode', ['Cards are added, edited, deleted and reordered with Manage cards and the Add card tile; the carousel stands still while editing.']],
        ['Type roles', roles('carousel')],
        ['Source', [{ code: 'scripts/components/carousel.js' }, { code: 'styles/components/carousel.css' }]]
      ]));
    }

    // ── Content components ──────────────────────────────────────────────
    const contents = group('Content components', 'Own the presentation of one piece of content and its interaction. The page decides what they show and where they go.');
    function featureEntry(variant, id, name, examples, text, used, admin) {
      const art = entry(contents, id, name, [chip('Content', 'active'), chip(variant === 'hero' ? 'Variant: hero' : 'Variant: banner', 'muted'), chip('Shares the feature banner renderer', 'muted')], text);
      if (C.featureBanner) {
        const s = stage(`Live: ${examples.map(x => x.name.toLowerCase()).join('; ')}. Compact shows the narrow layout its page area switches to.`, true);
        examples.forEach(x => {
          const place = el('div', 'hb-place hb-place--' + variant);
          const b = C.featureBanner({ variant, actionIcon: x.actionIcon });
          b.apply(x.content);
          b.element.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
          place.append(b.element);
          s.body.append(el('p', 'pa-type-label hb-muted hb-example-name', x.name), place);
        });
        art.append(s.fig);
      } else art.append(missing.cloneNode(true));
      art.append(facts([
        ['Inputs', [{ code: '{ title, actionLabel, href, art }' }, 'plus', { code: 'actionIcon' }, '(play, or none). Artwork: cover with focus and zoom, or height-fitted with an edge colour; separate phone values.']],
        ['Layout', [variant === 'hero' ? 'Tall; the action sits under the title.' : 'Wide and short; the action on the right.', 'Its height comes from where it is placed; its compact layout from the page area it sits in.']],
        ['Placement', ['Put it inside a page area that is a size container named', { code: 'upper' }, 'and give it its height there. The compact layout applies when that area is 560px or narrower; above that it keeps its wide layout even if the card itself is narrower (for example, in a two-column row). Without such an area it always shows its wide layout. On the homepage that area is', { code: '.home-upper' }, '. For another page:', { code: '.area { container: upper / inline-size; display: grid; grid-template-rows: ' + (variant === 'hero' ? '260px' : '140px') + '; }' }, { code: '@container upper (max-width: 560px) { .area { grid-template-rows: auto; } }' }]],
        ['Used on', used],
        ['Admin Mode', admin],
        ['Type roles', roles(variant)],
        ['Source', [{ code: 'scripts/components/feature-banner.js' }, { code: 'styles/components/feature-banner.css' }]]
      ]));
    }
    featureEntry('hero', 'hero', 'Featured Content — Hero', X.hero || [],
      'The large card that introduces one piece of content: full-bleed artwork, a title between ornament rules, and one action. On the homepage it is the Featured Game.',
      ['Homepage: the Featured slot (CMS component', { code: 'home.featured' }, ').'],
      ['Title, button label, destination, image and its desktop and phone framing; saved cards to switch between.']);
    featureEntry('banner', 'banner', 'Spotlight — Banner', X.banner || [],
      'The same component as a wide, short banner: the title on the left, the artwork through the middle, the action on the right. On the homepage it is the Spotlight.',
      ['Homepage: the Spotlight slot (CMS component', { code: 'home.spotlight' }, ').'],
      ['Title, button label, destination, image with edge colour and framing; saved cards to switch between.']);
    {
      const art = entry(contents, 'card', 'Content Card', [chip('Content', 'active'), chip('Live preview', 'muted')],
        'One item as a linked card: square artwork, a title, a line of metadata and an optional action icon. It fills the width it is given, so it works inside a carousel or on its own. On the homepage each carousel card is a content card showing a game.');
      if (C.contentCard) {
        const s = stage('Live: on their own at 200px and, narrow, at 160px (the phone crop of the artwork). Missing artwork shows a placeholder; long titles are truncated.', false);
        const grid = el('div', 'hb-card-row');
        (X.cards || []).slice(0, 6).forEach((c, i) => {
          const slot = el('div', 'hb-card-slot' + (i === 5 ? ' is-narrow' : ''));
          const card = C.contentCard({ title: c.title, meta: c.meta, href: '#', art: c.art, action: c.action });
          card.element.addEventListener('click', e => e.preventDefault());
          slot.append(card.element);
          grid.append(slot);
        });
        s.body.append(grid);
        art.append(s.fig);
      } else art.append(missing.cloneNode(true));
      art.append(facts([
        ['Inputs', [{ code: '{ title, meta, href, art, action }' }, '(action: play, or none).']],
        ['Owns', ['Its artwork (crop, zoom, phone crop when 180px or narrower), title, metadata, link and action icon.']],
        ['Used on', ['Homepage carousel: one card per game (CMS components', { code: 'home.carousel.<card>' }, '; the homepage turns each game into title, category and link).']],
        ['Admin Mode', ['Title, category, destination game and image with its framing.']],
        ['Type roles', roles('card')],
        ['Source', [{ code: 'scripts/components/content-card.js' }, { code: 'styles/components/content-card.css' }]]
      ]));
    }

    // ── Navigation and page widgets ─────────────────────────────────────
    const navs = group('Navigation and page widgets', 'The site shell’s navigation, and homepage widgets that aren’t yet library components.');
    {
      const layout = window.PergamonLayout;
      const nav = layout && layout.siteNavigation;
      const art = entry(navs, 'sidebar', 'Sidebar Navigation', [chip('Site shell', 'muted'), chip('Configurable in Admin Mode', 'active')],
        'The left navigation rail on every page: a collapsible rail on desktop and a slide-out menu on phones. One component with two sets of destinations: Site Navigation for the website, and the Handbook’s own sections while you are here. Hiding a link never restricts the page it points to.');
      const s = stage('Live: drawn by the site’s sidebar code and styles. The first item is shown as the current page.', false);
      const pair = el('div', 'hb-nav-pair');
      const panel = (title, note, html) => {
        const col = el('div', 'hb-nav-col');
        const aside = el('aside', 'pa-sidebar pa-sidebar--preview');
        aside.setAttribute('aria-label', title + ' preview');
        const inner = el('nav', 'pa-sidebar-nav');
        inner.setAttribute('aria-label', title);
        inner.innerHTML = html;
        inner.querySelectorAll('a').forEach(a => { a.setAttribute('tabindex', '-1'); a.addEventListener('click', e => e.preventDefault()); });
        aside.append(inner);
        col.append(el('h4', 'pa-type-item-title', title), el('p', 'pa-type-caption hb-muted', note), aside);
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
      } else pair.append(el('p', 'pa-type-body-small hb-muted', 'The sidebar component isn’t available on this page.'));
      s.body.append(pair);
      art.append(s.fig, facts([
        ['Site Navigation', ['Edited in Admin Mode on the homepage: Admin Mode › Site Navigation. Up to 16 links in up to 4 groups: label, icon, destination (the site’s pages or a game) and visibility, in any order.']],
        ['Publishing', ['Stored as', { code: 'site.sidebar' }, 'in the homepage’s content and published with the homepage’s Publish Changes; Version History and Restore include it. The server checks every link and icon.']],
        ['Handbook navigation', ['Defined in', { code: 'scripts/handbook/handbook.js' }, '; not editable.']],
        ['Shared code', [{ code: 'scripts/layout.js' }, 'draws both;', { code: 'styles/layout.css' }, 'styles both.']],
        ['Type roles', roles('sidebar')]
      ]));
    }
    {
      const art = entry(navs, 'atlas-navigation', 'Atlas Navigation panel', [chip('Library component', 'muted'), chip('Defined in code', 'muted')],
        'A panel of destinations, each with an icon and a short description; on the homepage, beside the Featured card. A separate widget from the Sidebar Navigation, with its own content. Its rows share the panel’s height; stacked, each row is its natural height.');
      const s = stage('Live preview, drawn by the component with the homepage’s destinations.', false);
      const C = window.PergamonComponents;
      if (C && C.atlasNavigation) {
        const demo = el('div', 'hb-nav-preview');
        demo.append(C.atlasNavigation({ title: 'Atlas Navigation', links: [
          { label: 'Login / Sign Up', description: 'Sign in or create an account', href: '/account/', icon: 'account' },
          { label: 'Settings', description: 'Display mode and colour palette', href: '/settings/', icon: 'settings' },
          { label: 'Update Log', description: 'What’s new on PergamonAtlas', href: '/updates/', icon: 'updates' },
          { label: 'Suggestions', description: 'Share an idea with us', href: '/suggestions/', icon: 'suggestions' }
        ] }).element);
        s.body.append(demo);
      }
      art.append(s.fig, facts([
        ['Configuration', ['Not editable yet: the homepage’s destinations are set in', { code: 'data/home-content.js' }, '(', { code: 'context' }, '); every instance shows the same links.']],
        ['Grid', ['Widget type', { code: 'atlas-navigation' }, '; at least 242px wide (much narrower and the longest label is cut off).']],
        ['Type roles', roles('atlas')],
        ['Source', [{ code: 'scripts/components/atlas-navigation.js' }, { code: 'styles/components/atlas-navigation.css' }]]
      ]));
    }
  }

  app.register('library/widgets', { render });
  ns.widgetsPage = { render };
})();
