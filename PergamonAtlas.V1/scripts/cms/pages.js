// Page registry: the pages whose content the CMS manages. One entry per page;
// everything that loads, checks, draws, edits or publishes a page takes what
// is particular to it from here, and names no page itself.
//
//   id              its name in the database (site_pages)
//   name, noun      in the interface ("Homepage", "the live homepage")
//   prefix          its component ids start with it: '<prefix>.<instance>'
//   schemas         the document schemas it may have (docs/cms/ARCHITECTURE.md
//                   §3, §11). Schema 1 is the homepage's original shape only
//   schemaVersion   what the server reports for it (site_pages.schema_version)
//   siteNavigation  true for the one page whose document also holds Site
//                   Navigation (`site.sidebar`, the sidebar on every page)
//   regions()       its layout before anyone has published one
//
// A page says which one it is in its HTML, on the element it is drawn in:
//   <div data-atlas-page="home">
// current() → { page, root } | null.
// Browser: window.PergamonCMS.pages; Node: module.exports.
(function (root) {
  'use strict';

  // The homepage's row height: today's 260px Featured card is 7 rows, the
  // 140px Spotlight 4 (141.7px), Atlas Navigation 11 (417.7px) with 16px gutters.
  const HOME_ROW = 23.43;

  const PAGES = {
    home: {
      id: 'home',
      name: 'Homepage',
      noun: 'homepage',
      prefix: 'home',
      schemas: [1, 2],
      schemaVersion: 1,
      siteNavigation: true,
      // Beside the sidebar, the 70/30 upper area; below, full width, the
      // carousel. Instance ids are schema 1's slot names, so upgrading a
      // schema-1 document renames nothing.
      regions: () => [
        { id: 'upper', frame: 'sidebar', rowHeight: HOME_ROW, stack: ['featured', 'spotlight', 'navigation'], widgets: [
          { id: 'featured', type: 'feature-hero', col: 1, row: 1, cols: 14, rows: 7 },
          { id: 'spotlight', type: 'feature-spotlight', col: 1, row: 8, cols: 14, rows: 4 },
          { id: 'navigation', type: 'atlas-navigation', col: 15, row: 1, cols: 6, rows: 11 }
        ] },
        { id: 'lower', rowHeight: HOME_ROW, widgets: [
          { id: 'carousel', type: 'carousel', col: 1, row: 1, cols: 20, rows: 10 }
        ] }
      ]
    },
    // One region beside the sidebar: the heading, and every game.
    games: {
      id: 'games',
      name: 'Games page',
      noun: 'Games page',
      prefix: 'games',
      schemas: [2],
      schemaVersion: 2,
      siteNavigation: false,
      regions: () => [
        { id: 'main', frame: 'sidebar', rowHeight: HOME_ROW, widgets: [
          { id: 'heading', type: 'page-heading', col: 1, row: 1, cols: 20, rows: 6 },
          { id: 'grid', type: 'card-grid', col: 1, row: 7, cols: 20, rows: 7 }
        ] }
      ]
    }
  };

  const get = id => (Object.prototype.hasOwnProperty.call(PAGES, id) ? PAGES[id] : null);
  function current() {
    const node = typeof document === 'undefined' ? null : document.querySelector('[data-atlas-page]');
    const page = node && get(node.getAttribute('data-atlas-page'));
    return page ? { page: page, root: node } : null;
  }

  const api = { all: () => Object.keys(PAGES).map(id => PAGES[id]), get: get, current: current };
  root.PergamonCMS = root.PergamonCMS || {};
  root.PergamonCMS.pages = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
