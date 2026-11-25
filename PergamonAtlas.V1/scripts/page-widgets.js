// How a page's widgets are drawn: one adapter per widget type, turning the
// page's content (CMS cards, games) into the inputs of the reusable components
// in scripts/components/, which know nothing of either.
//
//   PergamonPageWidgets.create({ gameOf(item, playable), settings })
//     → { [type]: adapter }
//     gameOf     the game a card shows, { path, name }, or null when it isn't listed
//                here; playable: games that are coming soon aren't either
//     settings   the page's own configuration of a type (what isn't CMS content):
//                { explore: the carousel's sections, if it has several, signedIn() }
//                Atlas Navigation is the same everywhere (data/atlas-navigation.js)
//   adapter = {
//     container?           a named size container the component's CSS expects
//     create(placement, content)   → widget, or null when it can't be drawn
//                          here; content: its part of the model ({ cards … })
//     sampleCard?(item)    a detached card like the widget's own, for previews:
//                          { element, art(model) }
//   }
//   widget = {
//     element
//     setCard(item), art(model)        a 'card' widget's card and its artwork
//     clear()                          … which has none to show
//     setCards(items)                  a 'list' widget's cards
//     list(), setTail(node), reveal(key), category()   a 'list' widget's, for
//                          Admin Mode: the element its controls sit on, a tile
//                          after its cards, bring a card into view, its filter
//     shown()                          how many cards a 'list' widget shows
//     setCount(n), setLevel(n)         a heading's: the cards the page's lists show,
//                          and its heading level
//     start(), hold(on)                motion, once in place; held while edited
//     setSignedIn(on)
//   }                      (each only where it applies)
//
// Items are content.toModel's cards: { id, title, href, art, cta | category, game?,
// note? }.
// Which of these a type has follows from scripts/cms/widgets.js.
(function () {
  'use strict';
  const C = window.PergamonComponents;
  if (!C || !C.featureBanner || !C.contentCard || !C.carousel || !C.atlasNavigation || !C.pageHeading || !C.cardGrid) return;
  const ICONS = C.atlasNavigation.ICONS;
  const norm = path => String(path || '').replace(/\/+$/, '');

  // A CMS card shown by the feature banner; its `cta` is the action label.
  function featureCard(variant) {
    const b = C.featureBanner({ variant });
    return {
      element: b.element,
      art: model => b.applyArt(model),
      // Its game isn't listed: the place stays, empty.
      clear() { b.element.style.visibility = 'hidden'; },
      setCard(item) {
        b.element.style.visibility = '';
        b.element.dataset.cmsId = item.id;
        b.apply({ title: item.title, actionLabel: item.cta, href: item.href, art: item.art });
      }
    };
  }
  const featureWidget = variant => ({
    container: 'upper',
    create: () => featureCard(variant),
    sampleCard(item) { const copy = featureCard(variant); copy.setCard(item); return copy; }
  });

  // A game as a content card: its live page, its catalogue name when the card
  // has no title, its category as the card's line of metadata.
  function gameCard(item, entry) {
    const missing = item.note === 'missing';
    const card = C.contentCard({ title: item.title || entry.name, meta: item.category, href: norm(entry.path) + '/', art: item.art, action: missing ? null : 'play' });
    if (missing) card.element.removeAttribute('href');
    if (item.id) card.element.dataset.cmsId = item.id;
    return card.element;
  }
  function sampleGameCard(item, entry) {
    const card = gameCard(item, entry || { path: item.href, name: item.title });
    return { element: card, art: model => C.contentCard.setArt(card, model) };
  }

  // A card visitors see counts; one an administrator sees in its place doesn't.
  const counts = item => !item.note || item.note === 'unpublished';

  // The explore strip: sections (switched with the top-right arrows), each
  // filtered by category (the tabs). A section with `component` takes its
  // cards from the instance's own cards; only cards whose game can be shown are.
  function gamesCarousel(data, cards, gameOf) {
    const items = list => (list || []).map(item => {
      const target = item.href || item.path;
      if (!target && !item.note) return null;
      const entry = gameOf({ href: target, game: item.game, title: item.title, note: item.note }, true);
      if (!entry) { console.warn('Carousel item is not a live page:', target); return null; }
      return { key: item.id || norm(entry.path), counts: counts(item), element: gameCard(item, entry), label: item.title || entry.name, facet: item.category };
    }).filter(Boolean);
    const docSection = (data.sections.find(sec => sec.component) || {}).id;
    const c = C.carousel({
      sections: data.sections.map(sec => ({
        id: sec.id,
        title: sec.title,
        icon: ICONS[sec.icon],
        filters: sec.categories,
        items: items(sec.component ? cards : sec.items),
        emptyMessage: sec.emptyMessage,
        emptyTag: 'Coming Soon',
        emptyFilterMessage: sec.emptyCategory
      }))
    });
    let shown = data.sections.some(sec => sec.component) ? items(cards).filter(i => i.counts).length : 0;
    return {
      element: c.element,
      setCards: next => data.sections.forEach(sec => { if (sec.component) { const list = items(next); shown = list.filter(i => i.counts).length; c.setItems(sec.id, list); } }),
      shown: () => shown,
      list: () => (c.element.matches('.home-carousel') ? c.element : c.element.querySelector('.home-carousel')),
      // Admin Mode's "Add card" tile follows the document's cards only.
      setTail: node => c.setTail(node, docSection),
      reveal: c.reveal,
      category: c.filter,
      start: c.start,
      hold: c.hold
    };
  }
  // Games as cards, all at once. Unlike the carousel it also shows games that are
  // coming soon: it is a list of what there is.
  function gamesGrid(gameOf) {
    let shown = 0;
    const g = C.cardGrid({ label: 'Games', emptyMessage: 'No games here yet.' });
    return {
      element: g.element,
      setCards(cards) {
        shown = 0;
        g.setItems((cards || []).map(item => {
          const entry = gameOf(item, false);
          if (entry && counts(item)) shown++;
          return entry ? { key: item.id, element: gameCard(item, entry), label: item.title || entry.name } : null;
        }).filter(Boolean));
      },
      shown: () => shown,
      list: () => g.section,
      setTail: g.setTail,
      reveal: g.has
    };
  }

  // A page heading: its count panel shows what its `count` asks for.
  function headingWidget() {
    const h = C.pageHeading();
    let counts = 'none', cards = 0;
    const draw = () => h.setCount(counts === 'cards' ? cards : null);
    return {
      element: h.element,
      setCard(item) { h.element.dataset.cmsId = item.id; counts = item.count; h.apply(item); draw(); },
      setCount(n) { cards = n; draw(); },
      setLevel: h.setLevel
    };
  }

  // The page's explore sections for its own carousel (the one it starts with); any
  // other carousel shows its cards as the document section alone, and a page without
  // sections as one of its own.
  const ONE_SECTION = { sections: [{ id: 'games', title: 'Explore Games', icon: 'games', categories: ['All Games', 'Strategy', 'Arcade', 'Classic', 'Card'], emptyCategory: 'No games in this category yet.', emptyMessage: 'No games here yet.', component: 'own' }] };
  function carouselConfig(explore, id) {
    if (!explore) return ONE_SECTION;
    if (id === 'carousel') return explore;
    const sec = explore.sections.find(s => s.component);
    return sec ? { sections: [sec] } : explore;
  }

  function create(env) {
    const settings = env.settings || {};
    return {
      'feature-hero': featureWidget('hero'),
      'feature-spotlight': featureWidget('banner'),
      'carousel': {
        create(p, m) {
          const config = carouselConfig(settings.explore, p.id);
          return config && window.PergamonGlide ? gamesCarousel(config, m ? m.cards : [], env.gameOf) : null;
        },
        sampleCard: item => sampleGameCard(item, env.gameOf(item, true))
      },
      'page-heading': {
        create: headingWidget,
        sampleCard(item) { const copy = headingWidget(); copy.setCard(item); return { element: copy.element, art() {} }; }
      },
      'card-grid': {
        create(p, m) { const g = gamesGrid(env.gameOf); g.setCards(m ? m.cards : []); return g; },
        sampleCard: item => sampleGameCard(item, env.gameOf(item, false))
      },
      'atlas-navigation': {
        create() {
          const nav = C.atlasNavigation(window.PergamonAtlasNavigation || { title: 'Atlas Navigation', links: [] });
          nav.setSignedIn(!!(settings.signedIn && settings.signedIn()));
          return { element: nav.element, setSignedIn: on => nav.setSignedIn(on) };
        }
      }
    };
  }

  window.PergamonPageWidgets = { create };
})();
