// Connections: where the document is kept. One interface, so the local copy can
// be replaced by a server one later without touching the editor:
//
//   storage.name                    said in the interface ("this browser")
//   storage.load()  → Promise<null | { document, revision, savedAt } | { error, raw }>
//                                   null: nothing saved yet. `document` is the
//                                   stored value, not yet checked
//   storage.save(document, revision) → Promise<{ ok: true, revision, savedAt }
//                                   | { ok: false, code: 'conflict' | 'full' | 'unavailable' }>
//                                   `revision`: the one the changes are based on
//                                   (null: none); if another was saved since,
//                                   nothing is written ('conflict')
//   storage.subscribe(fn) → unsubscribe   something else saved
//   storage.working.get() / set({ document, revision }) / clear()
//                                   unsaved changes, kept for this tab only
//
// local(): this browser's localStorage. Nothing leaves the browser, and anyone
// using the same browser profile can read it; it must never hold secrets.
(function (root) {
  'use strict';
  const KEY = 'pa-studio-connections';

  function local(o = {}) {
    const key = o.key || KEY, workKey = key + ':working';
    const area = () => o.storage || root.localStorage;          // may throw where storage is blocked
    const tab = () => o.session || root.sessionStorage;
    const now = o.now || (() => new Date().toISOString());

    function read() {
      const raw = area().getItem(key);
      if (raw === null) return null;
      let v = null;
      try { v = JSON.parse(raw); } catch (e) {}
      if (!v || typeof v !== 'object' || !Number.isInteger(v.revision) || !v.document) return { error: 'unreadable', raw };
      return { document: v.document, revision: v.revision, savedAt: typeof v.savedAt === 'string' ? v.savedAt : null, raw };
    }
    return {
      name: 'this browser',
      async load() {
        try { return read(); } catch (e) { return { error: 'unavailable', raw: null }; }
      },
      async save(document, revision) {
        let current;
        try { current = read(); } catch (e) { return { ok: false, code: 'unavailable' }; }
        const at = current && !current.error ? current.revision : null;
        if (at !== (revision === undefined ? null : revision)) return { ok: false, code: 'conflict' };
        const entry = { revision: (at || 0) + 1, savedAt: now(), document };
        try { area().setItem(key, JSON.stringify(entry)); } catch (e) { return { ok: false, code: e && /quota/i.test(e.name + e.message) ? 'full' : 'unavailable' }; }
        return { ok: true, revision: entry.revision, savedAt: entry.savedAt };
      },
      subscribe(fn) {
        const on = e => { if (e.key === key || e.key === null) fn(); };
        root.addEventListener('storage', on);
        return () => root.removeEventListener('storage', on);
      },
      working: {
        get() { try { return JSON.parse(tab().getItem(workKey) || 'null'); } catch (e) { return null; } },
        set(v) { try { tab().setItem(workKey, JSON.stringify(v)); return true; } catch (e) { return false; } },
        clear() { try { tab().removeItem(workKey); } catch (e) {} }
      }
    };
  }

  const api = { local, KEY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PergamonStudio.connections.storage = api;
})(typeof window !== 'undefined' ? window : globalThis);
