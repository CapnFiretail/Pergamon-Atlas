// Homepage content. /scripts/home.js renders it; nothing here affects layout.
//
// - featured / spotlight: the two banners in the left column. `href` should be
//   a live game; `art` will later take an image path (null = placeholder).
// - context: the right-hand panel. Its purpose isn't decided yet, so it holds
//   neutral placeholder rows. Set `context: null` to hide the panel.
// - explore: the carousel. Games are looked up by path in /data/entries.js;
//   a path that isn't a live entry is skipped. `category` drives the tabs.
window.PergamonHomeContent = {
  featured: {
    label: 'Featured Game',
    title: 'Chess Forge',
    description: 'A modern chess experience for strategy and skill.',
    href: '/games/chess-forge/',
    cta: 'Play Now',
    art: null
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
    title: 'Context Panel',
    items: ['Item 1', 'Item 2', 'Item 3', 'Item 4'],
    action: 'Action area'
  },

  explore: {
    title: 'Explore More Games',
    categories: ['All Games', 'Strategy', 'Arcade', 'Classic', 'Card'],
    games: [
      { path: '/games/battleship', title: 'Battleship', category: 'Strategy', art: null },
      { path: '/games/breakout', title: 'Breakout', category: 'Arcade', art: null },
      { path: '/games/pong', title: 'Pong', category: 'Arcade', art: null },
      { path: '/games/blackjack', title: 'Blackjack', category: 'Card', art: null },
      { path: '/games/connect-four', title: 'Connect Four', category: 'Strategy', art: null },
      { path: '/games/snake', title: 'Snake', category: 'Arcade', art: null }
    ]
  }
};
