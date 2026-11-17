// Homepage content. Edit labels, descriptions, links, ordering and featured
// items here; /scripts/home.js renders it.
//
// - Any item may set image: '/images/example.png' to replace its SVG icon.
// - status: 'Coming soon' (or any short text) adds a tag to a category card.
// - The featured game is looked up by path in /data/entries.js. A path that
//   isn't a live entry is shown as "Not available" instead of a link, and a
//   game marked status: "coming-soon" there gets a "Coming soon" tag.
// - Category cards show a description only if one is set (description: '...').
// - Stats are not typed in: Games counts the playable entries in
//   /data/entries.js, and Account shows the visitor's sign-in state.
// - learn: { label, href } adds a wide button under the category cards.
window.PergamonHomeContent = {
  eyebrow: 'Welcome to',
  title: 'PergamonAtlas',

  categories: [
    { title: 'Games', href: '/games/', icon: 'games' },
    { title: 'Suggestions', href: '/suggestions/', icon: 'suggestions' },
    { title: 'Account', href: '/account/', icon: 'account' }
  ],

  stats: [
    { key: 'games', title: 'Games', href: '/games/', icon: 'games' },
    { key: 'account', title: 'Account', href: '/account/', icon: 'account' }
  ],

  gamesHeading: 'Featured Game', gamesLinkLabel: 'View All →', gamesHref: '/games/',
  game: { path: '/games/chess-forge', title: 'Chess Forge', description: 'Classic strategy, reimagined.', icon: 'games' }
};
