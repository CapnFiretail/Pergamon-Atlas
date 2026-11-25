// Widget registry: the widget types a page document may hold, the kind of
// content each has, and its names in Admin Mode. One entry per type; the rest
// of the CMS asks this table instead of naming types.
//
//   name       the widget's name ("Featured Game")
//   baseId     the id its first instance gets ('featured', then 'featured-2')
//   content    'card'    one active card with its own saved cards
//              'list'    an ordered list of cards
//              'single'  one set of fields, nothing else
//              'none'    no content of its own
//   card       the kind of its cards (CARDS), unless it has none
//   label, linkHint   what one of them is called, and said of its link, if not
//              as the kind says
//   starter    what a new one starts with: its card's title ('card') or its fields
//              ('single')
//   edit       what Layout Mode calls editing it (default "Edit card")
//   refs       'only': its cards are references to game records, nothing else
//   needs      the migration the database must have to store it. Until every
//              environment has it, the type is drawn wherever a document has it
//              but Layout Mode offers it on the local server only, where saving
//              it is refused and nothing is lost. Remove it with that release
//   cards, one, manage, order     its cards in Manage cards, buttons and reviews
//   intro, empty, hint   'list': what Manage cards and Layout Mode say about it
//
// How a type is drawn is scripts/page-widgets.js; how small it may be,
// scripts/grid/widget-types.js; what its cards hold, CARD_FIELDS in
// scripts/cms/content.js; the server's copy of the list, the newest migration's
// page validator. tests/design/page-registry.test.mjs checks they agree.
// Browser: window.PergamonCMS.widgets; Node: module.exports.
(function (root) {
  'use strict';

  const WIDGETS = {
    'feature-hero': {
      name: 'Featured Game', baseId: 'featured', content: 'card', card: 'feature', starter: 'New featured card',
      cards: 'Featured cards', one: 'featured card', manage: 'featured cards', order: 'Saved featured cards order'
    },
    'feature-spotlight': {
      name: 'Spotlight', baseId: 'spotlight', content: 'card', card: 'spotlight', starter: 'New spotlight card',
      cards: 'Spotlight cards', one: 'spotlight card', manage: 'spotlight cards', order: 'Saved spotlight cards order'
    },
    'carousel': {
      name: 'Carousel', baseId: 'carousel', content: 'list', card: 'tile',
      cards: 'Carousel cards', one: 'carousel card', manage: 'carousel cards', order: 'Carousel order',
      intro: 'The cards visitors see in the Explore More Games carousel, in this order (each category shows its cards in the same order). Changes are part of the draft until you publish.',
      empty: 'No cards: the carousel shows its empty message. Add a card to start.',
      hint: 'Use Manage cards to fill it.'
    },
    'atlas-navigation': { name: 'Atlas Navigation', baseId: 'navigation', content: 'none' },
    'page-heading': {
      name: 'Page Heading', baseId: 'heading', content: 'single', card: 'heading', edit: 'Edit heading',
      starter: { title: 'New heading', subtitle: 'Pergamon Atlas', emblem: 'compass', count: 'none' }
    },
    'card-grid': {
      name: 'Card Grid', baseId: 'grid', content: 'list', card: 'tile', refs: 'only',
      label: 'Grid card', linkHint: 'Grid cards show a game.',
      cards: 'Grid cards', one: 'grid card', manage: 'grid cards', order: 'Card grid order',
      intro: 'The cards this grid shows, in this order. Changes are part of the draft until you publish.',
      empty: 'No cards: the grid shows its empty message. Add a card to start.',
      hint: 'Use Manage cards to fill it. It grows with its cards.'
    }
  };

  // Kinds of card: how the editor and the reviews call one.
  const CARDS = {
    feature: { label: 'Featured card' },
    spotlight: { label: 'Spotlight card' },
    tile: { label: 'Carousel card', linkHint: 'Carousel cards link to a game.' },
    heading: { label: 'Page heading' }
  };

  const get = type => (Object.prototype.hasOwnProperty.call(WIDGETS, type) ? WIDGETS[type] : null);
  const kind = type => { const w = get(type); return w ? w.content : null; };
  const api = {
    types: Object.keys(WIDGETS),
    get: get,
    hasCard: type => kind(type) === 'card' || kind(type) === 'single',      // one set of fields, edited as one
    hasSaved: type => kind(type) === 'card',                                // … with saved cards to switch to
    isList: type => kind(type) === 'list',
    refsOnly: type => !!get(type) && get(type).refs === 'only',
    hasContent: type => !!kind(type) && kind(type) !== 'none',
    offered: type => !!get(type) && (!get(type).needs || root.PERGAMON_ENV === 'development'),
    cards: CARDS,
    cardLabel: (card, type) => (get(type) && get(type).label) || (CARDS[card] ? CARDS[card].label : 'Card'),
    linkHint: (card, type) => (get(type) && get(type).linkHint) || (CARDS[card] && CARDS[card].linkHint) || ''
  };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.widgets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
