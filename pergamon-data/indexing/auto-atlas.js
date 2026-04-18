(function () {
  const path = window.location.pathname;

  let hex, chamber;

  if (path.startsWith('/sectors/atlas/tools')) {
    hex     = 'B100';
    chamber = 'TL';
  } else if (path.startsWith('/sectors/atlas/games')) {
    hex     = 'C100';
    chamber = 'GM';
  }

  if (!hex) return;

  function trySet() {
    if (!window.atlasGenerator) return false;
    const el = document.getElementById('atlas-code-display');
    if (!el) return false;
    el.textContent = window.atlasGenerator.generateFromEntry(hex, path, chamber) || '';
    return true;
  }

  if (!trySet()) {
    new MutationObserver(function (_, obs) {
      if (trySet()) obs.disconnect();
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
