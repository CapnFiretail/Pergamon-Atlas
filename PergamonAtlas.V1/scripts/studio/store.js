// Studio documents: one document's state while it is open. The saved document, the
// working copy with its undo history (the grid editor's generic history,
// scripts/grid/editor.js), and saving through a storage (storage.js). No DOM.
//
//   const store = create({ model, storage, browser, createHistory, seed })
//     model     the document's own rules: parse, same, freeze, empty (e.g.
//               connections/document.js)
//     browser   optional: the copy this browser saved before documents were shared
//   await store.load() → { state: 'saved' | 'example' | 'browser' | 'restored'
//                                | 'unreadable' | 'unavailable' }
//     example     nothing saved yet: the seed, stored only when saved
//     browser     nothing saved yet, and this browser has a copy of its own: that
//                 copy, stored only when saved
//     restored    unsaved changes this tab kept (a reload, or losing access)
//     unreadable  what is stored can't be used; nothing is overwritten until
//                 reset() starts again
//     unavailable storage didn't answer, so whether anything is saved isn't known:
//                 nothing to edit, nothing seeded; load() tries again
//   store.blocked() → null | { code: 'loading' | 'unreadable' | 'unavailable',
//                              why, errors, raw }   nothing can be changed or saved
//   store.document(), store.commit(doc), store.edit(key, doc) (typing: one step
//   per key until settle()), store.undo(), store.redo(), store.canUndo(), …
//   store.dirty(), store.discard() (one undoable step)
//   await store.save({ force }) → { ok } | { ok: false, code, message? }   see
//     storage.js; 'blocked'. force: on top of a newer saved copy. A copy never
//     saved before (first()) is not forced onto one somebody else saved
//   await store.reload() → load()'s states   use the stored copy, dropping the
//     working copy; 'unavailable' keeps everything as it is
//   store.keep()                    keep unsaved changes for this tab
//   store.kept()                    what is kept for it: { document } | null
//   store.forget()                  drop them
//   store.first()                   no saved copy behind this one
//   store.start()                   'example' | 'browser' while nothing is saved
//   store.earlier() → null | { document? , errors?, savedAt, raw, same, mark }
//     the browser's own copy; same: as what is saved
//   await store.removeEarlier() → 'removed' | 'unavailable' | 'changed'   after
//     checking that a saved document exists
//   store.onChange(fn), store.savedAt(), store.isExample(), store.newer(), store.destroy()
(function (root) {
  'use strict';
  function create(o) {
    const { storage, browser, model: D } = o;
    const fresh = doc => o.createHistory(doc, { same: D.same, freeze: D.freeze, limit: 100 });
    let saved = D.freeze(D.empty()), history = fresh(saved);
    let revision = null, savedAt = null, start = null, blocked = { code: 'loading', errors: [] }, newer = false, step = null;
    let earlier = null, saving = false;
    const listeners = [];
    const changed = () => listeners.forEach(fn => fn());

    function open(doc, r) {
      saved = D.freeze(doc);
      history = fresh(saved);
      revision = r ? r.revision : null;
      savedAt = r ? r.savedAt : null;
      start = null; blocked = null; newer = false; step = null;
    }
    function readEarlier() {
      const c = browser ? browser.read() : null;
      earlier = c && Object.assign(c.error ? { errors: ['This browser’s copy can’t be read.'] } : D.parse(c.document), { savedAt: c.savedAt || null, raw: c.raw });
    }
    function show(r) {
      readEarlier();
      if (r && r.error) {
        open(D.empty(), null);
        blocked = { code: 'unavailable', why: r.error, errors: [] };
        return { state: 'unavailable' };
      }
      if (!r) {
        const own = !!(earlier && earlier.document);
        open(own ? earlier.document : D.parse(o.seed()).document, null);
        start = own ? 'browser' : 'example';
        return { state: start };
      }
      const p = D.parse(r.document);
      if (p.errors) {
        open(D.empty(), null);
        blocked = { code: 'unreadable', errors: p.errors, raw: r.raw, revision: r.revision };
        return { state: 'unreadable' };
      }
      open(p.document, r);
      return { state: 'saved' };
    }
    async function load() {
      blocked = { code: 'loading', errors: [] };
      changed();
      const result = show(await storage.load());
      const w = storage.working.get();
      if (w && !blocked) {
        const p = D.parse(w.document);
        storage.working.clear();
        if (p.document && history.commit(p.document)) {
          newer = (w.revision === undefined ? null : w.revision) !== revision;
          if (newer) revision = w.revision;                   // a save must notice the newer copy
          changed();
          return { state: 'restored' };
        }
      }
      changed();
      return result;
    }

    const commit = doc => { if (blocked) return false; step = null; const ok = history.commit(doc); if (ok) changed(); return ok; };
    function edit(key, doc) {
      if (blocked) return false;
      const ok = step === key ? history.amend(doc) : history.commit(doc);
      if (ok) { step = key; changed(); }
      return ok;
    }
    const dirty = () => !D.same(history.present(), saved);

    function stored(doc, result) {
      if (start === 'browser' && browser) browser.mark('moved');
      saved = doc;
      revision = result.revision; savedAt = result.savedAt; start = null; newer = false;
      storage.working.clear();
      readEarlier();
    }
    async function save(s = {}) {
      if (blocked) return { ok: false, code: 'blocked' };
      step = null;
      const doc = history.present();
      let base = revision, result;
      saving = true;
      try {
        if (s.force && revision !== null) {
          const r = await storage.load();
          if (r && r.error) return { ok: false, code: r.error };
          base = r ? r.revision : null;
        }
        result = await storage.save(doc, base);
        if (result.code === 'conflict') {
          // Perhaps an earlier try of ours, whose answer never arrived.
          const r = await storage.load(), p = r && !r.error ? D.parse(r.document) : {};
          if (p.document && D.same(p.document, doc)) result = { ok: true, revision: r.revision, savedAt: r.savedAt };
        }
      } finally { saving = false; }
      if (result.ok) stored(doc, result);
      else if (result.code === 'conflict') newer = true;
      changed();
      return result;
    }
    const keep = () => { if (dirty() && !blocked) storage.working.set({ document: history.present(), revision }); };

    const off = storage.subscribe(async () => {
      // Perhaps someone else saved. Without changes of our own, show it.
      if (blocked || saving) return;
      const at = revision, r = await storage.load();
      if (!r || r.error || blocked || saving || revision !== at || r.revision === at) return;
      if (dirty() || start === 'browser') newer = true; else show(r);
      changed();
    });

    return {
      load, commit, edit, save, keep, dirty,
      document: () => history.present(),
      settle: () => { step = null; },
      undo() { step = null; const ok = !!history.undo(); if (ok) changed(); return ok; },
      redo() { step = null; const ok = !!history.redo(); if (ok) changed(); return ok; },
      canUndo: () => history.canUndo(),
      canRedo: () => history.canRedo(),
      discard() { storage.working.clear(); return commit(saved); },
      forget() { storage.working.clear(); },
      async reload() {
        const r = await storage.load();
        if (r && r.error) return { state: 'unavailable' };
        storage.working.clear();
        const result = show(r);
        changed();
        return result;
      },
      // Start again from the example; what was unreadable is replaced only by the next save.
      reset() {
        if (!blocked || blocked.code !== 'unreadable') return;
        const r = blocked.revision;
        open(D.parse(o.seed()).document, null);
        revision = r; start = 'example';
        changed();
      },
      blocked: () => blocked,
      newer: () => newer,
      savedAt: () => savedAt,
      isExample: () => start !== null,
      start: () => start,
      first: () => revision === null,
      kept: () => storage.working.get(),
      earlier: () => earlier && Object.assign({ same: !!earlier.document && !blocked && revision !== null && D.same(earlier.document, saved), mark: browser.mark() }, earlier),
      markEarlier(value) { if (browser) browser.mark(value); changed(); },
      async removeEarlier() {
        const c = earlier, r = await storage.load();
        if (!c) return 'changed';
        if (!r || r.error) return 'unavailable';
        const done = browser.remove(c.raw);
        readEarlier();
        changed();
        return done ? 'removed' : 'changed';
      },
      onChange: fn => { listeners.push(fn); },
      destroy() { off(); listeners.length = 0; }
    };
  }

  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PergamonStudio.store = api;
})(typeof window !== 'undefined' ? window : globalThis);
