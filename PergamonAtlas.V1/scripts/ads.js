// Advertising (Google AdSense, automatic ads), in place of its own tag, on the
// pages that have ads:
//
//   <script defer src="/scripts/ads.js" data-client="ca-pub-…"></script>
//
// Nothing loads until the auth client has said who is here. A guest then gets
// ads; someone signed in, once the server has said they aren't an administrator
// (scripts/admin-access.js, the site's one check). Administrators get none, and
// when the question can't be answered (no auth client, no connection, a failed
// check) nobody does. Ads that are on the page stay until it is left: they can't
// be taken back, so a later sign-in counts from the next page.
(function () {
  'use strict';
  const client = document.currentScript && document.currentScript.dataset.client;
  if (!client) return;
  let loaded = false;
  let latest = 0;                      // the newest decision; older answers are ignored

  function load() {
    if (loaded) return;
    loaded = true;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.crossOrigin = 'anonymous';
    document.head.append(s);
  }
  const access = () => (window.PergamonAdmin ? Promise.resolve(window.PergamonAdmin) : new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/scripts/admin-access.js';
    s.onload = () => (window.PergamonAdmin ? resolve(window.PergamonAdmin) : reject(new Error('admin-access')));
    s.onerror = reject;
    document.head.append(s);
  }));
  // 'guest' | 'member' | 'admin' | 'unknown'
  async function who(auth) {
    const r = await auth.getSession();
    if (!r || r.error || !r.data) return 'unknown';
    if (!r.data.session) return 'guest';
    return (await access()).status();
  }
  function decide(auth) {
    if (loaded) return;
    const id = ++latest;
    who(auth).catch(() => 'unknown').then(answer => {
      if (id === latest && (answer === 'guest' || answer === 'member')) load();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.PergamonAuth;
    if (!auth || !window.PergamonSupabaseClient) return;
    decide(auth);
    // (Outside the auth callback: supabase-js must not be re-entered from it.)
    try { auth.onAuthStateChange(event => { if (event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') setTimeout(() => decide(auth), 0); }); } catch (e) {}
  });
})();
