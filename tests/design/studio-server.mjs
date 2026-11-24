// For the Studio's tests without a browser: a stand-in for the database functions
// of supabase/proposed/0015_studio_documents.sql (tests/cms/studio-documents.test.mjs
// checks the real ones) and for a browser's storage areas.
export function area() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

// db.saved[kind] → { revision, document, saved_at }. db.fail(fn, args): an answer to
// give instead (an { error }, or a throw); 'lost': it works, but no answer arrives.
export function createServer() {
  const db = { saved: {}, calls: [], fail: null };
  const copy = v => JSON.parse(JSON.stringify(v));
  function answer(fn, a) {
    const d = db.saved[a.p_kind] || { revision: null, document: null, saved_at: null };
    if (fn === 'get_studio_document') return { data: Object.assign({ kind: a.p_kind }, copy(d)), error: null };
    if (d.revision !== a.p_expected_revision) return { data: null, error: { code: 'PT409', message: 'saved by someone else' } };
    const next = db.saved[a.p_kind] = { revision: (d.revision || 0) + 1, document: copy(a.p_document), saved_at: '2026-01-01T00:00:00Z' };
    return { data: { kind: a.p_kind, revision: next.revision, saved_at: next.saved_at }, error: null };
  }
  db.client = {
    async rpc(fn, args) {
      db.calls.push(fn);
      const f = db.fail ? db.fail(fn, args) : null;
      if (f === 'lost') { answer(fn, args); throw new TypeError('Failed to fetch'); }
      if (f) return f;
      return answer(fn, args);
    }
  };
  return db;
}
