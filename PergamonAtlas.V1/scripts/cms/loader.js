// Published homepage content from the CMS (Supabase).
//
// Loaded after supabase-config.js and scripts/cms/content.js and before
// scripts/home.js, so the request is already in flight while the page parses.
// Only the public get_published_content('home') is ever called: drafts and
// working copies never reach this code.
//
//   initial()            the last published version this browser received
//                        (re-validated), for home.js's first render; or null.
//   attach(home, root, v, fallback)
//                        apply the fresh published version once it arrives,
//                        unless it's the version already shown (v); if nothing
//                        is published, return to the fallback document.
//
// First visit (nothing cached): the card frames keep their sizes and only
// their contents stay invisible (class `cms-pending`) until the answer or the
// static fallback is ready, at most REVEAL_MS — no layout shift, no swap of
// visible content. Later visits draw the cached version immediately.
// Unavailable, slow or invalid answers leave the static document (or the
// cached one) in place.
(function () {
  'use strict';
  const cms = window.PergamonCMS || {};
  const content = cms.content;
  const URL_BASE = window.PERGAMON_SUPABASE_URL;
  const KEY = window.PERGAMON_SUPABASE_ANON_KEY;
  const ENV = window.PERGAMON_ENV || 'development';

  // Where published content is read. Production stays on the static
  // document until the CMS is approved there: set production to true then.
  const LIVE = { development: true, preview: true, production: false };

  const REVEAL_MS = 1200;      // longest the first visit waits before showing the static copy
  const TIMEOUT_MS = 8000;     // give up on the request after this
  const CACHE_KEY = 'pa-cms-home:' + (URL_BASE || '');
  const MEDIA_PATH = /^media\/[0-9a-f]{64}\.(png|jpg|webp)$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  const enabled = !!(content && content.validateDocument && URL_BASE && KEY && LIVE[ENV] === true);

  // Public image URLs for the media ids the document uses (validated paths only).
  function mediaMap(raw) {
    if (raw === undefined || raw === null) return {};
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    for (const id of Object.keys(raw)) {
      const m = raw[id];
      if (!UUID.test(id) || !m || typeof m.path !== 'string' || !MEDIA_PATH.test(m.path)) return null;
      out[id] = {
        url: URL_BASE + '/storage/v1/object/public/site-media/' + m.path,
        width: Number.isInteger(m.width) ? m.width : undefined,
        height: Number.isInteger(m.height) ? m.height : undefined
      };
    }
    return out;
  }

  // get_published_content payload -> { version, doc, media } | { none: true } | null (invalid).
  function normalize(p) {
    if (p === null) return { none: true };
    if (!p || typeof p !== 'object' || p.page !== 'home' || !Number.isInteger(p.version) || p.schema !== content.SCHEMA) return null;
    if (!content.validateDocument(p.content)) return null;
    const media = mediaMap(p.media);
    if (!media) return null;
    return { version: p.version, doc: p.content, media: media };
  }

  function readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!c || !Number.isInteger(c.version) || !content.validateDocument(c.doc)) return null;
      const media = mediaMap(c.mediaRaw);
      return media ? { version: c.version, doc: c.doc, media: media } : null;
    } catch (e) { return null; }
  }
  function writeCache(p) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: p.version, doc: p.content, mediaRaw: p.media || {} })); } catch (e) {}
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  // Start the request now (before home.js renders).
  let request = null;
  if (enabled) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    request = fetch(URL_BASE + '/rest/v1/rpc/get_published_content?p_page=home', {
      headers: { apikey: KEY, Accept: 'application/json' },
      cache: 'no-store', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(raw => {
        const result = normalize(raw);
        if (!result) throw new Error('the published content was not valid');
        if (!result.none) result.raw = raw;
        return result;
      })
      .finally(() => { if (timer) clearTimeout(timer); });
    // Never an unhandled rejection, even if nothing attaches.
    request.catch(() => {});
  }

  cms.loader = {
    enabled: enabled,
    initial: () => (enabled ? readCache() : null),
    attach(home, root, shownVersion, fallbackDoc) {
      if (!enabled || !request || !home) return;
      let shown = shownVersion || null;
      let revealTimer = null;
      if (!shown && root) {
        root.classList.add('cms-pending');
        revealTimer = setTimeout(() => root.classList.remove('cms-pending'), REVEAL_MS);
      }
      request
        .then(result => {
          if (result.none) {                                    // nothing published: back to the static copy
            clearCache();
            if (shown && fallbackDoc && home.render(fallbackDoc)) shown = null;
            return;
          }
          if (result.version !== shown && home.render(result.doc, { media: result.media })) {
            shown = result.version;
          }
          writeCache(result.raw);
        })
        .catch(err => {
          console.info('Pergamon CMS: showing the built-in homepage content (' + (err && err.name === 'AbortError' ? 'timed out' : (err && err.message) || 'unavailable') + ').');
        })
        .finally(() => {
          if (revealTimer) clearTimeout(revealTimer);
          if (root) root.classList.remove('cms-pending');
        });
    }
  };
  window.PergamonCMS = cms;
})();
