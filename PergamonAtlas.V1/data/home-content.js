// Homepage content. /scripts/home.js renders it; nothing here affects layout.
//
// - featured: the cinematic card (title, Play Now, full-bleed artwork). `art`
//   gives the image (src/srcset/width/height), an optional `focus` and
//   `focusNarrow` (CSS object-position for wide and narrow cards) and `alt`
//   (leave '' when the artwork is decorative). No art = a plain dark card.
// - spotlight: the smaller banner below it. `href` should be a live game;
//   `art` will later take an image path (null = placeholder).
// - context: the right-hand panel (Atlas Navigation). Each link may set
//   `signedInLabel` to change its title for signed-in visitors. Set
//   `context: null` to hide the panel.
// - explore: the carousel's sections, switched with the top-right arrows.
//   Game items are looked up by path in /data/entries.js (a path that isn't a
//   live entry is skipped); `category` drives the tabs. A section with no
//   items shows its `emptyMessage`.
window.PergamonHomeContent = {
  featured: {
    title: 'Chess Forge',
    href: '/games/chess-forge/',
    cta: 'Play Now',
    art: {
      src: '/images/featured/chess-forge.webp',
      srcset: '/images/featured/chess-forge-960.webp 960w, /images/featured/chess-forge.webp 1619w',
      width: 1619,
      height: 971,
      focus: '78% 5%',
      focusNarrow: '88% 12%',
      alt: ''
    }
  },

  spotlight: {
    label: 'Spotlight',
    title: 'Connect Four',
    description: 'A classic battle of strategy.',
    href: '/games/connect-four/',
    cta: 'Play Now',
    art: null
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
        items: [
          { path: '/games/battleship', title: 'Battleship', category: 'Strategy', art: null },
          { path: '/games/breakout', title: 'Breakout', category: 'Arcade', art: null },
          { path: '/games/pong', title: 'Pong', category: 'Arcade', art: null },
          { path: '/games/blackjack', title: 'Blackjack', category: 'Card', art: null },
          { path: '/games/connect-four', title: 'Connect Four', category: 'Strategy', art: null },
          { path: '/games/snake', title: 'Snake', category: 'Arcade', art: null }
        ]
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
