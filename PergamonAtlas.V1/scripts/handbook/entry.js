// Atlas Handbook entry point: the administrator check and the header's book
// icon. Loaded after auth.js on the homepage and on /handbook/.
//
// Access uses the same check as Admin Mode (scripts/cms/admin.js): a session,
// then the server's is_admin() (rpc, the check every CMS write runs). Nothing
// is shown, and nothing else is loaded, until the server answers yes; a sign-
// out or a different account re-checks and removes the icon. Guests and
// signed-in members see no sign of the Handbook.
//
// The Handbook is read-only documentation of public styling, so this check
// decides what the page shows; anything it may change in a later phase must
// be enforced by the server, as the CMS functions are.
//
// The Studio (scripts/studio/entry.js) uses this same check.
//
//   PergamonHandbook.access.verify()   → Promise<boolean> (latest answer)
//   PergamonHandbook.access.onChange(fn(isAdmin))
(function () {
  'use strict';
  const auth = window.PergamonAuth;
  const ns = window.PergamonHandbook = window.PergamonHandbook || {};
  const HREF = '/handbook/';
  const BOOK = '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/>';

  let admin = false;
  let check = 0;                       // latest check; older answers are ignored
  let pending = null;
  const listeners = [];

  async function isAdmin() {
    if (!auth || !window.PergamonSupabaseClient) return false;
    const res = await auth.getSession();
    if (!res || !res.data || !res.data.session) return false;
    const answer = await auth.isCmsAdmin();
    return !answer.error && answer.data === true;
  }

  function verify() {
    const id = ++check;
    pending = isAdmin().catch(() => false).then(ok => {
      if (id !== check) return pending;          // a newer check is running
      if (ok !== admin) { admin = ok; ok ? showIcon() : hideIcon(); listeners.forEach(fn => { try { fn(ok); } catch (e) {} }); }
      return ok;
    });
    return pending;
  }

  // ── Header icon (verified administrators only) ────────────────────────
  // Left of the Admin Mode button when the page has one (admin.js keeps that
  // order whichever loads first), otherwise first in the header's actions.
  function showIcon() {
    const actions = document.querySelector('.pa-header .pa-actions');
    if (!actions || actions.querySelector('.pa-handbook-link')) return;
    const link = document.createElement('a');
    link.className = 'pa-icon-button pa-handbook-link';
    link.href = HREF;
    link.setAttribute('aria-label', 'Atlas Handbook');
    link.dataset.tip = 'Atlas Handbook';
    if (window.location.pathname.replace(/\/?$/, '/') === HREF) link.setAttribute('aria-current', 'page');
    link.innerHTML = '<svg class="pa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + BOOK + '</svg>';
    const adminButton = actions.querySelector('#cms-admin-button');
    if (adminButton) adminButton.before(link); else actions.prepend(link);
    document.documentElement.setAttribute('data-handbook-admin', '');
  }
  function hideIcon() {
    document.querySelectorAll('.pa-handbook-link').forEach(n => n.remove());
    document.documentElement.removeAttribute('data-handbook-admin');
  }

  ns.access = {
    verify: () => pending || verify(),
    recheck: verify,
    isAdmin: () => admin,
    onChange: fn => { listeners.push(fn); }
  };

  verify();
  if (auth && auth.onAuthStateChange && window.PergamonSupabaseClient) {
    try {
      auth.onAuthStateChange(event => {
        if (event === 'TOKEN_REFRESHED') return;
        // Outside the auth callback: supabase-js must not be re-entered from it.
        setTimeout(verify, 0);
      });
    } catch (e) {}
  }
})();
