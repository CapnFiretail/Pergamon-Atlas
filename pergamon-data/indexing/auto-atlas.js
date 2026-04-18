(function () {
  const path = window.location.pathname;

  let systemCode, chamber;

  if (path.startsWith('/sectors/atlas/tools')) {
    systemCode = 'SYSTEM-NAV-0-0-1-B100';
    chamber = 'TL';
  } else if (path.startsWith('/sectors/atlas/games')) {
    systemCode = 'SYSTEM-NAV-0-0-2-C100';
    chamber = 'GM';
  }

  if (!systemCode) return;

  function trySet() {
    if (!window.atlasGenerator) return false;
    const el = document.getElementById('atlas-code-display');
    if (!el) return false;
    el.textContent = window.atlasGenerator.generateFromPath(path, chamber) || '';
    return true;
  }

  if (!trySet()) {
    new MutationObserver(function (_, obs) {
      if (trySet()) obs.disconnect();
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
