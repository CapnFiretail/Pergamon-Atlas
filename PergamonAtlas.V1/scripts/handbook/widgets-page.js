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
// sidebar previews by the site's own sidebar code. Every entry's Source row
// gives its implementation files: { path } parts, repository-relative with a
// copy control (tests/design/widgets-page.test.mjs checks the files exist).
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
    heading: ['page-heading-title', 'page-heading-label', 'numeric', 'label'],
    grid: ['body-small'],
    atlas: ['section-title', 'item-title', 'caption']
  };

  const SITE_DIR = 'PergamonAtlas.V1/';     // the site's folder in the repository
  const COPY_RESET = 2500;

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
    const copyStatus = el('p', 'pa-visually-hidden');
    copyStatus.setAttribute('role', 'status');
    view.append(copyStatus);

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
    // A repository-relative path with its copy control. If copying isn't
    // possible, the path is selected so it can be copied by hand.
    let clearStatus = 0;
    function pathPart(sitePath) {
      const path = SITE_DIR + sitePath;
      const row = el('span', 'hb-path');
      const code = el('code', 'hb-code', path);
      const button = el('button', 'hb-copy pa-type-button-small');
      button.type = 'button';
      const label = el('span', '', 'Copy');
      button.append(label, el('span', 'pa-visually-hidden', ' ' + path));
      let reset = 0;
      function show(state, text, message) {
        clearTimeout(reset);
        clearTimeout(clearStatus);
        button.dataset.state = state;
        label.textContent = text;
        copyStatus.textContent = message;
        reset = setTimeout(() => { delete button.dataset.state; label.textContent = 'Copy'; }, COPY_RESET);
        clearStatus = setTimeout(() => { copyStatus.textContent = ''; }, COPY_RESET);
      }
      button.addEventListener('click', async () => {
        copyStatus.textContent = '';                  // so a repeated message is announced again
        try {
          await navigator.clipboard.writeText(path);
          show('done', 'Copied', `Copied ${path}`);
        } catch (e) {
          window.getSelection().selectAllChildren(code);
          show('failed', 'Copy failed', 'Copy failed. The path is selected, so you can copy it yourself.');
        }
      });
      row.append(code, button);
      return row;
    }
    function facts(rows) {
      const dl = el('dl', 'hb-facts');
      rows.forEach(([k, v]) => {
        const row = el('div', 'hb-fact');
        const dd = el('dd', 'pa-type-body-small');
        (Array.isArray(v) ? v : [v]).forEach((part, i) => {
          if (i) dd.append(' ');
          if (part && part.path) dd.append(pathPart(part.path));
          else if (part && part.code) dd.append(el('code', 'hb-code', part.code)); else dd.append(String(part));
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
        ['Owns', ['Layout, gliding and arrows, filters, sections, empty state, screen-reader announcements, its responsive widths.']],
        ['Used on', ['Homepage: “Explore More Games” (sections Games and Tools; the Games cards come from the CMS component', { code: 'home.carousel' }, ').']],
        ['Widget type', [{ code: 'carousel' }, 'An ordered list of cards.']],
        ['Admin Mode', ['Cards are added, edited, deleted and reordered with Manage cards and the Add card tile; the carousel stands still while editing.']],
        ['Type roles', roles('carousel')],
        ['Source', [{ path: 'scripts/components/carousel.js' }, { path: 'styles/components/carousel.css' }, { path: 'scripts/glide.js' }]]
      ]));
    }

    {
      const art = entry(containers, 'card-grid', 'Card Grid', [chip('Container', 'active'), chip('Live preview', 'muted'), chip('Grows with its content', 'muted')],
        'Every item of a collection at once, in as many columns as its width has room for. It is as tall as its items need and never clips them. Like the carousel, it never builds or inspects its items: the page gives it ready-made elements, such as content cards.');
      if (C.cardGrid && C.contentCard) {
        const items = n => (X.cards || []).slice(0, n).map((c, i) => ({ key: 'grid-' + i, label: c.title, element: C.contentCard({ title: c.title, meta: c.meta, href: '#', art: c.art, action: c.action }).element }));
        const s1 = stage('Live: content cards. Compact shows its narrow layout (its own width, 640px or less).', true);
        const place = el('div', 'hb-place');
        const g1 = C.cardGrid({ label: 'Example collection' });
        g1.setItems(items(6));
        g1.element.addEventListener('click', e => e.preventDefault());
        place.append(g1.element);
        s1.body.append(place);
        const s2 = stage('Live: an empty collection.', false);
        const place2 = el('div', 'hb-place');
        place2.append(C.cardGrid({ label: 'An empty collection', emptyMessage: 'Items will appear here.' }).element);
        s2.body.append(place2);
        art.append(s1.fig, s2.fig);
      } else art.append(missing.cloneNode(true));
      art.append(facts([
        ['Inputs', ['Items', { code: '{ key, element, label }' }, ', an accessible label and an empty message.']],
        ['Owns', ['Columns and gaps, the empty state, screen-reader announcements. Cards are at least 190px wide, 128px when the grid is 640px wide or less.']],
        ['Height', ['Its content’s, or its rectangle’s if that is taller. On the grid, the row it ends on takes the extra height, so nothing can be placed below it for now (Foundations › Atlas Grid › Widgets that grow).']],
        ['Used on', ['The Games page.']],
        ['Widget type', [{ code: 'card-grid' }, 'An ordered list of cards. Offered in Layout Mode on the local server only until its migration is applied.']],
        ['Admin Mode', ['Cards are added, edited, deleted and reordered with Manage cards and the Add card tile. Games that are coming soon are shown too; games that are hidden or archived are not.']],
        ['Type roles', roles('grid')],
        ['Source', [{ path: 'scripts/components/card-grid.js' }, { path: 'styles/components/card-grid.css' }]]
      ]));
    }

    // ── Content components ──────────────────────────────────────────────
    const contents = group('Content components', 'Own the presentation of one piece of content and its interaction. The page decides what they show and where they go.');
    function featureEntry(variant, id, name, examples, text, used, type, admin) {
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
        type,
        ['Admin Mode', admin],
        ['Type roles', roles(variant)],
        ['Source', [{ path: 'scripts/components/feature-banner.js' }, { path: 'styles/components/feature-banner.css' }]]
      ]));
    }
    featureEntry('hero', 'hero', 'Featured Content — Hero', X.hero || [],
      'The large card that introduces one piece of content: full-bleed artwork, a title between ornament rules, and one action. On the homepage it is the Featured Game.',
      ['Homepage: the Featured slot (CMS component', { code: 'home.featured' }, ').'],
      ['Widget type', [{ code: 'feature-hero' }, 'One active card, with its own saved cards.']],
      ['Title, button label, destination, image and its desktop and phone framing; saved cards to switch between.']);
    featureEntry('banner', 'banner', 'Spotlight — Banner', X.banner || [],
      'The same component as a wide, short banner: the title on the left, the artwork through the middle, the action on the right. On the homepage it is the Spotlight.',
      ['Homepage: the Spotlight slot (CMS component', { code: 'home.spotlight' }, ').'],
      ['Widget type', [{ code: 'feature-spotlight' }, 'One active card, with its own saved cards.']],
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
        ['Used on', ['Homepage carousel: one card per game (CMS components', { code: 'home.carousel.<card>' }, '; the page’s widgets turn each game into title, category and link).']],
        ['Admin Mode', ['Title, category, destination game and image with its framing.']],
        ['Type roles', roles('card')],
        ['Source', [{ path: 'scripts/components/content-card.js' }, { path: 'styles/components/content-card.css' }]]
      ]));
    }

    {
      const art = entry(contents, 'page-heading', 'Page Heading', [chip('Content', 'active'), chip('Live preview', 'muted')],
        'The decorative heading of a page: an emblem, a divider, a centred title with a ruled subtitle, and a count panel, in a double frame. It follows the theme and the accent colour. Not the site header, which is part of the frame around every page.');
      if (C.pageHeading) {
        const s = stage('Live: every part is optional but the title. Compact shows its narrow layout (its own width).', true);
        (X.headings || []).forEach(x => {
          const place = el('div', 'hb-place hb-place--heading');
          const h = C.pageHeading({ level: 4 });
          h.apply(x.content);
          h.setCount(x.count);
          place.append(h.element);
          s.body.append(el('p', 'pa-type-label hb-muted hb-example-name', x.name), place);
        });
        art.append(s.fig);
      } else art.append(missing.cloneNode(true));
      art.append(facts([
        ['Inputs', [{ code: '{ title, subtitle, emblem, countLabel }' }, 'and', { code: 'setCount(n)' }, ', ', { code: 'setLevel(n)' }, '. Emblems:', { code: Object.keys((C.pageHeading && C.pageHeading.EMBLEMS) || {}).join(', ') }, 'or none. Any other is one entry in the component: a single-colour mask or an SVG, drawn in the accent.']],
        ['Layout', ['Follows its own width: the count moves under the title at 760px; at 480px and narrower the subtitle and the count are left out, and at 330px the divider. Long titles are set smaller, then wrap. It fills its rectangle’s height.']],
        ['Count', ['Derived, never stored: the widget asks for what to count (the cards this page’s lists show) and the page counts as it draws.']],
        ['Heading level', ['The page decides. The first one on a page without a heading of its own is its <h1>; others are <h2>.']],
        ['Used on', ['The Games page.']],
        ['Widget type', [{ code: 'page-heading' }, 'One set of fields. Offered in Layout Mode on the local server only until its migration is applied.']],
        ['Admin Mode', ['Title, subtitle, emblem, what to count and the count’s label.']],
        ['Type roles', roles('heading')],
        ['Source', [{ path: 'scripts/components/page-heading.js' }, { path: 'styles/components/page-heading.css' }]]
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
        ['Height', ['On a standard page, a panel of fixed height at the top', { code: '--pa-sidebar-panel-h' }, ', whatever is beside it; taller only if its links need it. Here and in the Studio it is as tall as its links and stays in view.']],
        ['Publishing', ['Stored as', { code: 'site.sidebar' }, 'in the homepage’s content and published with the homepage’s Publish Changes; Version History and Restore include it. The server checks every link and icon.']],
        ['Handbook navigation', ['Defined in', { code: 'scripts/handbook/handbook.js' }, '; not editable.']],
        ['Type roles', roles('sidebar')],
        ['Source', [{ path: 'scripts/layout.js' }, { path: 'styles/layout.css' }]]
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
        ['Widget type', [{ code: 'atlas-navigation' }, 'No content of its own.']],
        ['Grid', ['At least 242px wide (much narrower and the longest label is cut off).']],
        ['Type roles', roles('atlas')],
        ['Source', [{ path: 'scripts/components/atlas-navigation.js' }, { path: 'styles/components/atlas-navigation.css' }]]
      ]));
    }
  }

  app.register('library/widgets', { render });
  ns.widgetsPage = { render };
})();
