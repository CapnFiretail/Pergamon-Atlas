// Pergamon Atlas — homepage customization + publication (homepage only)
//
// Loaded ONLY by index.html (not in the indexer's ATLAS_SCRIPTS block, so
// no other page pays for it). Defines window.PergamonHomepage.
//
// Two independent concerns, deliberately separate call paths:
//   CONTENT   — setHeroImage() / setFeaturedArtifact(). Write only their
//               own column(s). Never touch `published`.
//   PUBLISH   — publish() / unpublish(). Write only `published`. Never
//               touch content.
// Saving content while unpublished changes nothing the public can see.
//
// SOURCE OF TRUTH
//   homepage_settings.hero_image_path → object path in the 'homepage'
//     Storage bucket; resolved to a CDN URL here.
//   homepage_settings.hero_image_zoom / _x / _y → presentation-only crop
//     state, applied with CSS (object-position + transform: scale) — no
//     new image file is produced. Defaults 1 / 50 / 50 (centred).
//   homepage_settings.featured_path   → a normalized Atlas path. Title,
//     card image and destination are resolved from that artifact's
//     canonical entry in window.atlasEntries (entries.js) — NOT stored
//     here.
//   homepage_settings.featured_description → homepage-only editorial copy
//     for the Featured Today card. NULL → fall back to the artifact's
//     canonical description. Never writes back to canonical metadata.
//     Reset to NULL whenever the featured artifact changes.
//   homepage_settings.published       → classic vs configurable homepage
//     for the public. '/' is never given an atlas_visibility_overrides
//     row; Home stays permanently in navigation/search.
//
// Every mutation below is guarded by RLS on profiles.role server-side. The
// client is not the trust boundary — a non-admin calling these (or the
// Supabase client directly) is rejected by Postgres/Storage.
//
// Load order is defensive: like atlas-visibility.js this polls for its
// dependencies rather than assuming a script position, so it is safe even
// if the indexer reorders the surrounding <script> tags.

