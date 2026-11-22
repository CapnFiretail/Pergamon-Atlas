// Atlas Grid widget types: the sizing contract of every widget that can sit
// on the grid. The single source of sizing data: the grid engine validates
// against it, the Handbook shows it, tests/design/grid.test.mjs checks it.
// Rendering is not here: pages register how each type is drawn with the
// renderer (scripts/grid/renderer.js), including any container a component
// needs around it.
//
//   contract   { minCols, minRows, defaultCols, defaultRows, minWidth, minHeight }
//     min/default cells  at the reference grid (below); defaults ≥ minimums
//     minWidth/Height    pixels: the smallest size at which the CMS's largest
//                        permitted content fits with nothing clipped or
//                        escaping (measured; see `measured`). Checked at the
//                        actual container width, since cells change size.
//   placeable  false: documented, not yet placeable (validation refuses it)
//
// Reference grid: the standard desktop container, 1392px (a 1440px window
// minus the widget-page insets), cells 54.4px. At that width every minimum
// cell count below is the smallest span reaching its pixel floor.
(function (root) {
  'use strict';

  const reference = { width: 1392, note: 'A 1440px window minus the widget-page insets (2 × 24px).' };

  const types = {
    'feature-hero': {
      name: 'Feature banner, hero',
      component: 'featureBanner({ variant: "hero" })',
      placeable: true,
      contract: { minCols: 7, minRows: 6, defaultCols: 12, defaultRows: 6, minWidth: 426, minHeight: 356 },
      measured: 'Title 60 characters and button 24 (the CMS maximums). Below 426px the button escapes the card; the tallest height needed at any wider size is 356px (just above the 640px compact switch, where the title wraps most).',
      responsive: 'Compact layout (copy stacked over the artwork, fixed 320px minimum height) when its container is 640px or narrower.'
    },
    'feature-spotlight': {
      name: 'Feature banner, spotlight',
      component: 'featureBanner({ variant: "banner" })',
      placeable: true,
      contract: { minCols: 6, minRows: 4, defaultCols: 12, defaultRows: 4, minWidth: 358, minHeight: 204 },
      measured: 'Title 60 characters and button 24. Below 358px the button escapes; at its narrowest the content needs 204px of height (much less when wider).',
      responsive: 'Compact layout (button under the title) when its container is 640px or narrower.'
    },
    'carousel': {
      name: 'Carousel',
      component: 'carousel({ sections })',
      placeable: true,
      contract: { minCols: 4, minRows: 6, defaultCols: 20, defaultRows: 6, minWidth: 260, minHeight: 392 },
      measured: 'Five filter tabs, 40-character card titles. Below 260px the tabs wrap onto a third line; its natural height is 341–392px depending on width (the tabs move to their own row at 900px and narrower).',
      responsive: 'Its own size container: compact at 640px and narrower, tabs on their own row at 900px and narrower.'
    },
    'content-card': {
      name: 'Content card',
      component: 'contentCard({ title, meta, href, art })',
      placeable: false,
      contract: { minCols: 3, minRows: 4, defaultCols: 3, defaultRows: 4, minWidth: 160, minHeight: 220 },
      measured: 'Square artwork plus a caption: height is its width + 60px. 160px is the narrowest the site uses; titles longer than the card end with an ellipsis, by design.',
      responsive: 'Compact caption at 180px and narrower. Shown inside a carousel; not a standalone grid widget yet.'
    },
    'atlas-navigation': {
      name: 'Atlas Navigation',
      component: 'built by the homepage (scripts/home.js)',
      placeable: false,
      contract: { minCols: 4, minRows: 6, defaultCols: 6, defaultRows: 6, minWidth: 256, minHeight: 342 },
      measured: 'Four entries. Narrowest working width on the homepage today 256px; stacked, its content needs 342px of height.',
      responsive: 'Entries stack at their natural height when the homepage’s upper area is 860px or narrower. Not placeable until it is extracted into the component library.'
    }
  };

  // Frame regions: page-level areas the grid works around, not widgets. They
  // can't be placed, moved or removed by a layout.
  const frameRegions = {
    sidebar: {
      name: 'Sidebar (floating navigation)',
      width: 'var(--pa-sidebar-w): 220px expanded, 80px collapsed (styles/layout.css)',
      behaviour: 'A rounded, limited-height panel beside the content on wide screens; a slide-in drawer at 900px and narrower. Site-wide navigation, managed by Site Navigation, not by page layouts. Its fixed widths do not fall on whole grid columns, so a page that uses the grid keeps the sidebar in its own track beside it (decided with the homepage migration).'
    }
  };

  // What the measurements do and don't cover.
  const limitations = [
    { what: 'Measured with realistic text at the CMS maximums', why: 'Floors come from ordinary 60-character titles and 24-character buttons. Text made of unusually wide characters (a title of capital Ms and Ws, for example) needs more room than any floor allows; widgets must handle it safely by wrapping, truncating or validating content, rather than every minimum growing to fit it.' },
    { what: 'Minimums and defaults are provisional', why: 'Minimums are the smallest safe size; defaults are a design preference for a newly added widget and can change freely. Both are starting values, to be revisited as widgets and pages evolve.' },
    { what: 'Today’s homepage is below some floors', why: 'Its fixed 260px and 140px banner rows are shorter than the Hero’s and Spotlight’s floors for maximum-length content. Documented, not changed; the homepage moves to the grid in H5.3.' }
  ];

  const api = { reference, types, frameRegions, limitations };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonGrid = root.PergamonGrid || {}; root.PergamonGrid.widgetTypes = api; }
})(typeof window !== 'undefined' ? window : globalThis);
