// The card editor's three states for one page (CMS milestone M4):
//
//   published   the live version (what visitors see)          from get_draft
//   draft       the saved draft, if any (private to admins)   from get_draft / save_draft
//   working     this browser's unsaved copy                   sessionStorage only
//
// `working` starts as the draft (or the published version when there is no
// draft) and is what Admin view draws; it never leaves the browser until Save
// Draft. Saving sends the whole document with the draft id it was based on;
// if another administrator saved in between, the server refuses (PT409) and
// nothing is overwritten: save() reports the conflict, the local edits stay,
// and combine() can re-apply them card by card onto the newer draft once the
// administrator confirms (cards both people changed are listed first).
//
// No DOM here: works in the browser (window.PergamonCMS.workspace) and in
// Node (module.exports) for tests. `api` wraps the RPCs; `storage` is
// sessionStorage-like.
(function (root) {
  'use strict';

  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // Key-order-independent comparison of JSON values.
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const same = (a, b) => canon(a) === canon(b);
  const comp = (doc, id) => (doc && doc.components ? doc.components[id] : undefined);

  // Ordered collections: the carousel and each slot's saved cards. A card's
  // list is its id without the last segment (home.carousel.snake →
  // home.carousel), its key the last segment; the list component holds
  // { order: [keys] }. A saved list with no cards is left out of the document.
  const LISTS = ['home.carousel', 'home.featured.saved', 'home.spotlight.saved'];
  const listOf = id => (typeof id === 'string' && id.lastIndexOf('.') > 0 ? id.slice(0, id.lastIndexOf('.')) : '');
  const keyOf = id => id.slice(id.lastIndexOf('.') + 1);
  const isList = id => LISTS.indexOf(id) >= 0;
  const orderIn = (doc, list) => { const c = comp(doc, list); return c && Array.isArray(c.order) ? c.order : []; };
  function setOrder(doc, list, order) {
    if (!order.length && list !== LISTS[0]) delete doc.components[list];
    else doc.components[list] = Object.assign({}, comp(doc, list), { order: order });
  }
  // Every list names exactly its cards: ids without a card are dropped,
  // cards missing from the list are appended (after a combine, say).
  function tidy(doc) {
    LISTS.forEach(list => {
      const members = Object.keys(doc.components).filter(k => listOf(k) === list).map(keyOf);
      if (!members.length && comp(doc, list) === undefined) return;
      const order = orderIn(doc, list).filter((k, i, all) => members.indexOf(k) >= 0 && all.indexOf(k) === i);
      members.forEach(k => { if (order.indexOf(k) < 0) order.push(k); });
      setOrder(doc, list, order);
    });
    return doc;
  }
  // Ids present in either document whose content differs.
  const changedIds = (a, b) => Object.keys(Object.assign({}, a.components, b.components)).filter(id => !same(comp(a, id), comp(b, id)));

  // Error code of a failed RPC (PostgREST passes our PTnnn codes through).
  function errorInfo(error) {
    if (!error) return null;
    return { code: error.code || '', message: String(error.message || 'Unknown error') };
  }

  function create(opts) {
    const page = opts.page;
    const api = opts.api;                 // { getDraft(page), saveDraft(page, doc, expectedId) } → { data, error }
    const storage = opts.storage || null;
    const key = 'pa-cms-working:' + (opts.scope || '') + ':' + page;
    const validate = opts.validate || (() => true);
    const listeners = [];

    let published = null;                 // { id, doc } | null
    let draft = null;                     // { id, doc, savedAt } | null
    let base = null;                      // { draftId, doc }: what `working` was started from
    let working = null;                   // document
    let loaded = false;

    const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });
    function persist() {
      if (!storage) return;
      try {
        if (working && base && !same(working, base.doc)) storage.setItem(key, JSON.stringify({ base: base, working: working }));
        else storage.removeItem(key);
      } catch (e) {}
    }
    function restore() {
      if (!storage) return null;
      try {
        const s = JSON.parse(storage.getItem(key) || 'null');
        if (s && s.base && validate(s.base.doc) && validate(s.working) && (s.base.draftId === null || Number.isInteger(s.base.draftId))) return s;
      } catch (e) {}
      return null;
    }

    // Load published + draft from the server; keep (or restore) local edits.
    async function load() {
      const res = await api.getDraft(page);
      if (res.error) return { error: errorInfo(res.error) };
      const d = res.data || {};
      published = d.published && validate(d.published.content) ? { id: d.published.id, doc: d.published.content } : null;
      draft = d.draft && validate(d.draft.content) ? { id: d.draft.id, doc: d.draft.content, savedAt: d.draft.created_at, basedOn: d.draft.based_on_published_id } : null;
      const start = draft ? { draftId: draft.id, doc: draft.doc } : { draftId: null, doc: published ? published.doc : clone(opts.fallbackDoc) };
      if (!working) {
        const saved = restore();
        if (saved) { base = saved.base; working = saved.working; }
        else { base = { draftId: start.draftId, doc: clone(start.doc) }; working = clone(start.doc); }
      } else if (same(working, base.doc)) {
        // No local edits: follow the server.
        base = { draftId: start.draftId, doc: clone(start.doc) }; working = clone(start.doc);
      }
      loaded = true;
      persist();
      emit();
      return { ok: true };
    }

    // Edits. `value` is already cleaned by the caller (trimmed text, or an
    // object such as art); undefined removes the field.
    function setField(cardId, field, value) {
      const c = comp(working, cardId);
      if (!c || same(c[field], value) && (value !== undefined || !(field in c))) return;
      if (value === undefined) delete c[field];
      else c[field] = clone(value);
      persist(); emit();
    }
    // A whole component at once (site-wide settings such as site.sidebar,
    // which belong to no list); undefined removes it.
    function setComponent(id, value) {
      if (!working || same(comp(working, id), value)) return;
      if (value === undefined) delete working.components[id];
      else working.components[id] = clone(value);
      persist(); emit();
    }
    // Back to the saved state: an edited card gets its content back, a card
    // added here is removed, a deleted card returns to its place, a list
    // gets its saved order back (keeping cards added or deleted since).
    function discardCard(cardId) {
      if (!working || !base) return;
      const original = comp(base.doc, cardId);
      const list = listOf(cardId);
      if (isList(cardId)) {
        if (original === undefined) delete working.components[cardId];
        else working.components[cardId] = clone(original);
        tidy(working);
      } else if (original === undefined) {
        if (comp(working, cardId) === undefined) return;
        delete working.components[cardId];
        if (isList(list)) tidy(working);
      } else {
        working.components[cardId] = clone(original);
        if (isList(list) && orderIn(working, list).indexOf(keyOf(cardId)) < 0) {
          const order = orderIn(working, list).slice();
          const at = orderIn(base.doc, list).indexOf(keyOf(cardId));
          order.splice(at < 0 ? order.length : Math.min(at, order.length), 0, keyOf(cardId));
          setOrder(working, list, order);
        }
      }
      persist(); emit();
    }

    // ── Collections: add, remove, move, make active ───────────────────────
    // Add a card to a list (at `index`, default the end) → its id, or null
    // when the key is taken. Limits are the caller's (content.LIMITS); the
    // server enforces them too.
    function addCard(list, key, component, index) {
      if (!working || !isList(list)) return null;
      const id = list + '.' + key;
      if (comp(working, id) !== undefined) return null;
      working.components[id] = clone(component);
      const order = orderIn(working, list).slice();
      order.splice(index === undefined ? order.length : Math.max(0, Math.min(index, order.length)), 0, key);
      setOrder(working, list, order);
      persist(); emit();
      return id;
    }
    // Remove a card from its list (an active card can't be removed).
    function removeCard(cardId) {
      const list = listOf(cardId);
      if (!working || !isList(list) || comp(working, cardId) === undefined) return false;
      delete working.components[cardId];
      setOrder(working, list, orderIn(working, list).filter(k => k !== keyOf(cardId)));
      persist(); emit();
      return true;
    }
    // Move a card to position `index` in its list.
    function moveCard(cardId, index) {
      const list = listOf(cardId);
      if (!working || !isList(list)) return false;
      const order = orderIn(working, list).slice();
      const from = order.indexOf(keyOf(cardId));
      const to = Math.max(0, Math.min(index, order.length - 1));
      if (from < 0 || from === to) return false;
      order.splice(to, 0, order.splice(from, 1)[0]);
      setOrder(working, list, order);
      persist(); emit();
      return true;
    }
    // A saved card becomes its slot's active card; the active card takes its
    // place in the saved list under `outgoingKey`. Nothing is lost.
    function activate(savedCardId, outgoingKey) {
      const list = listOf(savedCardId);
      const slot = list.replace(/\.saved$/, '');
      if (!working || list === slot || !isList(list)) return false;
      const chosen = comp(working, savedCardId), live = comp(working, slot);
      if (chosen === undefined || live === undefined) return false;
      const order = orderIn(working, list).slice();
      const at = order.indexOf(keyOf(savedCardId));
      if (order.indexOf(outgoingKey) >= 0 && outgoingKey !== keyOf(savedCardId)) return false;
      delete working.components[savedCardId];
      working.components[slot] = chosen;
      working.components[list + '.' + outgoingKey] = live;
      order[at] = outgoingKey;
      setOrder(working, list, order);
      persist(); emit();
      return true;
    }
    function discardAll() {
      if (!base) return;
      working = clone(base.doc);
      persist(); emit();
    }

    // Component ids whose working content differs from what it was started
    // from: edited, added and deleted cards, and reordered lists.
    function unsavedCards() {
      if (!working || !base) return [];
      return changedIds(working, base.doc);
    }
    // 'unsaved' (local edits) · 'draft' (saved draft differs from live) · 'published'.
    function cardStatus(cardId) {
      if (!working || !base) return 'published';
      if (!same(comp(working, cardId), comp(base.doc, cardId))) return 'unsaved';
      if (base.draftId !== null && !same(comp(base.doc, cardId), comp(published && published.doc, cardId))) return 'draft';
      return 'published';
    }

    // Save the whole working copy as the new draft.
    // → { ok } | { conflict } | { error: { code, message } }
    async function save() {
      if (!working || !base) return { error: { code: 'not-loaded', message: 'The editor hasn’t loaded yet.' } };
      if (!validate(working)) return { error: { code: 'invalid', message: 'Some fields need attention before saving.' } };
      const doc = clone(working);
      const res = await api.saveDraft(page, doc, base.draftId);
      if (res.error) {
        const err = errorInfo(res.error);
        if (err.code === 'PT409') return { conflict: await conflict() };
        return { error: err };
      }
      const id = res.data && res.data.draft_id;
      draft = { id: id, doc: clone(doc), savedAt: new Date().toISOString(), basedOn: draft ? draft.basedOn : (published ? published.id : null) };
      base = { draftId: id, doc: clone(doc) };   // edits typed while saving stay unsaved
      persist(); emit();
      return { ok: true, draftId: id };
    }

    // What changed on the server, relative to this browser's edits.
    async function conflict() {
      const res = await api.getDraft(page);
      if (res.error) return { error: errorInfo(res.error) };
      const d = res.data || {};
      const latestPublished = d.published && validate(d.published.content) ? { id: d.published.id, doc: d.published.content } : null;
      const latestDraft = d.draft && validate(d.draft.content) ? { id: d.draft.id, doc: d.draft.content, savedAt: d.draft.created_at } : null;
      const latest = latestDraft ? { draftId: latestDraft.id, doc: latestDraft.doc } : { draftId: null, doc: latestPublished ? latestPublished.doc : clone(opts.fallbackDoc) };
      const mine = unsavedCards();
      const theirs = changedIds(latest.doc, base.doc);
      return {
        latest: latest, latestDraft: latestDraft, latestPublished: latestPublished,
        mine: mine,
        overlap: mine.filter(id => theirs.indexOf(id) >= 0),   // cards both changed
        missing: mine.filter(id => comp(latest.doc, id) === undefined)
      };
    }

    // Re-apply this browser's changes on top of the newer server state
    // (after the administrator confirmed), then save against it. Each
    // changed component takes this browser's version (added, edited or
    // deleted); lists are then tidied, so their cards added there stay and
    // cards deleted there don't come back unless edited here.
    async function combine(info) {
      const next = clone(info.latest.doc);
      info.mine.forEach(id => {
        const mineNow = comp(working, id);
        if (mineNow === undefined) delete next.components[id];
        else next.components[id] = clone(mineNow);
      });
      tidy(next);
      published = info.latestPublished; draft = info.latestDraft;
      base = { draftId: info.latest.draftId, doc: clone(info.latest.doc) };
      working = next;
      persist(); emit();
      return save();
    }
    // Drop this browser's edits and take the newer server state.
    function adopt(info) {
      published = info.latestPublished; draft = info.latestDraft;
      base = { draftId: info.latest.draftId, doc: clone(info.latest.doc) };
      working = clone(info.latest.doc);
      persist(); emit();
    }

    // The saved draft went live as `version` (publish.js): it is now the
    // published version and there is no draft. Unsaved edits made on top of
    // it stay unsaved (they were not part of the publish).
    function markPublished(version) {
      if (!draft) return;
      published = { id: version, doc: clone(draft.doc) };
      if (base && base.draftId === draft.id) base = { draftId: null, doc: clone(draft.doc) };
      draft = null;
      persist(); emit();
    }

    function clearLocal() {
      if (storage) { try { storage.removeItem(key); } catch (e) {} }
      working = null; base = null; loaded = false;
    }

    return {
      load, setField, setComponent, discardCard, discardAll, unsavedCards, cardStatus, save, combine, adopt, markPublished, clearLocal,
      addCard, removeCard, moveCard, activate,
      order: list => orderIn(working, list).slice(),
      isLoaded: () => loaded,
      working: () => working,
      component: id => comp(working, id),
      // The card as last saved (the draft, or the published version without one).
      savedComponent: id => clone(comp(base && base.doc, id)),
      published: () => published,
      draft: () => draft,
      basedOnDraft: () => (base ? base.draftId : null),
      onChange: fn => listeners.push(fn)
    };
  }

  const api = { create: create, canon: canon, same: same };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.workspace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
