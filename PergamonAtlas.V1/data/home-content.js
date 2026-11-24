// Homepage content. /scripts/home.js passes it to the page renderer; nothing here affects layout.
//
// - document: the editable cards, in the CMS content format (schema v1, the
//   same shape the CMS stores and publishes; see docs/cms/ARCHITECTURE.md).
//   This copy is the static fallback; scripts/cms/content.js translates it
//   for the renderer. Components:
//     home.featured / home.spotlight  { title, cta, href, art?, style? }
//     home.carousel                   { order: [card ids] }
//     home.carousel.<id>              { title, category, href, art? }
//   art = { source: { static: '/images/featured/…' } | { media: '<id>' },
//           alt, fit: 'cover' (default) | 'height', focus / focusNarrow {x, y}
//           (percent), scale / scaleNarrow, anchor / anchorNarrow
//           { x (percent), offset (px), y (percent) }, base '#rrggbb' }.
//   Positions are numbers; the translation layer builds the CSS.
// - staticImages: size details for images under /images/featured/ that the
//   document may reference (responsive variants, intrinsic size).
// - context: the right-hand panel (Atlas Navigation). Each link may set
//   `signedInLabel` to change its title for signed-in visitors. Set
//   `context: null` to hide the panel.
// - explore: the carousel's sections, switched with the top-right arrows.
//   A section with `component` takes its cards from that document component;
//   cards whose link isn't a live entry in /data/entries.js are skipped.
//   `category` drives the tabs. A section with no items shows its `emptyMessage`.
window.PergamonHomeContent = {
  document: {
    schema: 1,
    components: {
      'home.featured': {
        title: 'Chess Forge',
        cta: 'Play Now',
        href: '/games/chess-forge/',
        art: {
          source: { static: '/images/featured/chess-forge.webp' },
          alt: '',
          focus: { x: 78, y: 5 },
          focusNarrow: { x: 88, y: 12 }
        },
        style: { rules: true }
      },
      'home.spotlight': {
        title: 'Connect Four',
        cta: 'Play Now',
        href: '/games/connect-four/',
        art: {
          source: { static: '/images/featured/connect-four.webp' },
          alt: '',
          fit: 'height',
          scale: 1.3,
          scaleNarrow: 1,
          anchor: { x: 50, offset: -60, y: 50 },
          anchorNarrow: { x: 100, offset: -139, y: 50 },
          base: '#030916'
        },
        style: { rules: true }
      },
      'home.carousel': { order: ['battleship', 'breakout', 'pong', 'blackjack', 'connect-four', 'snake'] },
      'home.carousel.battleship': { title: 'Battleship', category: 'Strategy', href: '/games/battleship/' },
      'home.carousel.breakout': { title: 'Breakout', category: 'Arcade', href: '/games/breakout/' },
      'home.carousel.pong': { title: 'Pong', category: 'Arcade', href: '/games/pong/' },
      'home.carousel.blackjack': { title: 'Blackjack', category: 'Card', href: '/games/blackjack/' },
      'home.carousel.connect-four': { title: 'Connect Four', category: 'Strategy', href: '/games/connect-four/' },
      'home.carousel.snake': { title: 'Snake', category: 'Arcade', href: '/games/snake/' }
    }
  },

  staticImages: {
    '/images/featured/chess-forge.webp': {
      srcset: '/images/featured/chess-forge-960.webp 960w, /images/featured/chess-forge.webp 1619w',
      width: 1619,
      height: 971
    },
    '/images/featured/connect-four.webp': {
      srcset: '/images/featured/connect-four-1100.webp 1100w, /images/featured/connect-four.webp 2172w',
      width: 2172,
      height: 724
    }
  },

  context: {
    title: 'Atlas Navigation',
    links: [
      { label: 'Login / Sign Up', signedInLabel: 'Account', description: 'Sign in or create an account', signedInDescription: 'Your profile and sign-in details', href: '/account/', icon: 'account' },
      { label: 'Settings', description: 'Display mode and colour palette', href: '/settings/', icon: 'settings' },
      { label: 'Update Log', description: 'What’s new on PergamonAtlas', href: '/updates/', icon: 'updates' },
      { label: 'Suggestions', description: 'Share an idea with us', href: '/suggestions/', icon: 'suggestions' }
    ]
  },

  explore: {
    sections: [
      {
        id: 'games',
        title: 'Explore More Games',
        icon: 'games',
        categories: ['All Games', 'Strategy', 'Arcade', 'Classic', 'Card'],
        emptyCategory: 'No games in this category yet.',
        component: 'home.carousel'
      },
      {
        // Future section: no tools exist yet, so every category shows the
        // Coming Soon state.
        id: 'tools',
        title: 'Explore More Tools',
        icon: 'tools',
        categories: ['All Tools', 'Utilities', 'Calculators', 'Other'],
        emptyMessage: 'Tools are coming soon.',
        items: []
      }
    ]
  }
};
