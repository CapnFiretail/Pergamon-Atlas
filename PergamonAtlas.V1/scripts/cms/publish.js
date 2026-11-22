// Publishing the homepage draft (CMS milestone M6). No DOM here: works in
// the browser (window.PergamonCMS.publish) and in Node (module.exports).
//
//   summarize(published, draft)   what the saved draft would change, per card
//   run({ api, ... })              the publish sequence:
//     1. images the draft uses that aren't public yet are prepared one by
//        one by the publish-media Edge Function (it checks the bytes and
//        copies them to the public bucket; unused uploads are never sent)
//     2. publish(page, draft id, expected live version): one transaction on
//        the server, refused (PT409) if the draft or the live version changed,
//        and refused if any image isn't prepared
//   A failure at any step publishes nothing: the live homepage and the saved
//   draft stay as they were, and the sequence can simply be run again
//   (prepared images are recognised and skipped).
(function (root) {
  'use strict';

  const FIELD_LABELS = { title: 'Title', description: 'Description', cta: 'Button label', href: 'Destination link', category: 'Category' };
  const CARD_TYPES = { feature: 'Featured card', spotlight: 'Spotlight card', tile: 'Carousel card' };
  const DESKTOP_ART = ['fit', 'focus', 'scale', 'anchor'];
  const PHONE_ART = ['focusNarrow', 'scaleNarrow', 'anchorNarrow'];

  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const same = (a, b) => canon(a) === canon(b);
  const sourceKey = a => (a && a.source ? (a.source.media ? 'media:' + a.source.media : 'static:' + a.source.static) : '');

  // What changed in one card's image. With images.js (imgs), framing is
  // compared as each layout shows it, so rewriting a shared value in full
  // (images.setFraming) isn't reported as a change.
  function artChanges(before, after, imgs, type) {
    if (same(before, after)) return [];
    if (!before) return ['Image added'];
    if (!after) return ['Image removed'];
    const out = [];
    if (sourceKey(before) !== sourceKey(after)) out.push('New image');
    else if (imgs) {
      if (!same(imgs.framing(before, 'desktop', type), imgs.framing(after, 'desktop', type))) out.push('Desktop framing');
      const pb = imgs.framing(before, 'phone', type), pa = imgs.framing(after, 'phone', type);
      delete pb.follows; delete pa.follows;
      if (!same(pb, pa)) out.push('Phone framing');
    } else {
      if (DESKTOP_ART.some(k => !same(before[k], after[k]))) out.push('Desktop framing');
      if (PHONE_ART.some(k => !same(before[k], after[k]))) out.push('Phone framing');
    }
    if (!same(before.alt, after.alt)) out.push('Image description');
    if (!same(before.base, after.base)) out.push('Edge colour');
    return out;
  }

  const LIST_LABELS = { 'home.carousel': 'Carousel order', 'home.featured.saved': 'Saved featured cards order', 'home.spotlight.saved': 'Saved spotlight cards order' };
  // Components that aren't cards: site-wide settings stored in this document.
  const OTHER_LABELS = { 'site.sidebar': 'Site Navigation (every page)' };
  // Whether the cards present in both lists are in a different order
  // (adding or deleting a card alone isn't a reorder).
  function reordered(before, after) {
    const a = (before && before.order) || [], b = (after && after.order) || [];
    const common = a.filter(k => b.indexOf(k) >= 0);
    return !same(common, b.filter(k => a.indexOf(k) >= 0));
  }

  // published / draft: documents (published may be null: nothing live yet);
  // imgs: scripts/cms/images.js when available.
  // → { cards: [{ id, type, typeLabel, title, changes: [...] }], newImages: [media ids], other: [...], empty }
  function summarize(published, draft, content, imgs) {
    const pub = (published && published.components) || {};
    const next = (draft && draft.components) || {};
    const ids = Object.keys(next).concat(Object.keys(pub).filter(k => !(k in next)));
    const cards = [], other = [];
    ids.forEach(id => {
      if (same(pub[id], next[id])) return;
      if (LIST_LABELS[id]) { if (reordered(pub[id], next[id])) other.push(LIST_LABELS[id]); return; }
      const type = content.cardType(id);
      if (!type) { other.push(OTHER_LABELS[id] || id); return; }
      const saved = content.isSaved && content.isSaved(id);
      const typeLabel = (saved ? 'Saved ' + (CARD_TYPES[type] || 'card').toLowerCase() : CARD_TYPES[type]) || 'Card';
      const a = pub[id], b = next[id];
      let changes;
      if (a === undefined) changes = [saved ? 'Added to saved cards' : 'Added'];
      else if (b === undefined) changes = [saved ? 'Deleted from saved cards' : 'Deleted'];
      else {
        // An active card replaced: by one of the saved cards, or by a new
        // card while the previous one was moved to the saved cards.
        const slot = !saved && content.slotOf && content.slotOf(id) === id;
        const from = slot ? Object.keys(pub).find(k => content.isSaved(k) && content.slotOf(k) === id && same(pub[k], b)) : null;
        const kept = slot && !from ? Object.keys(next).find(k => content.isSaved(k) && content.slotOf(k) === id && same(next[k], a)) : null;
        if (from) changes = ['Now shows a saved card (was “' + String(a.title || '') + '”)'];
        else if (kept) changes = ['Now shows a new card (“' + String(a.title || '') + '” was saved)'];
        else {
          changes = Object.keys(FIELD_LABELS).filter(k => !same(a[k], b[k])).map(k => FIELD_LABELS[k]);
          changes.push(...artChanges(a.art, b.art, imgs, type));
          ['style'].forEach(k => { if (!same(a[k], b[k])) changes.push('Style'); });
        }
      }
      cards.push({ id, type, typeLabel, title: String((b && b.title) || (a && a.title) || id), changes });
    });
    const live = content.mediaIds(published || {});
    const newImages = content.mediaIds(draft || {}).filter(id => live.indexOf(id) < 0);
    return { cards, newImages, other, empty: !cards.length && !other.length };
  }

  // The sequence. api (all → Promise):
  //   describe(ids)  → { data: { id: { public_path } }, error }        rpc get_media
  //   prepare(id)    → { ok } | { error: { status, code, message } }   publish-media
  //   publish(page, draftId, expectedPublishedId) → { data, error }    rpc publish
  // onStep({ step: 'images' | 'publish', done, total }) reports progress.
  // → { ok, version, previous } | { stale, message } | { error: { stage, code, message, mediaId, prepared, total } }
  async function run(opts) {
    const api = opts.api, step = opts.onStep || (() => {});
    const ids = opts.mediaIds || [];
    let pending = [];
    if (ids.length) {
      let res;
      try { res = await api.describe(ids); } catch (e) { res = { error: { message: String(e && e.message) } }; }
      if (res.error) return { error: { stage: 'images', code: res.error.code || '', message: res.error.message || 'Couldn’t check the images.', prepared: 0, total: ids.length } };
      const info = res.data || {};
      const unknown = ids.filter(id => !info[id]);
      if (unknown.length) return { error: { stage: 'images', code: 'missing', message: 'An image in the draft no longer exists.', mediaId: unknown[0], prepared: 0, total: ids.length } };
      pending = ids.filter(id => !info[id].public_path);
    }
    let done = 0;
    const total = pending.length;
    for (const id of pending) {
      step({ step: 'images', done, total });
      let r;
      try { r = await api.prepare(id); } catch (e) { r = { error: { message: String(e && e.message) } }; }
      if (!r || r.error) {
        const e = (r && r.error) || {};
        return { error: { stage: 'images', code: e.code || '', status: e.status, message: e.message || 'An image couldn’t be prepared.', mediaId: id, prepared: done, total } };
      }
      done++;
    }
    step({ step: 'publish', done, total });
    let res;
    try { res = await api.publish(opts.page, opts.draftId, opts.expectedPublishedId); } catch (e) { res = { error: { message: String(e && e.message) } }; }
    if (res.error) {
      const code = res.error.code || '';
      if (code === 'PT409') return { stale: true, message: String(res.error.message || '') };
      return { error: { stage: 'publish', code, message: String(res.error.message || 'Publishing failed.'), prepared: done, total } };
    }
    return { ok: true, version: res.data && res.data.version, previous: res.data && res.data.previous_version, publishedAt: res.data && res.data.published_at };
  }

  const api = { summarize, run, artChanges };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.publish = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