(function () {
  var settingsPromise = null;

  function waitForDep(getDep, timeoutMs) {
    return new Promise(function (resolve) {
      var dep = getDep();
      if (dep) { resolve(dep); return; }
      var elapsed = 0;
      var iv = setInterval(function () {
        elapsed += 50;
        var d = getDep();
        if (d || elapsed >= (timeoutMs || 5000)) {
          clearInterval(iv);
          resolve(d || null);
        }
      }, 50);
    });
  }

  function normPath(p) {
    if (window.PergamonVisibility && window.PergamonVisibility.normalizePath) {
      return window.PergamonVisibility.normalizePath(p);
    }
    if (!p) return p;
    var s = String(p).replace(/\/index\.html$/, '');
    if (s.length > 1) s = s.replace(/\/+$/, '');
    return s || '/';
  }

  // One fetch per page load (cached). Resolves { data, error }:
  //
  //   { data: <row>, error: null }  — settings loaded.
  //   { data: null,  error: null }  — query SUCCEEDED but there is no
  //       accessible row: a guest on an unpublished homepage (RLS hides
  //       it) or the singleton row is missing. "Nothing to show", NOT a
  //       failure — the caller renders the classic homepage.
  //   { data: null,  error: <e> }   — an actual Supabase/query failure.
  //       The caller still falls back to the classic homepage for the
  //       public (no technical error shown to visitors), but this is
  //       logged loudly for admins and surfaced in the footer publish
  //       panel so a broken published homepage is not mistaken for an
  //       unpublished one.
  function fetchSettings() {
    if (settingsPromise) return settingsPromise;
    settingsPromise = (async function () {
      try {
        var auth = await waitForDep(function () { return window.PergamonAuth; });
        if (!auth || !auth.getHomepageSettings) {
          console.error('PergamonHomepage: PergamonAuth.getHomepageSettings unavailable (script load problem).');
          return { data: null, error: { message: 'auth unavailable' } };
        }
        var res = await auth.getHomepageSettings();
        if (res && res.error) {
          console.error(
            'PergamonHomepage: could not load homepage_settings from Supabase. ' +
            'A published homepage will fall back to the classic hero for visitors ' +
            'until this is resolved — check the schema/migration and RLS. Details:', res.error);
          return { data: null, error: res.error };
        }
        return { data: (res && res.data) || null, error: null };
      } catch (err) {
        console.error('PergamonHomepage: settings fetch threw', err);
        return { data: null, error: err || { message: 'settings fetch threw' } };
      }
    })();
    return settingsPromise;
  }

  function invalidate() { settingsPromise = null; }

  // updateHomepageSettings() now returns { data, error } where data is the
  // written row echoed back (or [] / null when nothing was written). A
  // genuine persist echoes exactly one row; an RLS-blocked or no-op write
  // echoes nothing and MUST NOT count as success.
  function confirmRow(res) {
    if (!res || res.error) return null;
    var d = res.data;
    if (Array.isArray(d)) return d.length === 1 ? d[0] : null;
    return d || null;
  }

  // Write a patch, then verify it actually persisted before reporting
  // success. checkFn(row) asserts the echoed row matches what was asked
  // for. On any failure the settings cache is left untouched (so the
  // previous state stands) and an { error } is returned for the UI.
  async function writeAndConfirm(patch, checkFn) {
    var auth = await waitForDep(function () { return window.PergamonAuth; });
    if (!auth || !auth.updateHomepageSettings) {
      return { error: { message: 'Not ready — try again in a moment.' } };
    }
    var res = await auth.updateHomepageSettings(patch);
    if (res && res.error) {
      console.error('PergamonHomepage: write rejected by Supabase', res.error, patch);
      return { error: res.error };
    }
    var row = confirmRow(res);
    if (!row) {
      console.error('PergamonHomepage: write echoed no row — not persisted (RLS / no-op)', patch);
      return { error: { message: 'Not saved — permission denied or the change did not persist.' } };
    }
    if (checkFn && !checkFn(row)) {
      console.error('PergamonHomepage: write persisted but row does not match the request', { patch: patch, row: row });
      return { error: { message: 'The change did not persist correctly. Please retry.' } };
    }
    invalidate();
    return { data: row };
  }

  async function isPublished() {
    var r = await fetchSettings();
    return !!(r.data && r.data.published);
  }

  // { published, loadError } — lets the footer publish panel show
  // "status unavailable" instead of a false "Classic homepage (public)"
  // when the settings read itself failed.
  async function getPublishState() {
    var r = await fetchSettings();
    return { published: !!(r.data && r.data.published), loadError: !!r.error };
  }

  // ── Hero crop state ──────────────────────────────────────────────────────
  var CROP_DEFAULTS = { zoom: 1, x: 50, y: 50 };

  function clamp(n, lo, hi, dflt) {
    n = Number(n);
    if (!isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  function normCrop(s) {
    return {
      zoom: clamp(s && s.hero_image_zoom, 1, 3, CROP_DEFAULTS.zoom),
      x: clamp(s && s.hero_image_x, 0, 100, CROP_DEFAULTS.x),
      y: clamp(s && s.hero_image_y, 0, 100, CROP_DEFAULTS.y)
    };
  }

  // Look up ANY Atlas artifact by path in entries.js (tools + games +
  // pages, NOT archived). Returns the raw entry ({ path, name, visibility,
  // description?, card_image?, … }) or null. The single source of truth
  // for name + static visibility; catalog artwork / a Tool's canonical
  // description live in the catalog pages and are resolved there.
  function lookupEntry(path) {
    if (!path) return null;
    var E = window.atlasEntries || {};
    var pool = [].concat(E.tools || [], E.games || [], E.pages || []);
    var key = normPath(path);
    for (var i = 0; i < pool.length; i++) {
      if (normPath(pool[i].path) === key) return pool[i];
    }
    return null;
  }

  // Resolve a featured-artifact path against canonical entry metadata.
  // Searches tools + games + pages (NOT archived). featured_path is not
  // architecturally limited to any catalog — any eligible entry resolves.
  // `descOverride` is homepage_settings.featured_description: when non-empty
  // it wins over the artifact's canonical description.
  function resolveFeatured(featuredPath, descOverride) {
    if (!featuredPath) return null;
    var entry = lookupEntry(featuredPath);
    if (!entry) return null;
    var override = (typeof descOverride === 'string') ? descOverride.trim() : '';
    return {
      path: entry.path,
      title: entry.name,
      canonicalDescription: entry.description || '',
      description: override || entry.description || '',
      descriptionIsOverride: !!override,
      cardImage: entry.card_image || null
    };
  }

  // ── Featured Today trio (experiment) ─────────────────────────────────────
  // The homepage decides whether to render the single card or the trio (a
  // one-line flag there). This layer just exposes both shapes.
  var FEATURED_DEFAULTS = {
    tool1: '/tools/gpa-calculator',
    tool2: '/tools/scientific-calculator',
    game: '/games/chess-forge'
  };

  // Everything a renderer needs, resolved. heroImageUrl / featured are
  // null when unset — callers fall back to the built-in placeholder / a
  // default.
  async function getResolved() {
    var r = await fetchSettings();
    var s = r.data;
    var auth = window.PergamonAuth;
    var heroPath = s && s.hero_image_path;
    var crop = normCrop(s);

    // Game slot falls back to the pre-trio featured_path (0006 migrates it,
    // this covers a not-yet-migrated row too), then the built-in default.
    var gamePath = (s && s.featured_game_path) || (s && s.featured_path) || FEATURED_DEFAULTS.game;
    var gameDescOverride = (s && s.featured_game_description) || null;

    return {
      loadError: !!r.error,
      published: !!(s && s.published),
      heroImagePath: heroPath || null,
      heroImageUrl: (heroPath && auth && auth.homepageAssetPublicUrl)
        ? auth.homepageAssetPublicUrl(heroPath)
        : null,
      heroZoom: crop.zoom,
      heroX: crop.x,
      heroY: crop.y,

      // Pre-trio single-card shape (unchanged) — the fallback render path.
      featuredPath: (s && s.featured_path) || null,
      featuredDescription: (s && s.featured_description) || null,
      featured: resolveFeatured(s && s.featured_path, s && s.featured_description),

      // Trio shape: three { slot, path, descriptionOverride }. Names,
      // artwork, canonical descriptions and effective visibility are
      // resolved on the homepage (it fetches the catalogs); this only
      // holds what is genuinely homepage-specific.
      featuredTools: [
        { slot: 1, path: (s && s.featured_tool_1_path) || FEATURED_DEFAULTS.tool1, descriptionOverride: (s && s.featured_tool_1_description) || null },
        { slot: 2, path: (s && s.featured_tool_2_path) || FEATURED_DEFAULTS.tool2, descriptionOverride: (s && s.featured_tool_2_description) || null }
      ],
      featuredGame: { path: gamePath, descriptionOverride: gameDescOverride }
    };
  }

  // ── CONTENT: hero image ──────────────────────────────────────────────────
  var OK_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  var MAX_BYTES = 3 * 1024 * 1024;

  async function setHeroImage(file) {
    if (!file || !OK_TYPES[file.type]) {
      return { error: { message: 'Choose a PNG, JPEG, or WebP image.' } };
    }
    if (file.size > MAX_BYTES) {
      return { error: { message: 'Image must be 3 MB or smaller.' } };
    }
    var auth = await waitForDep(function () { return window.PergamonAuth; });
    if (!auth) return { error: { message: 'Not ready — try again in a moment.' } };

    var prev = (await fetchSettings()).data;
    var objectPath = 'hero/' + Date.now() + '.' + OK_TYPES[file.type];

    var up = await auth.uploadHomepageAsset(objectPath, file);
    if (up && up.error) return { error: up.error };

    // A replacement image needs its own framing — reset the crop to
    // centred / no zoom in the same write. writeAndConfirm verifies the
    // row actually holds the new path before we call it saved.
    var r = await writeAndConfirm({
      hero_image_path: objectPath,
      hero_image_zoom: CROP_DEFAULTS.zoom,
      hero_image_x: CROP_DEFAULTS.x,
      hero_image_y: CROP_DEFAULTS.y
    }, function (row) { return row.hero_image_path === objectPath; });

    if (r.error) {
      // Roll back the orphaned upload; ignore failure (RLS/UX, not data).
      try { await auth.removeHomepageAsset(objectPath); } catch (e) {}
      return r;
    }

    if (prev && prev.hero_image_path && prev.hero_image_path !== objectPath) {
      try { await auth.removeHomepageAsset(prev.hero_image_path); } catch (e) {}
    }
    return { data: { hero_image_path: objectPath } };
  }

  // Presentation-only crop state. Values are clamped here and again by the
  // column CHECK constraints server-side, then the persisted row is
  // verified to hold exactly those values.
  async function setHeroCrop(crop) {
    var z = clamp(crop && crop.zoom, 1, 3, CROP_DEFAULTS.zoom);
    var x = clamp(crop && crop.x, 0, 100, CROP_DEFAULTS.x);
    var y = clamp(crop && crop.y, 0, 100, CROP_DEFAULTS.y);
    var r = await writeAndConfirm(
      { hero_image_zoom: z, hero_image_x: x, hero_image_y: y },
      function (row) {
        return Number(row.hero_image_zoom) === z
          && Number(row.hero_image_x) === x
          && Number(row.hero_image_y) === y;
      }
    );
    return r.error ? r : { data: { zoom: z, x: x, y: y } };
  }

  // ── CONTENT: featured artifact ───────────────────────────────────────────
  async function setFeaturedArtifact(pathRef) {
    var key = pathRef ? normPath(pathRef) : null;
    // Switching artifacts drops any homepage-specific description so the
    // new artifact starts from its own canonical copy (V1 behaviour).
    var r = await writeAndConfirm(
      { featured_path: key, featured_description: null },
      function (row) {
        return (row.featured_path || null) === key && (row.featured_description || null) === null;
      }
    );
    return r.error ? r : { data: { featured_path: key } };
  }

  // Homepage-only editorial copy for the Featured Today card. Empty / blank
  // input clears the override (NULL) → the card falls back to the
  // artifact's canonical description. Canonical metadata is never touched.
  async function setFeaturedDescription(text) {
    var value = (typeof text === 'string') ? text.trim() : '';
    var want = value || null;
    var r = await writeAndConfirm(
      { featured_description: want },
      function (row) { return (row.featured_description || null) === want; }
    );
    return r.error ? r : { data: { featured_description: want } };
  }

  // ── CONTENT: Featured Today trio ─────────────────────────────────────────
  // Each write goes through writeAndConfirm — an RLS-blocked / no-op write
  // is reported as a failure, never a false success. Changing a slot's
  // artifact clears that slot's description override (same rule as the
  // single-card path).
  async function setFeaturedTool(slot, pathRef) {
    var n = (Number(slot) === 2) ? 2 : 1;
    var key = pathRef ? normPath(pathRef) : null;
    var pCol = 'featured_tool_' + n + '_path';
    var dCol = 'featured_tool_' + n + '_description';
    var patch = {}; patch[pCol] = key; patch[dCol] = null;
    var r = await writeAndConfirm(patch, function (row) {
      return (row[pCol] || null) === key && (row[dCol] || null) === null;
    });
    return r.error ? r : { data: { slot: n, path: key } };
  }

  async function setFeaturedGame(pathRef) {
    var key = pathRef ? normPath(pathRef) : null;
    var r = await writeAndConfirm(
      { featured_game_path: key, featured_game_description: null },
      function (row) {
        return (row.featured_game_path || null) === key && (row.featured_game_description || null) === null;
      }
    );
    return r.error ? r : { data: { path: key } };
  }

  var SLOT_DESC_COL = {
    tool1: 'featured_tool_1_description',
    tool2: 'featured_tool_2_description',
    game:  'featured_game_description'
  };

  // Homepage-only editorial copy for one trio slot. Blank clears it (NULL)
  // → the card falls back to the artifact's catalog/canonical description.
  // Canonical metadata is never touched.
  async function setFeaturedSlotDescription(slot, text) {
    var col = SLOT_DESC_COL[slot];
    if (!col) return { error: { message: 'Unknown featured slot: ' + slot } };
    var value = (typeof text === 'string') ? text.trim() : '';
    var want = value || null;
    var patch = {}; patch[col] = want;
    var r = await writeAndConfirm(patch, function (row) { return (row[col] || null) === want; });
    return r.error ? r : { data: { slot: slot, description: want } };
  }

  // ── PUBLISH ──────────────────────────────────────────────────────────────
  // The UI only transitions to "published"/"unpublished" after the row is
  // confirmed to actually hold the requested value.
  async function setPublished(next) {
    return writeAndConfirm(
      { published: !!next },
      function (row) { return !!row.published === !!next; }
    );
  }
  function publish() { return setPublished(true); }
  function unpublish() { return setPublished(false); }

  window.PergamonHomepage = {
    ready: fetchSettings,
    invalidate: invalidate,
    isPublished: isPublished,
    getPublishState: getPublishState,
    getResolved: getResolved,
    resolveFeatured: resolveFeatured,
    lookupEntry: lookupEntry,
    featuredDefaults: function () { return { tool1: FEATURED_DEFAULTS.tool1, tool2: FEATURED_DEFAULTS.tool2, game: FEATURED_DEFAULTS.game }; },
    cropDefaults: function () { return { zoom: CROP_DEFAULTS.zoom, x: CROP_DEFAULTS.x, y: CROP_DEFAULTS.y }; },
    setHeroImage: setHeroImage,
    setHeroCrop: setHeroCrop,
    setFeaturedArtifact: setFeaturedArtifact,
    setFeaturedDescription: setFeaturedDescription,
    setFeaturedTool: setFeaturedTool,
    setFeaturedGame: setFeaturedGame,
    setFeaturedSlotDescription: setFeaturedSlotDescription,
    publish: publish,
    unpublish: unpublish
  };
})();
