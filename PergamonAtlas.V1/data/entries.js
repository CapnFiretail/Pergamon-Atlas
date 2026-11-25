// Game records, built in. The one place a game's own details are kept: a widget
// refers to a game by its id and owns only how it is shown. The Game Library
// (docs/cms/ARCHITECTURE.md §13) holds the same records once it is published; this
// copy is what is shown until then, and when nothing could be read. It is brought up
// to date by hand, as a step of a release.
//
//   PergamonGameLibrary = { schema: 1, order: [id, …], games: { [id]: record } }
//   record = {
//     id, name, category, description?,
//     destination    the game's page: '/games/<…>/'
//     availability   'available' | 'coming-soon' (a placeholder page: listed, not
//                    counted as playable) | 'hidden' | 'archived'
//     art, wide      square and wide artwork: CMS art objects (source, alt, default crop)
//   }
//
// atlasEntries is the same records in the older form the rest of the site reads
// (the homepage, Admin Mode's game lists, atlas-visibility.js, which also honours
// admin overrides stored in Supabase): path without a trailing slash, name,
// visibility 'public' | 'admin', status 'coming-soon', archived.
(function () {
  var square = function (id) { return { source: { static: '/images/featured/' + id + '-card.webp' }, alt: '' }; };
  var game = function (id, name, category, more) {
    return Object.assign({ id: id, name: name, category: category, destination: '/games/' + id + '/', availability: 'available', art: square(id) }, more);
  };
  var list = [
    game('battleship', 'Battleship', 'Strategy'),
    game('blackjack', 'Blackjack', 'Card'),
    game('breakout', 'Breakout', 'Arcade'),
    game('chess-forge', 'Chess Forge', 'Strategy', { description: 'Play. Learn. Improve. A new way to experience chess on the Atlas.' }),
    game('connect-four', 'Connect Four', 'Strategy'),
    game('pong', 'Pong', 'Arcade'),
    game('snake', 'Snake', 'Arcade'),
    game('tic-tac-toe', 'Tic-Tac-Toe', 'Classic', { availability: 'coming-soon' })
  ];
  var games = {};
  list.forEach(function (g) { games[g.id] = g; });
  window.PergamonGameLibrary = { schema: 1, order: list.map(function (g) { return g.id; }), games: games };
  window.atlasEntries = {
    games: list.map(function (g) {
      var e = { path: g.destination.replace(/\/$/, ''), name: g.name, visibility: g.availability === 'available' || g.availability === 'coming-soon' ? 'public' : 'admin' };
      if (g.description) e.description = g.description;
      if (g.availability === 'coming-soon') e.status = 'coming-soon';
      if (g.availability === 'archived') e.archived = true;
      return e;
    })
  };
})();
