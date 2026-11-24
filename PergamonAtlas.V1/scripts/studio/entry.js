// Atlas Studio entry point: the header's Studio icon. Loaded right after
// /scripts/handbook/entry.js on the homepage, /handbook/ and /studio/.
//
// Access is the Handbook's administrator check (PergamonHandbook.access: a
// session, then the server's is_admin()), so there is one check and one answer
// per page. Guests and signed-in members see no sign of the Studio.
//
// The check decides what the page shows; anything the Studio may read or
// change later must be enforced by the server.
//
//   PergamonStudio.access   PergamonHandbook.access (verify, isAdmin, onChange)
(function () {
  'use strict';
  const access = window.PergamonHandbook && window.PergamonHandbook.access;
  if (!access) return;
  const ns = window.PergamonStudio = window.PergamonStudio || {};
  const HREF = '/studio/';
  const CUBE = '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>';

  // Left of the Handbook's book icon, which stays next to the Admin Mode button
  // (its entry.js adds the book before telling its listeners).
  function showIcon() {
    const actions = document.querySelector('.pa-header .pa-actions');
    if (!actions || actions.querySelector('.pa-studio-link')) return;
    const link = document.createElement('a');
    link.className = 'pa-icon-button pa-studio-link';
    link.href = HREF;
    link.setAttribute('aria-label', 'Atlas Studio');
    link.dataset.tip = 'Atlas Studio';
    if (window.location.pathname.replace(/\/?$/, '/') === HREF) link.setAttribute('aria-current', 'page');
    link.innerHTML = '<svg class="pa-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + CUBE + '</svg>';
    const book = actions.querySelector('.pa-handbook-link');
    if (book) book.before(link); else actions.prepend(link);
  }
  function hideIcon() {
    document.querySelectorAll('.pa-studio-link').forEach(n => n.remove());
  }

  ns.access = access;
  access.onChange(ok => (ok ? showIcon() : hideIcon()));
  if (access.isAdmin()) showIcon();
})();
