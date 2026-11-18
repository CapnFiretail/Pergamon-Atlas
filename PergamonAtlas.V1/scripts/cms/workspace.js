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
      draft = d.draft && validate(d.draft.content) ? { id: d.draft.id, doc: d.draft.content, savedAt: d.draft.created_at } : null;
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

    // Edits. `value` is already cleaned by the caller (trimmed text).
    function setField(cardId, field, value) {
      const c = comp(working, cardId);
      if (!c || c[field] === value) return;
      c[field] = value;
      persist(); emit();
    }
    function discardCard(cardId) {
      if (!working || !base) return;
      const original = comp(base.doc, cardId);
      if (original === undefined) return;
      working.components[cardId] = clone(original);
      persist(); emit();
    }
    function discardAll() {
      if (!base) return;
      working = clone(base.doc);
      persist(); emit();
    }

    // Card ids whose working content differs from what it was started from.
    function unsavedCards() {
      if (!working || !base) return [];
      return Object.keys(working.components).filter(id => !same(comp(working, id), comp(base.doc, id)));
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
      draft = { id: id, doc: clone(doc), savedAt: new Date().toISOString() };
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
      const theirs = Object.keys(latest.doc.components || {}).filter(id => !same(comp(latest.doc, id), comp(base.doc, id)));
      return {
        latest: latest, latestDraft: latestDraft, latestPublished: latestPublished,
        mine: mine,
        overlap: mine.filter(id => theirs.indexOf(id) >= 0),   // cards both changed
        missing: mine.filter(id => comp(latest.doc, id) === undefined)
      };
    }

    // Re-apply this browser's card edits on top of the newer server state
    // (after the administrator confirmed), then save against it.
    async function combine(info) {
      const next = clone(info.latest.doc);
      info.mine.forEach(id => { if (comp(next, id) !== undefined) next.components[id] = clone(comp(working, id)); });
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

    function clearLocal() {
      if (storage) { try { storage.removeItem(key); } catch (e) {} }
      working = null; base = null; loaded = false;
    }

    return {
      load, setField, discardCard, discardAll, unsavedCards, cardStatus, save, combine, adopt, clearLocal,
      isLoaded: () => loaded,
      working: () => working,
      component: id => comp(working, id),
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
