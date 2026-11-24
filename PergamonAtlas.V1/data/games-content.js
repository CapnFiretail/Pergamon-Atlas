// The Games page's built-in content: a page document (schema 2,
// docs/cms/ARCHITECTURE.md §11) for the layout in scripts/cms/pages.js.
// scripts/games.js passes it to the page renderer.
//
// Its cards refer to game records ({ game: id }, data/entries.js) and hold
// nothing of a game's own: name, artwork, category, destination and
// availability come from the record. The database doesn't know this kind of
// card, or this page, until migration 0016.
window.PergamonGamesContent = (function () {
  var order = ['tic-tac-toe', 'connect-four', 'chess-forge', 'battleship', 'blackjack', 'snake', 'breakout', 'pong'];
  var components = {
    'games.heading': { title: 'Games', subtitle: 'Pergamon Catalogs', emblem: 'games', count: 'cards', countLabel: 'Games' },
    'games.grid': { order: order }
  };
  order.forEach(function (id) { components['games.grid.' + id] = { game: id }; });
  var page = window.PergamonCMS.pages.get('games');
  return { document: { schema: 2, regions: page.regions(), components: components } };
})();
