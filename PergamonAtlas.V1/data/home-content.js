// Homepage content. Edit labels, descriptions, links, ordering and featured
// items here; /scripts/home.js renders it.
//
// - Any item may set image: '/images/example.png' to replace its SVG icon.
// - status: 'Coming soon' (or any short text) adds a tag to a category card.
// - Featured items are looked up by path in /data/entries.js. A featured path
//   that isn't a live entry is shown as "Not available" instead of a link, and
//   a game marked status: "coming-soon" there gets a "Coming soon" tag.
// - Category cards show a description only if one is set (description: '...').
// - Stats are not typed in: Tools and Games count the available (playable)
//   entries in /data/entries.js, and Account shows the visitor's sign-in state.
window.PergamonHomeContent = {
  eyebrow: 'Welcome to',
  title: 'PergamonAtlas',

  categories: [
    { title: 'Tools', href: '/tools/', icon: 'tools' },
    { title: 'Games', href: '/games/', icon: 'games' },
    { title: 'Atlas', href: '/atlas/', icon: 'atlas', status: 'Coming soon' },
    { title: 'Account', href: '/account/', icon: 'account' }
  ],

  stats: [
    { key: 'tools', title: 'Tools', href: '/tools/', icon: 'tools' },
    { key: 'games', title: 'Games', href: '/games/', icon: 'games' },
    { key: 'account', title: 'Account', href: '/account/', icon: 'account' }
  ],

  toolsHeading: 'Featured Tools', toolsLinkLabel: 'View All →', toolsHref: '/tools/',
  tools: [
    { path: '/tools/gpa-calculator', title: 'GPA Calculator', description: 'Calculate and plan your GPA with ease.', icon: 'calculator' },
    { path: '/tools/unit-converter', title: 'Unit Converter', description: 'Convert between common units instantly.', icon: 'pulse' }
  ],

  gamesHeading: 'Featured Game', gamesLinkLabel: 'View All →', gamesHref: '/games/',
  game: { path: '/games/chess-forge', title: 'Chess Forge', description: 'Classic strategy, reimagined.', icon: 'games' },

  // Latest Updates section. Entries come from /data/update-logs/updates.js
  // (the same records the /updates/ page shows); this only sets the wording
  // and how many of the newest entries appear here.
  updates: {
    eyebrow: 'Atlas Update Logs',
    title: 'Latest Updates',
    description: 'See what’s new on PergamonAtlas.',
    allLabel: 'View All Logs',
    allHref: '/updates/',
    limit: 5
  }
};
