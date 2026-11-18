// Appearance preferences. Load synchronously in <head>, before any
// stylesheet that depends on the theme, so the first paint already has the
// right palette, mode and sidebar width.
//
// Stored in localStorage under 'pa-appearance' as { palette, mode }:
//   mode     'dark' | 'light' | 'system'  — anyone may change it
//   palette  one of PALETTES             — non-default palettes need an account
// Guests always render Obsidian & Gold, whatever is stored. Whether someone is
// signed in is first guessed from Supabase's stored session (synchronous), then
// confirmed by layout.js once the auth client reports the real session.
// Preferences are local to this browser; nothing here talks to the network.
(function () {
  var STORAGE_KEY = 'pa-appearance';
  var SIDEBAR_KEY = 'paSidebarCollapsed';
  // supabase-js stores the session as sb-<project ref>-auth-token. Match any
  // ref so the guess works on production and on staging previews alike
  // (theme.js runs before the environment's Supabase config is loaded).
  var AUTH_KEY_RE = /^sb-[a-z0-9]{20}-auth-token$/;
  var DEFAULT_PALETTE = 'obsidian';
  var DEFAULT_MODE = 'dark';
  var PALETTES = [
    { id: 'obsidian', name: 'Obsidian & Gold' },
    { id: 'sapphire', name: 'Midnight & Sapphire' },
    { id: 'emerald', name: 'Graphite & Emerald' },
    { id: 'copper', name: 'Onyx & Copper' }
  ];
  var MODES = ['dark', 'light', 'system'];

  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var listeners = [];

  function isPalette(id) { return PALETTES.some(function (p) { return p.id === id; }); }

  function readPrefs() {
    var prefs = { palette: DEFAULT_PALETTE, mode: DEFAULT_MODE };
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && isPalette(stored.palette)) prefs.palette = stored.palette;
      if (stored && MODES.indexOf(stored.mode) !== -1) prefs.mode = stored.mode;
    } catch (e) {}
    return prefs;
  }

  function writePrefs() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) {}
  }

  function hasStoredSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (AUTH_KEY_RE.test(key) && localStorage.getItem(key)) return true;
      }
    } catch (e) {}
    return false;
  }

  var prefs = readPrefs();
  var signedIn = hasStoredSession();
  // Admin Mode's "View as Guest" preview: shows this page as signed out
  // without signing out (null = no preview). In memory, this page only.
  var preview = null;

  function state() {
    var systemDark = media ? media.matches : true;
    var shownSignedIn = preview === null ? signedIn : preview;
    return {
      mode: prefs.mode,
      palette: prefs.palette,
      resolvedMode: prefs.mode === 'system' ? (systemDark ? 'dark' : 'light') : prefs.mode,
      activePalette: shownSignedIn ? prefs.palette : DEFAULT_PALETTE,
      signedIn: shownSignedIn
    };
  }

  function apply() {
    var s = state();
    root.setAttribute('data-palette', s.activePalette);
    root.setAttribute('data-mode', s.resolvedMode);
    root.setAttribute('data-mode-pref', s.mode);
    listeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
  }

  // Collapsed unless the visitor has explicitly expanded it ('0' is stored
  // only by the expand toggle), so first visits start with the compact rail.
  function applySidebar() {
    var collapsed = true;
    try { collapsed = localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch (e) {}
    root.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded');
  }

  apply();
  applySidebar();

  if (media) {
    var onSystemChange = function () { if (prefs.mode === 'system') apply(); };
    if (media.addEventListener) media.addEventListener('change', onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }

  // Keep other open tabs in step.
  window.addEventListener('storage', function (event) {
    if (event.key === STORAGE_KEY) { prefs = readPrefs(); apply(); }
    else if (event.key === null || AUTH_KEY_RE.test(event.key)) { signedIn = hasStoredSession(); apply(); }
    else if (event.key === SIDEBAR_KEY) applySidebar();
  });

  window.PergamonTheme = {
    PALETTES: PALETTES,
    MODES: MODES,
    DEFAULT_PALETTE: DEFAULT_PALETTE,
    get: state,
    setMode: function (mode) {
      if (MODES.indexOf(mode) === -1) return false;
      prefs.mode = mode; writePrefs(); apply();
      return true;
    },
    // Returns false (and changes nothing) for a guest choosing a non-default palette.
    setPalette: function (id) {
      if (!isPalette(id)) return false;
      if (!signedIn && id !== DEFAULT_PALETTE) return false;
      prefs.palette = id; writePrefs(); apply();
      return true;
    },
    // Called with the real session state once the auth client has loaded.
    setSignedIn: function (value) {
      value = !!value;
      if (value === signedIn) return;
      signedIn = value; apply();
    },
    // true / false shows the page as signed in / out; null ends the preview.
    previewSignedIn: function (value) {
      value = value === null || value === undefined ? null : !!value;
      if (value === preview) return;
      preview = value; apply();
    },
    onChange: function (fn) { listeners.push(fn); }
  };
})();
