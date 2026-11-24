// Widget registry: the widget types a page document may hold, the kind of
// content each has, and its names in Admin Mode. One entry per type; the rest
// of the CMS asks this table instead of naming types.
//
//   name       the widget's name ("Featured Game")
//   baseId     the id its first instance gets ('featured', then 'featured-2')
//   content    'card'  one active card with its own saved cards
//              'list'  an ordered list of cards
//              'none'  no content of its own
//   card       the kind of its cards (CARDS), unless it has none
//   starter    the title a new one's card starts with ('card')
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
    'atlas-navigation': { name: 'Atlas Navigation', baseId: 'navigation', content: 'none' }
  };

  // Kinds of card: how the editor and the reviews call one.
  const CARDS = {
    feature: { label: 'Featured card' },
    spotlight: { label: 'Spotlight card' },
    tile: { label: 'Carousel card', linkHint: 'Carousel cards link to a game.' }
  };

  const get = type => (Object.prototype.hasOwnProperty.call(WIDGETS, type) ? WIDGETS[type] : null);
  const kind = type => { const w = get(type); return w ? w.content : null; };
  const api = {
    types: Object.keys(WIDGETS),
    get: get,
    hasCard: type => kind(type) === 'card',
    isList: type => kind(type) === 'list',
    hasContent: type => kind(type) === 'card' || kind(type) === 'list',
    cards: CARDS,
    cardLabel: card => (CARDS[card] ? CARDS[card].label : 'Card')
  };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.widgets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
