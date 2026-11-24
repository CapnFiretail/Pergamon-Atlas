// Connections: the document's state while it is open. The saved document, the
// working copy with its undo history (the grid editor's generic history,
// scripts/grid/editor.js), and saving through a storage (storage.js). No DOM.
//
//   const store = create({ storage, createHistory, seed })
//   await store.load() → { state: 'saved' | 'example' | 'restored' | 'unreadable', errors?, raw? }
//     example     nothing saved yet: the seed, stored only when saved
//     restored    unsaved changes this tab kept (a reload, or losing access)
//     unreadable  what is stored can't be used; nothing is overwritten until
//                 reset() starts again
//   store.document(), store.commit(doc), store.edit(key, doc) (typing: one step
//   per key until settle()), store.undo(), store.redo(), store.canUndo(), …
//   store.dirty(), store.discard() (one undoable step)
//   await store.save({ force }) → { ok } | { ok: false, code }   see storage.js;
//     'blocked' while unreadable. force: on top of a newer saved copy
//   await store.reload()            use the stored copy, dropping the working copy
//   store.keep()                    keep unsaved changes for this tab
//   store.forget()                  drop them
//   store.onChange(fn), store.savedAt(), store.isExample(), store.newer(), store.destroy()
(function (root) {
  'use strict';
  const inNode = typeof module === 'object' && module.exports;
  const D = inNode ? require('./document.js') : root.PergamonStudio.connections.document;

  function create(o) {
    const { storage } = o;
    const fresh = doc => o.createHistory(doc, { same: D.same, freeze: D.freeze, limit: 100 });
    let saved = D.freeze(D.empty()), history = fresh(saved);
    let revision = null, savedAt = null, example = false, blocked = null, newer = false, step = null;
    const listeners = [];
    const changed = () => listeners.forEach(fn => fn());

    function open(doc, r) {
      saved = D.freeze(doc);
      history = fresh(saved);
      revision = r ? r.revision : null;
      savedAt = r ? r.savedAt : null;
      example = !r;
      blocked = null; newer = false; step = null;
    }
    async function readStored() {
      const r = await storage.load();
      if (!r) { open(D.parse(o.seed()).document, null); return { state: 'example' }; }
      const p = r.error ? { errors: [r.error === 'unavailable' ? 'This browser doesn’t allow the Studio to store anything.' : 'What is stored can’t be read.'] } : D.parse(r.document);
      if (p.errors) {
        open(D.empty(), null);
        example = false;
        blocked = { errors: p.errors, raw: r.raw, revision: r.error ? null : r.revision };
        return { state: 'unreadable', errors: p.errors, raw: r.raw };
      }
      open(p.document, r);
      return { state: 'saved' };
    }
    async function load() {
      const result = await readStored();
      const w = storage.working.get();
      if (w && result.state !== 'unreadable') {
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

    const commit = doc => { step = null; const ok = history.commit(doc); if (ok) changed(); return ok; };
    function edit(key, doc) {
      const ok = step === key ? history.amend(doc) : history.commit(doc);
      if (ok) { step = key; changed(); }
      return ok;
    }
    const dirty = () => !D.same(history.present(), saved);

    async function save(s = {}) {
      if (blocked) return { ok: false, code: 'blocked' };
      step = null;
      const doc = history.present();
      let base = revision;
      if (s.force) { const r = await storage.load(); base = r && !r.error ? r.revision : null; }
      const result = await storage.save(doc, base);
      if (result.ok) {
        saved = doc;
        revision = result.revision; savedAt = result.savedAt; example = false; newer = false;
        storage.working.clear();
      } else if (result.code === 'conflict') newer = true;
      changed();
      return result;
    }
    const keep = () => { if (dirty() && !blocked) storage.working.set({ document: history.present(), revision }); };

    const off = storage.subscribe(async () => {
      // Another tab saved. Without changes of our own, show it.
      if (blocked) return;
      const r = await storage.load();
      if (r && !r.error && r.revision === revision) return;
      if (dirty()) newer = true; else await readStored();
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
      async reload() { storage.working.clear(); const r = await readStored(); changed(); return r; },
      // Start again from the example; what was unreadable is replaced only by the next save.
      reset() {
        if (!blocked) return;
        const r = blocked.revision;
        open(D.parse(o.seed()).document, null);
        revision = r;
        changed();
      },
      blocked: () => blocked,
      newer: () => newer,
      savedAt: () => savedAt,
      isExample: () => example,
      onChange: fn => { listeners.push(fn); },
      destroy() { off(); listeners.length = 0; }
    };
  }

  const api = { create };
  if (inNode) module.exports = api;
  else root.PergamonStudio.connections.store = api;
})(typeof window !== 'undefined' ? window : globalThis);
