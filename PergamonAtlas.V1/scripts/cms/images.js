// Card images for the editor (CMS milestone M5): file checks, framing, and
// the administrator's image store. No DOM here: works in the browser
// (window.PergamonCMS.images) and in Node (module.exports) for tests.
//
// Framing is stored in the card's art (schema v1, see docs/cms/ARCHITECTURE.md),
// never in the file, so originals are untouched. Two layouts, as the homepage
// CSS draws them (scripts/home.js, styles/home.css):
//   desktop   focus + scale                 (cover: the image fills the card)
//             anchor + scale                (fit 'height': the spotlight)
//   phone     focusNarrow + scaleNarrow / anchorNarrow + scaleNarrow, used
//             when the card's area is 640px wide or less. With none of them
//             set, the phone layout follows the desktop framing.
//
// Images: an upload is reserved with create_media_upload (0009), sent to the
// private site-media-drafts bucket at the one path the server issued, and
// shown to the administrator through short-lived signed URLs. Nothing is
// public until publishing copies it (publish-media, a later milestone).
(function (root) {
  'use strict';

  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
  const MAX_BYTES = 5 * 1024 * 1024;           // the bucket's and create_media_upload's limit
  const MAX_SIDE = 10000;                      // site_media width/height limit
  const LARGE_BYTES = 2 * 1024 * 1024;         // above this, a gentle warning
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const DRAFT_PATH = /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
  const PUBLIC_PATH = /^media\/[0-9a-f]{64}\.(png|jpg|webp)$/;

  const isNum = n => typeof n === 'number' && isFinite(n);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const mb = n => (n / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB';

  // ── Files ──────────────────────────────────────────────────────────────
  // The real type from the first bytes (the browser's file.type is a guess
  // from the name). The server checks the bytes again before publishing.
  function sniff(b) {
    const at = (i, v) => b.length >= i + v.length && v.every((x, j) => b[i + j] === x);
    if (at(0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png';
    if (at(0, [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
    if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
    if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
    return null;
  }

  // file: { name, type, size }; head: its first bytes. → { mime } | { error }
  function checkFile(file, head) {
    if (!file || !file.size) return { error: 'That file is empty.' };
    const kind = sniff(head || []);
    if (ACCEPT.indexOf(kind) < 0) {
      if (kind === 'image/gif') return { error: 'GIF images aren’t accepted. Use a PNG, JPEG or WebP image.' };
      if (/svg/i.test(file.type || '') || /\.svg$/i.test(file.name || '')) return { error: 'SVG images aren’t accepted. Use a PNG, JPEG or WebP image.' };
      return { error: 'This file isn’t a PNG, JPEG or WebP image.' };
    }
    if (file.size > MAX_BYTES) return { error: `This image is ${mb(file.size)}; the limit is 5 MB.` };
    return { mime: kind };
  }

  // After decoding. → { error } | { warnings: [] }
  function checkPixels(width, height, bytes, recommendedWidth) {
    if (!(width > 0 && height > 0)) return { error: 'This image couldn’t be read. It may be damaged.' };
    if (width > MAX_SIDE || height > MAX_SIDE) return { error: `This image is ${width} × ${height} pixels; the limit is 10,000 on each side.` };
    const warnings = [];
    if (recommendedWidth && width < recommendedWidth) warnings.push(`At ${width} pixels wide it may look soft on large screens (${recommendedWidth} or more is best).`);
    if (bytes > LARGE_BYTES) warnings.push(`At ${mb(bytes)} it may slow the homepage down; a compressed WebP loads faster.`);
    return { warnings };
  }

  // ── Framing ────────────────────────────────────────────────────────────
  const fitOf = art => (art && art.fit === 'height' ? 'height' : 'cover');
  // Where cover art sits when the card sets no focus (styles/home.css).
  const COVER_DEFAULT = { feature: { x: 75, y: 25 }, spotlight: { x: 75, y: 25 }, tile: { x: 50, y: 50 } };
  const ZOOM = { cover: { min: 1, max: 3 }, height: { min: 0.5, max: 3 } };
  const NARROW = { cover: ['focusNarrow', 'scaleNarrow'], height: ['anchorNarrow', 'scaleNarrow'] };
  const point = p => (p && isNum(p.x) && isNum(p.y) ? { x: p.x, y: p.y } : null);

  // True when the phone layout uses the desktop framing.
  function follows(art) {
    return !art || NARROW[fitOf(art)].every(k => art[k] === undefined);
  }

  // The framing a layout shows: { fit, x, y, offset, zoom, follows }.
  // x / y are percentages; offset (px) is for 'height' art only.
  function framing(art, layout, cardType) {
    const fit = fitOf(art);
    const a = art || {};
    const phone = layout === 'phone';
    const zoom = phone ? (isNum(a.scaleNarrow) ? a.scaleNarrow : isNum(a.scale) ? a.scale : 1) : (isNum(a.scale) ? a.scale : 1);
    if (fit === 'cover') {
      const desk = point(a.focus) || COVER_DEFAULT[cardType] || { x: 50, y: 50 };
      const p = phone ? (point(a.focusNarrow) || desk) : desk;
      return { fit, x: p.x, y: p.y, offset: 0, zoom, follows: phone && follows(a) };
    }
    const an = a.anchor && isNum(a.anchor.x) ? a.anchor : null;
    const desk = { x: an ? an.x : 50, offset: an && isNum(an.offset) ? an.offset : 0, y: an && isNum(an.y) ? an.y : 50 };
    if (!phone) return { fit, x: desk.x, y: desk.y, offset: desk.offset, zoom, follows: false };
    const nn = a.anchorNarrow && isNum(a.anchorNarrow.x) ? a.anchorNarrow : null;
    return {
      fit,
      x: nn ? nn.x : desk.x,
      offset: nn ? (isNum(nn.offset) ? nn.offset : 0) : desk.offset,
      y: nn && isNum(nn.y) ? nn.y : desk.y,
      zoom,
      follows: follows(a)
    };
  }

  function writeLayout(art, layout, f) {
    const fit = fitOf(art);
    const z = r2(clamp(f.zoom, ZOOM[fit].min, ZOOM[fit].max));
    const pos = { x: r1(clamp(f.x, 0, 100)), y: r1(clamp(f.y, 0, 100)) };
    if (fit === 'height') {
      const anchor = { x: pos.x };
      const off = Math.round(clamp(f.offset || 0, -600, 600));
      if (off) anchor.offset = off;
      anchor.y = pos.y;
      if (layout === 'phone') { art.anchorNarrow = anchor; art.scaleNarrow = z; }
      else { art.anchor = anchor; if (z === 1) delete art.scale; else art.scale = z; }
    } else if (layout === 'phone') {
      art.focusNarrow = pos; art.scaleNarrow = z;
    } else {
      art.focus = pos; if (z === 1) delete art.scale; else art.scale = z;
    }
  }

  // A copy of art with one layout's framing set. The other layout keeps what
  // it shows: a phone framing of its own is written out in full first, so a
  // desktop change can't reach it through a shared value.
  function setFraming(art, layout, f, cardType) {
    const next = clone(art) || {};
    if (layout === 'desktop' && !follows(next)) writeLayout(next, 'phone', framing(next, 'phone', cardType));
    writeLayout(next, layout, f);
    return next;
  }

  // Back to a centred image at its smallest cover / natural height.
  function resetFraming(art, layout, cardType) {
    return setFraming(art, layout, { x: 50, y: 50, offset: 0, zoom: 1 }, cardType);
  }

  // The phone layout follows the desktop framing again.
  function matchDesktop(art) {
    const next = clone(art) || {};
    NARROW[fitOf(next)].forEach(k => delete next[k]);
    return next;
  }

  // A new image in the slot: the drawing (fit, edge colour) stays, the
  // framing starts centred (it belonged to the old picture), the description
  // is cleared (it described the old picture).
  function replaceSource(art, mediaId, defaultFit) {
    const fit = art ? fitOf(art) : (defaultFit === 'height' ? 'height' : 'cover');
    const next = { source: { media: mediaId }, alt: '' };
    if (fit === 'height') {
      next.fit = 'height';
      if (art && typeof art.base === 'string') next.base = art.base;
      next.anchor = { x: 50, y: 50 };
    } else {
      next.focus = { x: 50, y: 50 };
    }
    return next;
  }

  // Where the image is drawn in its box (px, from the box's top left), the
  // way styles/home.css draws it. box: { width, height }; natural: the image's size.
  function imageRect(f, box, natural) {
    const W = box.width, H = box.height, w = natural.width, h = natural.height;
    if (f.fit === 'height') {
      const ih = f.zoom * H, iw = w / h * ih;
      return { left: f.x / 100 * W + (f.offset || 0) - iw / 2, top: H / 2 - f.y / 100 * ih, width: iw, height: ih };
    }
    // object-fit: cover at the focus, then scaled by zoom around the focus.
    const k = Math.max(W / w, H / h), sw = w * k * f.zoom, sh = h * k * f.zoom;
    return { left: f.x / 100 * (W - sw), top: f.y / 100 * (H - sh), width: sw, height: sh };
  }

  // The framing after moving the image by (dx, dy) box pixels from f, so
  // the picture follows the pointer. Cover art can only move along an axis
  // where it is larger than the card.
  function moved(f, dx, dy, box, natural) {
    const r = imageRect(f, box, natural);
    const out = Object.assign({}, f);
    if (f.fit === 'height') {
      out.x = clamp(f.x + dx / box.width * 100, 0, 100);
      out.y = clamp(f.y - dy / r.height * 100, 0, 100);
    } else {
      const ox = r.width - box.width, oy = r.height - box.height;
      if (ox > 0.5) out.x = clamp(f.x - dx / ox * 100, 0, 100);
      if (oy > 0.5) out.y = clamp(f.y - dy / oy * 100, 0, 100);
    }
    return out;
  }

  // ── The administrator's image store ────────────────────────────────────
  // opts.api (all → { data, error }, as supabase-js answers):
  //   reserve(mime, bytes)   rpc create_media_upload
  //   upload(path, file, mime)  Storage upload to site-media-drafts
  //   describe(ids)          rpc get_media (admin only)
  //   sign(paths, seconds)   signed URLs for site-media-drafts (admin only)
  // opts.base: the Supabase URL (public and signed URLs must start with it).
  // opts.decode(file) → Promise<{ width, height }>; opts.head(file) → Promise<bytes>.
  const SIGN_SECONDS = 3600;
  const RENEW_MS = 10 * 60 * 1000;             // re-sign when less than this is left
  const RETRY_MS = 30 * 1000;                  // wait this long after a failed lookup

  function errorCode(e) { return e && (e.code || (e.statusCode ? String(e.statusCode) : '')) || ''; }

  function createStore(opts) {
    const api = opts.api;
    const base = String(opts.base || '').replace(/\/+$/, '');
    const now = opts.now || (() => Date.now());
    const entries = {};                        // media id → { url, width, height, expires } | { missing: true }
    const listeners = [];
    const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });
    const publicUrl = path => base + '/storage/v1/object/public/site-media/' + path;
    const signedPrefix = base + '/storage/v1/object/sign/site-media-drafts/';

    const failed = {};                         // media id → time of a failed lookup (retried after RETRY_MS)
    function stale(id) {
      if (failed[id] !== undefined && now() - failed[id] < RETRY_MS) return false;
      const e = entries[id];
      return !e || (!e.missing && e.expires && e.expires - now() < RENEW_MS);
    }

    async function sign(paths) {
      const res = await api.sign(paths, SIGN_SECONDS);
      if (res.error || !Array.isArray(res.data)) return null;
      const out = {};
      res.data.forEach(s => {
        if (s && !s.error && typeof s.signedUrl === 'string' && s.signedUrl.indexOf(signedPrefix) === 0) out[s.path] = s.signedUrl;
      });
      return out;
    }

    // Look up images the working copy uses (and re-sign ones about to expire).
    async function resolve(ids) {
      const need = (ids || []).filter(id => UUID.test(id) && stale(id));
      if (!need.length) return { ok: true };
      need.forEach(id => { failed[id] = now(); });     // until this lookup succeeds
      let res;
      try { res = await api.describe(need); } catch (e) { res = { error: {} }; }
      if (res.error) return { error: { code: errorCode(res.error), message: String(res.error.message || '') } };
      const info = res.data || {};
      const drafts = {};
      need.forEach(id => {
        const m = info[id];
        const size = m ? { width: Number.isInteger(m.width) ? m.width : undefined, height: Number.isInteger(m.height) ? m.height : undefined } : null;
        if (m && typeof m.public_path === 'string' && PUBLIC_PATH.test(m.public_path)) {
          entries[id] = Object.assign({ url: publicUrl(m.public_path), expires: 0 }, size);
        } else if (m && typeof m.draft_path === 'string' && DRAFT_PATH.test(m.draft_path)) {
          drafts[m.draft_path] = { id, size };
          return;                                       // still pending: signed below
        } else {
          entries[id] = { missing: true };              // unknown id, or an unexpected path
        }
        delete failed[id];
      });
      const paths = Object.keys(drafts);
      if (paths.length) {
        const urls = await sign(paths).catch(() => null);
        if (!urls) { emit(); return { error: { code: 'sign', message: 'Couldn’t load private image previews.' } }; }
        paths.forEach(p => {
          const d = drafts[p];
          delete failed[d.id];
          const keep = entries[d.id] && !entries[d.id].missing ? entries[d.id] : {};
          entries[d.id] = urls[p]
            ? Object.assign({ url: urls[p], expires: now() + SIGN_SECONDS * 1000, width: d.size.width || keep.width, height: d.size.height || keep.height })
            : { missing: true };
        });
      }
      emit();
      return { ok: true };
    }

    // Upload a file as a new private draft image.
    // → { mediaId, width, height, warnings } | { error: message }
    async function upload(file, recommendedWidth) {
      let head;
      try { head = await opts.head(file); } catch (e) { return { error: 'That file couldn’t be read.' }; }
      const checked = checkFile(file, head);
      if (checked.error) return { error: checked.error };
      let size;
      try { size = await opts.decode(file); } catch (e) { size = null; }
      const pixels = checkPixels(size && size.width, size && size.height, file.size, recommendedWidth);
      if (pixels.error) return { error: pixels.error };

      let res;
      try { res = await api.reserve(checked.mime, file.size); } catch (e) { res = { error: {} }; }
      if (res.error) {
        const code = errorCode(res.error);
        if (code === 'PT403') return { error: 'Your account can no longer upload images.', code };
        if (code === 'PT429') return { error: 'The upload limit for today has been reached. Try again tomorrow.', code };
        if (code === 'PT422') return { error: `The server didn’t accept this image: ${res.error.message}`, code };
        return { error: 'Couldn’t reach the server. Nothing was uploaded; try again.', code: 'network' };
      }
      const slot = res.data || {};
      if (!UUID.test(slot.media_id || '') || !DRAFT_PATH.test(slot.path || '') || slot.bucket !== 'site-media-drafts') {
        return { error: 'The server gave an unexpected answer. Nothing was uploaded.' };
      }
      let up;
      try { up = await api.upload(slot.path, file, checked.mime); } catch (e) { up = { error: {} }; }
      if (up.error) return { error: 'The upload didn’t finish. Nothing was changed; try again.', code: 'upload' };
      const urls = await sign([slot.path]).catch(() => null);
      if (!urls || !urls[slot.path]) return { error: 'The image was uploaded, but its preview couldn’t be loaded. Try again.', code: 'sign' };
      entries[slot.media_id] = { url: urls[slot.path], expires: now() + SIGN_SECONDS * 1000, width: size.width, height: size.height };
      emit();
      return { mediaId: slot.media_id, width: size.width, height: size.height, warnings: pixels.warnings };
    }

    // { id: { url, width, height } } for the homepage renderer.
    function map() {
      const out = {};
      Object.keys(entries).forEach(id => { const e = entries[id]; if (e.url) out[id] = { url: e.url, width: e.width, height: e.height }; });
      return out;
    }

    return {
      resolve, upload, map,
      get: id => entries[id] || null,
      // Earliest signed-URL expiry (ms), for scheduling a renewal; 0 if none.
      nextExpiry: () => Object.keys(entries).reduce((m, id) => { const x = entries[id].expires; return x && (!m || x < m) ? x : m; }, 0),
      onChange: fn => listeners.push(fn)
    };
  }

  const api = {
    ACCEPT, MAX_BYTES, MAX_SIDE, ZOOM,
    sniff, checkFile, checkPixels,
    fitOf, follows, framing, setFraming, resetFraming, matchDesktop, replaceSource, imageRect, moved,
    createStore
  };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.images = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
