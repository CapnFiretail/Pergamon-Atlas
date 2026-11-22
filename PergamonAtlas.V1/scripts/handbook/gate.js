// /handbook/: what the page shows. Verified administrators (entry.js, the
// same server check as Admin Mode) get the Handbook, whose styles and scripts
// load only then; everyone else gets a generic access-denied notice that
// doesn't name the Handbook. Signing out (or into a non-admin account) while
// the page is open replaces the Handbook with the notice at once.
(function () {
  'use strict';
  const root = document.getElementById('handbook-root');
  const access = window.PergamonHandbook && window.PergamonHandbook.access;
  if (typeof window.loadSnippets === 'function') window.loadSnippets('');
  if (!root) return;

  const ASSETS = [
    { css: '/styles/handbook.css' },
    { js: '/scripts/design/typography.js', ready: () => !!(window.PergamonDesign && window.PergamonDesign.typography) },
    { js: '/scripts/handbook/handbook.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.app) },
    { js: '/scripts/handbook/typography-page.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.typographyPage) },
    { js: '/scripts/design/colors.js', ready: () => !!(window.PergamonDesign && window.PergamonDesign.colors) },
    { js: '/scripts/handbook/colors-page.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.colorsPage) },
    { js: '/scripts/handbook/vision-content.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.vision) },
    { js: '/scripts/handbook/vision-page.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.visionPage) },
    // The component library, for the Widgets page's live previews.
    { css: '/styles/components/feature-banner.css' },
    { css: '/styles/components/content-card.css' },
    { css: '/styles/components/carousel.css' },
    { js: '/scripts/glide.js', ready: () => !!window.PergamonGlide },
    { js: '/scripts/components/feature-banner.js', ready: () => !!(window.PergamonComponents && window.PergamonComponents.featureBanner) },
    { js: '/scripts/components/content-card.js', ready: () => !!(window.PergamonComponents && window.PergamonComponents.contentCard) },
    { js: '/scripts/components/carousel.js', ready: () => !!(window.PergamonComponents && window.PergamonComponents.carousel) },
    { js: '/scripts/handbook/component-examples.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.componentExamples) },
    { js: '/scripts/handbook/widgets-page.js', ready: () => !!(window.PergamonHandbook && window.PergamonHandbook.widgetsPage) }
  ];
  let loading = null;
  let shown = null;                    // 'handbook' | 'denied'

  function load(a) {
    if (a.css) {
      if (document.querySelector(`link[href="${a.css}"]`)) return Promise.resolve();
      return new Promise(resolve => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = a.css;
        l.onload = l.onerror = () => resolve();
        document.head.append(l);
      });
    }
    if (a.ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = a.js; s.async = false;         // keep order: registry before the pages
      s.onload = () => (a.ready() ? resolve() : reject(new Error(a.js)));
      s.onerror = () => reject(new Error(a.js));
      document.head.append(s);
    });
  }

  function denied() {
    if (shown === 'denied') return;
    shown = 'denied';
    if (window.PergamonHandbook && window.PergamonHandbook.app) window.PergamonHandbook.app.stop();
    document.title = 'Pergamon Atlas';
    root.removeAttribute('aria-busy');
    root.innerHTML =
      '<section class="pa-placeholder" aria-labelledby="denied-title">' +
        '<svg class="pa-placeholder-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/></svg>' +
        '<h1 id="denied-title">Access denied</h1>' +
        '<p>You don’t have permission to view this page.</p>' +
        '<div class="pa-placeholder-actions"><a class="is-primary" href="/">Go to the homepage</a></div>' +
      '</section>';
  }

  function handbook() {
    if (shown === 'handbook') return;
    loading = loading || Promise.all(ASSETS.map(load));
    loading.then(() => {
      if (!access.isAdmin()) return;               // signed out while loading
      if (shown === 'handbook') return;            // verify() and onChange can both get here
      shown = 'handbook';
      root.removeAttribute('aria-busy');
      window.PergamonHandbook.app.start(root);
    }, () => { loading = null; denied(); });
  }

  if (!access) { denied(); return; }
  access.verify().then(ok => (ok ? handbook() : denied()));
  access.onChange(ok => (ok ? handbook() : denied()));
})();
