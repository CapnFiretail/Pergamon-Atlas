// Sample inputs for the Handbook's live component previews (Library ›
// Widgets). Content only: the real components in scripts/components/ draw
// every preview, so nothing here imitates their markup. Kept out of the
// component files so production code carries no demo content.
//
// Artwork is given as the components' art model (what scripts/cms/content.js
// produces from a stored card), using images the site already ships.
(function () {
  'use strict';
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};

  const chessArt = {
    src: '/images/featured/chess-forge.webp',
    srcset: '/images/featured/chess-forge-960.webp 960w, /images/featured/chess-forge.webp 1619w',
    width: 1619, height: 971, alt: '', fit: 'cover',
    focus: '78% 5%', focusNarrow: '88% 12%', zoom: 1, zoomNarrow: 1
  };
  const boardArt = {
    src: '/images/featured/connect-four.webp',
    srcset: '/images/featured/connect-four-1100.webp 1100w, /images/featured/connect-four.webp 2172w',
    width: 2172, height: 724, alt: '', fit: 'height',
    scale: 1.3, scaleNarrow: 1, x: 'calc(50% - 60px)', xNarrow: 'calc(100% - 139px)', y: '50%', yNarrow: '50%', base: '#030916'
  };
  // A square crop of the same artwork for cards.
  const cardArt = { src: '/images/featured/chess-forge-960.webp', width: 960, height: 576, alt: '', focus: '72% 30%', focusNarrow: '72% 30%', zoom: 1, zoomNarrow: 1 };

  ns.componentExamples = {
    hero: [
      { name: 'With artwork', content: { title: 'Chess Forge', actionLabel: 'Play Now', href: '#', art: chessArt } },
      { name: 'Any content, no icon', actionIcon: null, content: { title: 'The Atlas Library', actionLabel: 'Explore', href: '#', art: chessArt } },
      { name: 'Missing artwork, long title', content: { title: 'A Much Longer Featured Title That Wraps', actionLabel: 'Read more', href: '#', art: null } }
    ],
    banner: [
      { name: 'Height-fitted artwork', content: { title: 'Connect Four', actionLabel: 'Play Now', href: '#', art: boardArt } },
      { name: 'Missing artwork', actionIcon: null, content: { title: 'New this week', actionLabel: 'See what’s new', href: '#', art: null } }
    ],
    cards: [
      { title: 'Chess Forge', meta: 'Strategy', facet: 'Strategy', art: cardArt },
      { title: 'Snake', meta: 'Arcade', facet: 'Arcade' },
      { title: 'Blackjack', meta: 'Card', facet: 'Card' },
      { title: 'Pong', meta: 'Arcade', facet: 'Arcade' },
      { title: 'A card with a title far too long to fit', meta: 'Long title', facet: 'Strategy' },
      { title: 'Release notes', meta: 'Article', facet: 'Reading', action: null }
    ],
    carousel: {
      id: 'examples', title: 'Example collection',
      icon: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
      filters: ['All', 'Strategy', 'Arcade', 'Card', 'Classic'],
      emptyMessage: 'Nothing here yet.', emptyFilterMessage: 'Nothing in this category yet.'
    },
    headings: [
      { name: 'Every part', content: { title: 'Games', subtitle: 'Pergamon Catalogs', emblem: 'games', countLabel: 'Games' }, count: 8 },
      { name: 'Another emblem, no count', content: { title: 'The Atlas Library', subtitle: 'Reading room', emblem: 'compass' }, count: null },
      { name: 'Title and count', content: { title: 'Release notes', countLabel: 'Entries' }, count: 24 },
      { name: 'Title only, long', content: { title: 'A heading at its longest, forty letters' }, count: null }
    ],
    emptyCarousel: { id: 'empty', title: 'An empty collection', emptyTag: 'Coming Soon', emptyMessage: 'Items will appear here.' }
  };
})();
