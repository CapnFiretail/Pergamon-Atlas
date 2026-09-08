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

  // One fetch per page load (cached). Falls back to null (→ classic
  // homepage, no custom content) on any failure or when the RLS policy
  // hides the row from a guest on an unpublished homepage.
  function fetchSettings() {
    if (settingsPromise) return settingsPromise;
    settingsPromise = (async function () {
      try {
        var auth = await waitForDep(function () { return window.PergamonAuth; });
        if (!auth || !auth.getHomepageSettings) {
          console.warn('PergamonHomepage: PergamonAuth.getHomepageSettings unavailable — classic homepage only');
          return null;
        }
        var res = await auth.getHomepageSettings();
        if (res && res.error) {
          console.warn('PergamonHomepage: settings fetch failed — classic homepage only', res.error);
          return null;
        }
        return (res && res.data) || null;
      } catch (err) {
        console.error('PergamonHomepage: settings fetch threw — classic homepage only', err);
        return null;
      }
    })();
    return settingsPromise;
  }

  function invalidate() { settingsPromise = null; }

  async function isPublished() {
    var s = await fetchSettings();
    return !!(s && s.published);
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

  // Resolve a featured-artifact path against canonical entry metadata.
  // Searches tools + games + pages (NOT archived). featured_path is not
  // architecturally limited to any catalog — any eligible entry resolves.
  // `descOverride` is homepage_settings.featured_description: when non-empty
  // it wins over the artifact's canonical description.
  function resolveFeatured(featuredPath, descOverride) {
    if (!featuredPath) return null;
    var E = window.atlasEntries || {};
    var pool = [].concat(E.tools || [], E.games || [], E.pages || []);
    var key = normPath(featuredPath);
    var entry = null;
    for (var i = 0; i < pool.length; i++) {
      if (normPath(pool[i].path) === key) { entry = pool[i]; break; }
    }
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

  // Everything a renderer needs, resolved. heroImageUrl / featured are
  // null when unset — callers fall back to the built-in placeholder / a
  // default.
  async function getResolved() {
    var s = await fetchSettings();
    var auth = window.PergamonAuth;
    var heroPath = s && s.hero_image_path;
    var crop = normCrop(s);
    return {
      published: !!(s && s.published),
      heroImagePath: heroPath || null,
      heroImageUrl: (heroPath && auth && auth.homepageAssetPublicUrl)
        ? auth.homepageAssetPublicUrl(heroPath)
        : null,
      heroZoom: crop.zoom,
      heroX: crop.x,
      heroY: crop.y,
      featuredPath: (s && s.featured_path) || null,
      featuredDescription: (s && s.featured_description) || null,
      featured: resolveFeatured(s && s.featured_path, s && s.featured_description)
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

    var prev = await fetchSettings();
    var objectPath = 'hero/' + Date.now() + '.' + OK_TYPES[file.type];

    var up = await auth.uploadHomepageAsset(objectPath, file);
    if (up && up.error) return { error: up.error };

    // A replacement image needs its own framing — reset the crop to
    // centred / no zoom in the same write.
    var upd = await auth.updateHomepageSettings({
      hero_image_path: objectPath,
      hero_image_zoom: CROP_DEFAULTS.zoom,
      hero_image_x: CROP_DEFAULTS.x,
      hero_image_y: CROP_DEFAULTS.y
    });
    if (upd && upd.error) {
      // Roll back the orphaned upload; ignore failure (RLS/UX, not data).
      try { await auth.removeHomepageAsset(objectPath); } catch (e) {}
      return { error: upd.error };
    }

    if (prev && prev.hero_image_path && prev.hero_image_path !== objectPath) {
      try { await auth.removeHomepageAsset(prev.hero_image_path); } catch (e) {}
    }
    invalidate();
    return { data: { hero_image_path: objectPath } };
  }

  // Presentation-only crop state. Values are clamped here and again by the
  // column CHECK constraints server-side.
  async function setHeroCrop(crop) {
    var auth = await waitForDep(function () { return window.PergamonAuth; });
    if (!auth) return { error: { message: 'Not ready — try again in a moment.' } };
    var upd = await auth.updateHomepageSettings({
      hero_image_zoom: clamp(crop && crop.zoom, 1, 3, CROP_DEFAULTS.zoom),
      hero_image_x: clamp(crop && crop.x, 0, 100, CROP_DEFAULTS.x),
      hero_image_y: clamp(crop && crop.y, 0, 100, CROP_DEFAULTS.y)
    });
    if (upd && upd.error) return { error: upd.error };
    invalidate();
    return { data: normCrop({
      hero_image_zoom: crop && crop.zoom,
      hero_image_x: crop && crop.x,
      hero_image_y: crop && crop.y
    }) };
  }

  // ── CONTENT: featured artifact ───────────────────────────────────────────
  async function setFeaturedArtifact(pathRef) {
    var auth = await waitForDep(function () { return window.PergamonAuth; });
    if (!auth) return { error: { message: 'Not ready — try again in a moment.' } };
    var key = pathRef ? normPath(pathRef) : null;
    // Switching artifacts drops any homepage-specific description so the
    // new artifact starts from its own canonical copy (V1 behaviour).
    var upd = await auth.updateHomepageSettings({ featured_path: key, featured_description: null });
    if (upd && upd.error) return { error: upd.error };
    invalidate();
    return { data: { featured_path: key } };
  }

  // Homepage-only editorial copy for the Featured Today card. Empty / blank
  // input clears the override (NULL) → the card falls back to the
  // artifact's canonical description. Canonical metadata is never touched.
  async function setFeaturedDescription(text) {
    var auth = await waitForDep(function () { return window.PergamonAuth; });
    if (!auth) return { error: { message: 'Not ready — try again in a moment.' } };
    var value = (typeof text === 'string') ? text.trim() : '';
    var upd = await auth.updateHomepageSettings({ featured_description: value || null });
    if (upd && upd.error) return { error: upd.error };
    invalidate();
    return { data: { featured_description: value || null } };
  }

  // ── PUBLISH ──────────────────────────────────────────────────────────────
  async function setPublished(next) {
    var auth = await waitForDep(function () { return window.PergamonAuth; });
    if (!auth) return { error: { message: 'Not ready — try again in a moment.' } };
    var upd = await auth.updateHomepageSettings({ published: !!next });
    if (!(upd && upd.error)) invalidate();
    return upd || { error: { message: 'Unknown error' } };
  }
  function publish() { return setPublished(true); }
  function unpublish() { return setPublished(false); }

  window.PergamonHomepage = {
    ready: fetchSettings,
    invalidate: invalidate,
    isPublished: isPublished,
    getResolved: getResolved,
    resolveFeatured: resolveFeatured,
    cropDefaults: function () { return { zoom: CROP_DEFAULTS.zoom, x: CROP_DEFAULTS.x, y: CROP_DEFAULTS.y }; },
    setHeroImage: setHeroImage,
    setHeroCrop: setHeroCrop,
    setFeaturedArtifact: setFeaturedArtifact,
    setFeaturedDescription: setFeaturedDescription,
    publish: publish,
    unpublish: unpublish
  };
})();
