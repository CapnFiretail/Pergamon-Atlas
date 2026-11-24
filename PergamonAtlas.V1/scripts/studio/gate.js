// /studio/: what the page shows. Verified administrators (entry.js) get the
// Studio, whose styles and scripts load only then; everyone else gets a generic
// access-denied notice that doesn't name the Studio. Signing out (or into a
// non-admin account) while the page is open replaces the Studio with the
// notice at once. Same behaviour as the Handbook's gate (handbook/gate.js).
(function () {
  'use strict';
  const root = document.getElementById('studio-root');
  const ns = window.PergamonStudio;
  const access = ns && ns.access;
  if (typeof window.loadSnippets === 'function') window.loadSnippets('');
  if (!root) return;

  const conn = key => () => !!(ns.connections && ns.connections[key]);
  const idea = key => () => !!(ns.ideas && ns.ideas[key]);
  // In order: the sections, the shell, then any section's own files.
  const ASSETS = [
    { css: '/styles/studio.css' },
    { js: '/scripts/studio/sections.js', ready: () => !!ns.sections },
    { js: '/scripts/studio/studio.js', ready: () => !!ns.app },
    { js: '/scripts/studio/environments.js', ready: () => !!ns.environments },
    { css: '/styles/canvas-kit.css' },
    { js: '/scripts/design/canvas-kit.js', ready: () => !!(window.PergamonDesign && window.PergamonDesign.canvasKit) },
    { js: '/scripts/studio/ui.js', ready: () => !!ns.ui },
    // Saved documents: the grid editor's history, storage, the shared actions.
    { js: '/scripts/grid/atlas-grid.js', ready: () => !!(window.PergamonGrid && window.PergamonGrid.validateLayout) },
    { js: '/scripts/grid/editor.js', ready: () => !!(window.PergamonGrid && window.PergamonGrid.editor) },
    { js: '/scripts/studio/storage.js', ready: () => !!ns.storage },
    { js: '/scripts/studio/store.js', ready: () => !!ns.store },
    { js: '/scripts/studio/document-flow.js', ready: () => !!ns.documentFlow },
    // Connections: the node canvas, the section.
    { css: '/styles/canvas.css' },
    { css: '/styles/studio-connections.css' },
    { js: '/scripts/canvas/geometry.js', ready: () => !!(window.PergamonCanvas && window.PergamonCanvas.geometry) },
    { js: '/scripts/canvas/renderer.js', ready: () => !!(window.PergamonCanvas && window.PergamonCanvas.renderer) },
    { js: '/scripts/canvas/interaction.js', ready: () => !!(window.PergamonCanvas && window.PergamonCanvas.interaction) },
    { js: '/scripts/studio/connections/registry.js', ready: conn('registry') },
    { js: '/scripts/studio/connections/document.js', ready: conn('document') },
    { js: '/scripts/studio/connections/seed.js', ready: conn('seed') },
    { js: '/scripts/studio/connections/library.js', ready: conn('library') },
    { js: '/scripts/studio/connections/inspector.js', ready: conn('inspector') },
    { js: '/scripts/studio/connections/page.js', ready: conn('page') },
    // Ideas.
    { css: '/styles/studio-ideas.css' },
    { js: '/scripts/studio/ideas/document.js', ready: idea('document') },
    { js: '/scripts/studio/ideas/seed.js', ready: idea('seed') },
    { js: '/scripts/studio/ideas/page.js', ready: idea('page') }
  ];
  let loading = null;
  let shown = null;                    // 'studio' | 'denied'

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
      s.src = a.js; s.async = false;         // keep order: sections before the shell
      s.onload = () => (a.ready() ? resolve() : reject(new Error(a.js)));
      s.onerror = () => reject(new Error(a.js));
      document.head.append(s);
    });
  }

  function denied() {
    if (shown === 'denied') return;
    shown = 'denied';
    if (ns && ns.app) ns.app.stop();
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

  function studio() {
    if (shown === 'studio') return;
    loading = loading || Promise.all(ASSETS.map(load));
    loading.then(() => {
      if (!access.isAdmin()) return;               // signed out while loading
      if (shown === 'studio') return;              // verify() and onChange can both get here
      shown = 'studio';
      root.removeAttribute('aria-busy');
      ns.app.start(root);
    }, () => { loading = null; denied(); });
  }

  if (!access) { denied(); return; }
  access.verify().then(ok => (ok ? studio() : denied()));
  access.onChange(ok => (ok ? studio() : denied()));
})();
