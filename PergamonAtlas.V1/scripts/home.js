// The homepage: what is its own. The page renderer (scripts/page.js) draws it
// from its content document; data/home-content.js is the built-in copy.
(function () {
  const content = window.PergamonHomeContent;
  if (!content || !window.PergamonPages) return;
  const page = window.PergamonPages.mount({
    heading: 'PergamonAtlas',
    document: content.document,
    staticImages: content.staticImages,
    settings: { explore: content.explore, navigation: content.context }
  });
  if (!page) return;

  // A password-reset link that Supabase sent to the Site URL (the homepage)
  // instead of the reset page: finish it there. auth.js loads after this file.
  document.addEventListener('DOMContentLoaded', () => {
    const auth = window.PergamonAuth;
    if (!auth) return;
    try {
      auth.onAuthStateChange(event => {
        if (event !== 'PASSWORD_RECOVERY') return;
        try { sessionStorage.setItem('pa-password-recovery', '1'); } catch (e) {}
        window.location.replace('/account/reset-password/');
      });
    } catch (e) {}
  });
})();
