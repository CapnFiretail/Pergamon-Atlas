// How a page's widgets are drawn: one adapter per widget type, turning the
// page's content (CMS cards, games) into the inputs of the reusable components
// in scripts/components/, which know nothing of either.
//
//   PergamonPageWidgets.create({ liveGame(path), listedGame(path), settings })
//     → { [type]: adapter }
//     liveGame   a game that can be played now, or null; listedGame: one that may be
//                shown, coming soon or not
//     settings   the page's own configuration of a type (what isn't CMS content):
//                { explore: the carousel's sections, navigation: the panel's
//                title and links, signedIn() }
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
// Items are content.toModel's cards: { id, title, href, art, cta | category }.
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
      setCard(item) {
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
    const card = C.contentCard({ title: item.title || entry.name, meta: item.category, href: norm(entry.path) + '/', art: item.art, action: 'play' });
    if (item.id) card.element.dataset.cmsId = item.id;
    return card.element;
  }
  function sampleGameCard(liveGame, item) {
    const card = gameCard(item, liveGame(item.href) || { path: item.href, name: item.title });
    return { element: card, art: model => C.contentCard.setArt(card, model) };
  }

  // The explore strip: sections (switched with the top-right arrows), each
  // filtered by category (the tabs). A section with `component` takes its
  // cards from the instance's own cards; only cards that link to a live game
  // are shown.
  function gamesCarousel(data, cards, liveGame) {
    const items = list => (list || []).map(item => {
      const target = item.href || item.path;
      if (!target) return null;
      const entry = liveGame(target);
      if (!entry) { console.warn('Carousel item is not a live page:', target); return null; }
      return { key: item.id || norm(entry.path), element: gameCard(item, entry), label: item.title || entry.name, facet: item.category };
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
    let shown = data.sections.some(sec => sec.component) ? items(cards).length : 0;
    return {
      element: c.element,
      setCards: next => data.sections.forEach(sec => { if (sec.component) { const list = items(next); shown = list.length; c.setItems(sec.id, list); } }),
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
  function gamesGrid(listedGame) {
    const g = C.cardGrid({ label: 'Games', emptyMessage: 'No games here yet.' });
    return {
      element: g.element,
      setCards: cards => g.setItems((cards || []).map(item => {
        const entry = listedGame(item.href);
        return entry ? { key: item.id, element: gameCard(item, entry), label: item.title || entry.name } : null;
      }).filter(Boolean)),
      shown: g.count,
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

  // The page's explore sections for its own carousel (the one it starts with);
  // any other carousel shows its cards as the document section alone.
  function carouselConfig(explore, id) {
    if (!explore || id === 'carousel') return explore;
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
          return config && window.PergamonGlide ? gamesCarousel(config, m ? m.cards : [], env.liveGame) : null;
        },
        sampleCard: item => sampleGameCard(env.liveGame, item)
      },
      'page-heading': {
        create: headingWidget,
        sampleCard(item) { const copy = headingWidget(); copy.setCard(item); return { element: copy.element, art() {} }; }
      },
      'card-grid': {
        create(p, m) { const g = gamesGrid(env.listedGame); g.setCards(m ? m.cards : []); return g; },
        sampleCard: item => sampleGameCard(env.listedGame, item)
      },
      'atlas-navigation': {
        create() {
          const nav = C.atlasNavigation(settings.navigation || { title: 'Atlas Navigation', links: [] });
          nav.setSignedIn(!!(settings.signedIn && settings.signedIn()));
          return { element: nav.element, setSignedIn: on => nav.setSignedIn(on) };
        }
      }
    };
  }

  window.PergamonPageWidgets = { create };
})();
