// Publishing a page's draft, or the Game Library's (CMS milestone M6). No DOM here: works in
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
//   A failure at any step publishes nothing: the live page and the saved
//   draft stay as they were, and the sequence can simply be run again
//   (prepared images are recognised and skipped).
(function (root) {
  'use strict';

  const FIELD_LABELS = { title: 'Title', description: 'Description', cta: 'Button label', href: 'Destination link', category: 'Category', subtitle: 'Subtitle', emblem: 'Emblem', count: 'Count', countLabel: 'Count label', game: 'Game', name: 'Name', destination: 'Destination', availability: 'Availability' };
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

  // The ordered list a component is (a list widget's cards, a card widget's
  // saved cards): its label, naming the widget if it isn't a built-in one.
  function listLabel(id, content, docs) {
    if (content.listLabel) return content.listLabel(id);
    const o = content.ownerOf(id, ...docs);
    if (!o || !(o.part === 'saved' || (o.part === '' && content.widgets.isList(o.type)))) return null;
    return content.widgets.get(o.type).order + (content.ownerOf(id) ? '' : ` (${content.instanceLabel(o.instance, o.type)})`);
  }
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
  // imgs: scripts/cms/images.js when available; records: the game records
  // cards refer to, by id (as they are now).
  // → { cards: [{ id, type, typeLabel, title, changes: [...] }], newImages: [media ids], other: [...],
  //     layout: [{ label, changes: [...] }] (widgets added, moved, resized, removed), empty }
  function summarize(published, draft, content, imgs, records) {
    const recordOf = id => (records && Object.prototype.hasOwnProperty.call(records, id) ? records[id] : null);
    const titleOf = c => (!c ? '' : c.title || c.name || (c.game && ((recordOf(c.game) || {}).name || c.game)) || '');
    // A card that held its own details and now refers to a game, or the other way
    // round: what that changes for visitors.
    function swapped(a, b, type) {
      const x = content.shownCard(a, type, records), y = content.shownCard(b, type, records), out = [content.isRef(b) ? 'Now uses the Game Library' : 'Now has its own details'];
      if (x.note === 'missing' || y.note === 'missing') return out;
      [['title', 'Title'], ['href', 'Destination link'], ['cta', 'Button label']].concat(type === 'tile' ? [['category', 'Category']] : []).forEach(([k, label]) => { if (String(x[k] || '') !== String(y[k] || '')) out.push(label); });
      out.push(...artChanges(x.art || undefined, y.art || undefined, imgs, type));
      if (['hidden', 'archived'].indexOf(y.note) >= 0) out.push(`Not shown to visitors (${y.note})`);
      return out;
    }
    const pub = (published && published.components) || {};
    const next = (draft && draft.components) || {};
    const ids = Object.keys(next).concat(Object.keys(pub).filter(k => !(k in next)));
    const cards = [], other = [], docs = [draft, published];
    ids.forEach(id => {
      if (same(pub[id], next[id])) return;
      const list = listLabel(id, content, docs);
      if (list) { if (reordered(pub[id], next[id])) other.push(list); return; }
      const type = content.cardType(id, ...docs);
      if (!type) { other.push(OTHER_LABELS[id] || id); return; }
      const saved = content.isSaved(id, ...docs);
      const owner = content.ownerOf(id, ...docs);
      const typeLabel = (saved ? 'Saved ' + content.cardLabel(id, ...docs).toLowerCase() : content.cardLabel(id, ...docs)) + (!owner || content.ownerOf(id) ? '' : `, ${content.instanceLabel(owner.instance, owner.type)}`);
      const a = pub[id], b = next[id];
      let changes;
      if (a === undefined) changes = [saved ? 'Added to saved cards' : 'Added'];
      else if (b === undefined) changes = [saved ? 'Deleted from saved cards' : 'Deleted'];
      else {
        // An active card replaced: by one of the saved cards, or by a new
        // card while the previous one was moved to the saved cards.
        const slot = !saved && content.slotOf(id, ...docs) === id;
        const savedHere = k => content.isSaved(k, ...docs) && content.slotOf(k, ...docs) === id;
        const from = slot ? Object.keys(pub).find(k => savedHere(k) && same(pub[k], b)) : null;
        const kept = slot && !from ? Object.keys(next).find(k => savedHere(k) && same(next[k], a)) : null;
        if (from) changes = ['Now shows a saved card (was “' + titleOf(a) + '”)'];
        else if (kept) changes = ['Now shows a new card (“' + titleOf(a) + '” was saved)'];
        else if (content.isRef && content.isRef(a) !== content.isRef(b)) changes = swapped(a, b, type);
        else {
          changes = Object.keys(FIELD_LABELS).filter(k => !same(a[k], b[k])).map(k => FIELD_LABELS[k]);
          // A record has two; each is named.
          const named = (list, what) => list.map(t => (type === 'game' ? `${what}: ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t));
          changes.push(...named(artChanges(a.art, b.art, imgs, type === 'game' ? 'tile' : type), 'Square artwork'));
          changes.push(...named(artChanges(a.wide, b.wide, imgs, 'feature'), 'Wide artwork'));
          if (!same(a.crop, b.crop) && same(a.game, b.game)) changes.push(!b.crop ? 'Framing (the game’s own again)' : 'Framing');
          ['style'].forEach(k => { if (!same(a[k], b[k])) changes.push('Style'); });
        }
      }
      cards.push({ id, type, typeLabel, title: String(titleOf(b) || titleOf(a) || id), changes });
    });
    const live = content.mediaIds(published || {});
    const newImages = content.mediaIds(draft || {}).filter(id => live.indexOf(id) < 0);
    const layout = draft ? content.layoutChanges(published, draft) : [];
    return { cards, newImages, other, layout, empty: !cards.length && !other.length && !layout.length };
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
