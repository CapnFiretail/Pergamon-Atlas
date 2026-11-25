// The Games page: what is its own. An ordinary page drawn by the page renderer
// (scripts/page.js) from its content document; data/games-content.js is the
// built-in copy, shown until the page is published.
(function () {
  const content = window.PergamonGamesContent;
  if (!content || !window.PergamonPages) return;
  // Which built-in games are listed for this visitor: the records' availability, with
  // the overrides administrators have stored; once the page is published, the Game
  // Library's records alone decide (operation/scripts/auth/atlas-visibility.js).
  // That loads after this, so until it answers the records alone decide.
  function visibility() {
    return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve)).then(() => {
      const v = window.PergamonVisibility, games = (window.atlasEntries && window.atlasEntries.games) || [];
      return v ? v.getVisibleEntries(games).then(list => entry => list.indexOf(entry) >= 0) : null;
    });
  }
  window.PergamonPages.mount({ document: content.document, visibility });
})();
