// Studio documents: where one is kept. The only Studio file that talks to the
// database or knows what it answers.
//
// server({ kind, key }): the environment's own database (Supabase, the project
// this build is configured for), one document per kind shared by every
// administrator. The server checks the administrator, the document and the
// revision (supabase/proposed/0015_studio_documents.sql); hiding the Studio is
// not what protects it.
//   storage.name                    said in the interface: 'staging' | 'production'
//   storage.load()  → Promise<null | { document, revision, savedAt, raw } | { error }>
//                                   null: the server says nothing is saved yet.
//                                   `document` is the stored value, not yet checked
//   storage.save(document, revision) → Promise<{ ok: true, revision, savedAt }
//                                   | { ok: false, code, message? }>
//                                   `revision`: the one the changes are based on
//                                   (null: none); if another was saved since,
//                                   nothing is written ('conflict'). ok only once
//                                   the server has answered with the new revision
//   error / code: 'unavailable' (no answer: for a save, it may still have arrived)
//     | 'denied' (not signed in, or not an administrator) | 'missing' (the
//     database has no Studio storage) | 'conflict' | 'refused' (message: why)
//   storage.subscribe(fn) → unsubscribe   worth looking again: the page was
//                                   returned to. Nothing is pushed
//   storage.working.get() / set({ document, revision }) / clear()
//                                   unsaved changes, kept for this tab only
//
// browser({ key }): the copy a browser saved before documents were shared, under
// its localStorage key. Read, and removed when asked; never written to, so it
// stays as it was whatever happens to the stored one.
//   copy.read() → null | { document, savedAt, raw } | { error: 'unreadable', raw }
//   copy.remove(raw) → true | false   only if it is still that copy
//   copy.mark() / mark('moved' | 'kept')   what was done with this copy, remembered
//                                   in this browser
(function (root) {
  'use strict';
  const WAIT = 30000;

  // What the server's answer means. Anything not recognised is 'unavailable'.
  function reason(error, status) {
    const code = String((error && error.code) || '');
    if (code === 'PT409') return 'conflict';
    if (['PT403', '42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code) || status === 401 || status === 403) return 'denied';
    if (['PT404', 'PGRST202', '42883'].includes(code)) return 'missing';
    if (code === 'PT422' || /^22/.test(code)) return 'refused';
    return 'unavailable';
  }

  function server(o) {
    const { kind } = o, workKey = `pa-studio-document:${kind}:working`;
    const client = () => o.client || root.PergamonSupabaseClient;
    const tab = () => o.session || root.sessionStorage;
    const isRevision = v => Number.isInteger(v) && v > 0;

    // → { data } | { error: code, message }. Never rejects, always answers.
    async function call(fn, args) {
      const abort = new AbortController();
      let timer = 0;
      try {
        const request = client().rpc(fn, args);
        const res = await Promise.race([
          request.abortSignal ? request.abortSignal(abort.signal) : request,
          new Promise((resolve, reject) => { timer = setTimeout(() => { reject(new Error('timeout')); abort.abort(); }, o.wait || WAIT); })
        ]);
        if (res && !res.error) return { data: res.data };
        return { error: reason(res && res.error, res && res.status), message: String((res && res.error && res.error.message) || '') };
      } catch (e) {
        return { error: 'unavailable', message: '' };
      } finally { clearTimeout(timer); }
    }

    return {
      name: o.name || (root.PERGAMON_ENV === 'production' ? 'production' : 'staging'),
      async load() {
        const r = await call('get_studio_document', { p_kind: kind });
        if (r.error) return { error: r.error === 'denied' || r.error === 'missing' ? r.error : 'unavailable' };
        const d = r.data;
        if (!d || d.kind !== kind) return { error: 'unavailable' };
        if (d.revision === null && d.document === null) return null;
        if (!isRevision(d.revision) || !d.document) return { error: 'unavailable' };
        return { document: d.document, revision: d.revision, savedAt: d.saved_at || null, raw: JSON.stringify(d.document, null, 2) };
      },
      async save(document, revision) {
        const r = await call('save_studio_document', { p_kind: kind, p_document: document, p_expected_revision: revision === undefined ? null : revision });
        if (r.error) return { ok: false, code: r.error, message: r.message };
        if (!r.data || r.data.kind !== kind || !isRevision(r.data.revision)) return { ok: false, code: 'unavailable', message: '' };
        return { ok: true, revision: r.data.revision, savedAt: r.data.saved_at || null };
      },
      subscribe(fn) {
        const page = root.document;
        if (!page) return () => {};
        const on = () => { if (page.visibilityState === 'visible') fn(); };
        page.addEventListener('visibilitychange', on);
        return () => page.removeEventListener('visibilitychange', on);
      },
      working: {
        get() {
          try {
            const v = JSON.parse(tab().getItem(workKey) || 'null');
            if (v) return v;
            // Kept by a version that saved in the browser: its revision means nothing here.
            const old = o.key ? JSON.parse(tab().getItem(o.key + ':working') || 'null') : null;
            return old && { document: old.document, revision: null };
          } catch (e) { return null; }
        },
        set(v) { try { tab().setItem(workKey, JSON.stringify(v)); return true; } catch (e) { return false; } },
        clear() { try { tab().removeItem(workKey); if (o.key) tab().removeItem(o.key + ':working'); } catch (e) {} }
      }
    };
  }

  function browser(o) {
    const { key } = o, markKey = key + ':copy';
    const area = () => o.storage || root.localStorage;          // may throw where storage is blocked
    const get = k => { try { return area().getItem(k); } catch (e) { return null; } };
    return {
      read() {
        const raw = get(key);
        if (raw === null) return null;
        let v = null;
        try { v = JSON.parse(raw); } catch (e) {}
        if (!v || typeof v !== 'object' || !v.document) return { error: 'unreadable', raw };
        return { document: v.document, savedAt: typeof v.savedAt === 'string' ? v.savedAt : null, raw };
      },
      remove(raw) {
        if (get(key) !== raw) return false;
        try { area().removeItem(key); area().removeItem(markKey); return true; } catch (e) { return false; }
      },
      // Belongs to the copy as it is now: another one (an older page saved) has none.
      mark(value) {
        const raw = get(key);
        if (value) { try { area().setItem(markKey, JSON.stringify({ value, size: raw.length, start: raw.slice(0, 80) })); } catch (e) {} return value; }
        try { const m = JSON.parse(get(markKey) || 'null'); return m && raw !== null && m.size === raw.length && m.start === raw.slice(0, 80) ? m.value : null; } catch (e) { return null; }
      }
    };
  }

  const api = { server, browser };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PergamonStudio.storage = api;
})(typeof window !== 'undefined' ? window : globalThis);
