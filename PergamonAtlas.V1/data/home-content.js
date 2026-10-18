// Homepage content. Edit labels, descriptions, links, ordering and featured
// items here; /scripts/home.js renders it.
//
// - Any item may set image: '/images/example.png' to replace its SVG icon.
// - status: 'Coming soon' (or any short text) adds a tag to a category card.
// - Featured items are looked up by path in /data/entries.js. A featured path
//   that isn't a live entry is shown as "Not available" instead of a link, and
//   a game marked status: "coming-soon" there gets a "Coming soon" tag.
// - Stats are not typed in: Tools and Games are counted from /data/entries.js
//   and Account shows the visitor's sign-in state.
window.PergamonHomeContent = {
  eyebrow: 'Welcome to',
  title: 'PergamonAtlas',

  categories: [
    { title: 'Tools', description: 'Calculators, converters, and productivity tools.', href: '/tools/', icon: 'tools' },
    { title: 'Games', description: 'Play classic and modern games.', href: '/games/', icon: 'games' },
    { title: 'Atlas', description: 'Explore knowledge and resources.', href: '/atlas/', icon: 'atlas', status: 'Coming soon' },
    { title: 'Account', description: 'Manage your profile and settings.', href: '/account/', icon: 'account' }
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
  game: { path: '/games/chess-forge', title: 'Chess Forge', description: 'Classic strategy, reimagined.', icon: 'games' }
};
