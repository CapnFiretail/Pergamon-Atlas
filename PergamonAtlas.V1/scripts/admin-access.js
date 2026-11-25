// The administrator check: the one place the site asks whether this visitor is
// an administrator. Loaded after auth.js: by the shared header (scripts/layout.js)
// on any page once someone is signed in, and in the HTML of the pages that decide
// what to show by it (the homepage's Admin Mode, /handbook/, /studio/).
//
// The answer is the server's: a session, then is_admin() (rpc, the check every
// CMS write runs), never anything stored in the browser. Nothing is shown before
// it, and a sign-out or another account asks again. It decides what a page
// shows; what may be read or changed is enforced by the server each time.
//
//   PergamonAdmin.verify()    → Promise<boolean>: the latest answer
//   PergamonAdmin.recheck()   ask again
//   PergamonAdmin.isAdmin(), PergamonAdmin.onChange(fn(isAdmin))
//
// What the page can do for an administrator (the header's Admin Mode control):
//   provideEditor({ state })  by a page's editor (scripts/cms/admin.js): 'loading',
//                             'ready' or 'failed'. A page without one can't be edited.
//   editor()                  → its state, or null
//   onEditor(fn)
//   adminButton()             → Promise<button>: the header's control, once shown
//   setAdminButton(button)    (scripts/admin-header.js)
(function () {
  'use strict';
  if (window.PergamonAdmin) return;
  const auth = window.PergamonAuth;

  let admin = false;
  let check = 0;                       // latest check; older answers are ignored
  let pending = null;
  const listeners = [], editorListeners = [];
  const tell = (list, value) => list.forEach(fn => { try { fn(value); } catch (e) {} });

  async function ask() {
    if (!auth || !window.PergamonSupabaseClient) return false;
    const res = await auth.getSession();
    if (!res || !res.data || !res.data.session) return false;
    const answer = await auth.isCmsAdmin();
    return !answer.error && answer.data === true;
  }
  function recheck() {
    const id = ++check;
    pending = ask().catch(() => false).then(ok => {
      if (id !== check) return pending;          // a newer check is running
      if (ok !== admin) { admin = ok; tell(listeners, ok); }
      return ok;
    });
    return pending;
  }

  let editor = null;                   // the page's editor: 'loading' | 'ready' | 'failed' | null
  let button = null, waiting = [];
  window.PergamonAdmin = {
    verify: () => pending || recheck(),
    recheck,
    isAdmin: () => admin,
    onChange: fn => { listeners.push(fn); },
    provideEditor(e) { editor = e.state; tell(editorListeners, editor); },
    editor: () => editor,
    onEditor: fn => { editorListeners.push(fn); },
    adminButton: () => (button ? Promise.resolve(button) : new Promise(resolve => waiting.push(resolve))),
    setAdminButton(b) { button = b; if (b) { const w = waiting; waiting = []; w.forEach(fn => fn(b)); } }
  };

  recheck();
  if (auth && auth.onAuthStateChange && window.PergamonSupabaseClient) {
    try {
      auth.onAuthStateChange(event => {
        if (event === 'TOKEN_REFRESHED') return;
        // Outside the auth callback: supabase-js must not be re-entered from it.
        setTimeout(recheck, 0);
      });
    } catch (e) {}
  }
})();
