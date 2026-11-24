// Atlas Grid widget types: the sizing contract of every widget that can sit
// on the grid. The single source of sizing data: the grid engine validates
// against it, the Handbook shows it, tests/design/grid.test.mjs checks it.
// Rendering is not here: pages register how each type is drawn with the
// renderer (scripts/grid/renderer.js), including any container a component
// needs around it.
//
//   contract   { minCols, minRows, defaultCols, defaultRows, minWidth, minHeight,
//                minHeightBands? }
//     min/default cells  at the reference grid (below); defaults ≥ minimums
//     minWidth/Height    pixels: the smallest size at which the CMS's largest
//                        permitted content fits with nothing clipped or
//                        escaping (measured; see `measured`). Checked at the
//                        actual container width, since cells change size.
//     minHeightBands     [{ maxWidth, minHeight }]: a different height floor
//                        while the widget is at most maxWidth wide: at the
//                        breakpoints the component's own CSS already uses;
//                        minHeight is the floor above the last band.
//   placeable  false: documented, not yet placeable (validation refuses it)
//   grows      true: as tall as its rectangle or its content, whichever is more
//              (atlas-grid.js › Growing widgets); minHeight is then the least it
//              may be given, not the most its content needs
//   stack      'content': stacked (narrow screens), its height follows its
//              content rather than its authored height
//
// Reference grid: the standard desktop container, 1392px (a 1440px window
// minus the widget-page insets), cells 54.4px. At that width every minimum
// cell count below is the smallest span reaching its pixel floor (the floor
// for the width that span gives the widget).
(function (root) {
  'use strict';

  const reference = { width: 1392, note: 'A 1440px window minus the widget-page insets (2 × 24px).' };

  const types = {
    'feature-hero': {
      name: 'Feature banner, hero',
      component: 'featureBanner({ variant: "hero" })',
      placeable: true,
      contract: { minCols: 7, minRows: 5, defaultCols: 12, defaultRows: 6, minWidth: 456, minHeight: 256, minHeightBands: [{ maxWidth: 560, minHeight: 320 }] },
      measured: 'Titles up to 60 characters with a 24-character button, in the site’s fonts and in the fallback fonts. Long titles are set smaller, but never below 26px (22px in the wider fallback font; compact, 30px): 256px of height when wider than 560px; compact, 320px (its fixed minimum). Below 456px a long button label no longer fits on one line; stacked, the label wraps and the card grows.',
      responsive: 'Compact layout (copy stacked over the artwork, fixed 320px minimum height) when its container is 560px or narrower.'
    },
    'feature-spotlight': {
      name: 'Feature banner, spotlight',
      component: 'featureBanner({ variant: "banner" })',
      placeable: true,
      contract: { minCols: 6, minRows: 3, defaultCols: 12, defaultRows: 4, minWidth: 384, minHeight: 121, minHeightBands: [{ maxWidth: 560, minHeight: 185 }] },
      measured: 'Titles up to 60 characters with a 24-character button, site and fallback fonts; long titles are set smaller, never below 20px (18px in the fallback font; compact, 24px). Compact (the button under the title) it needs 185px of height; wider, 121px. Below 384px a long button label no longer fits on one line; stacked, the label wraps and the card grows.',
      responsive: 'Compact layout (button under the title) when its container is 560px or narrower; up to 660px a long button label wraps.'
    },
    'carousel': {
      name: 'Carousel',
      component: 'carousel({ sections })',
      placeable: true,
      contract: { minCols: 4, minRows: 6, defaultCols: 20, defaultRows: 6, minWidth: 260, minHeight: 356, minHeightBands: [{ maxWidth: 640, minHeight: 384 }, { maxWidth: 900, minHeight: 392 }] },
      measured: 'Five filter tabs, 40-character card titles. Below 260px the tabs wrap onto a third line. Its height is set by its content, not its slot: up to 384px when 640px wide or less, 392px from 641 to 900px (tabs on their own row), 356px wider.',
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
      component: 'atlasNavigation({ title, links })',
      placeable: true,
      stack: 'content',
      contract: { minCols: 4, minRows: 6, defaultCols: 6, defaultRows: 11, minWidth: 242, minHeight: 342 },
      measured: 'Four entries. Below 234px the longest label (“Suggestions”) is cut off; 242px leaves a little room. Its content needs 342px of height with stacked rows; on a grid its rows share any extra height.',
      responsive: 'Rows stretch to fill its rectangle; stacked, it is as tall as its content.'
    },
    'page-heading': {
      name: 'Page heading',
      component: 'pageHeading()',
      placeable: true,
      stack: 'content',
      contract: { minCols: 5, minRows: 2, defaultCols: 20, defaultRows: 4, minWidth: 300, minHeight: 150, minHeightBands: [{ maxWidth: 480, minHeight: 104 }, { maxWidth: 760, minHeight: 180 }, { maxWidth: 1000, minHeight: 134 }] },
      measured: 'Every part, with a 40-character title and subtitle and a 16-character count label, in the site’s fonts and in the fallback fonts: 102px of height up to 480px wide (no subtitle or count), 179px up to 760px (the count under the title), 132px up to 1000px, 148px wider.',
      responsive: 'The count moves under the title at 760px and narrower; at 480px the subtitle and the count are left out, and at 330px the divider.'
    },
    'card-grid': {
      name: 'Card grid',
      component: 'cardGrid({ label, emptyMessage })',
      placeable: true,
      grows: true,
      stack: 'content',
      contract: { minCols: 5, minRows: 4, defaultCols: 20, defaultRows: 6, minWidth: 300, minHeight: 232 },
      measured: 'Two columns of cards at 300px. One row of cards at its narrowest is 232px tall; wider or with more cards it is taller, and the grid gives it the room.',
      responsive: 'As many columns as fit: cards at least 190px wide, 128px at 640px and narrower.'
    }
  };

  // Frame regions: page-level areas the grid works around, not widgets. They
  // can't be placed, moved or removed by a layout.
  const frameRegions = {
    sidebar: {
      name: 'Sidebar (floating navigation)',
      width: 'var(--pa-sidebar-w): 220px expanded, 80px collapsed (styles/layout.css)',
      behaviour: 'A rounded panel of fixed height (--pa-sidebar-panel-h) at the top of the page, beside the content on wide screens; a slide-in drawer at 900px and narrower. Site-wide navigation, managed by Site Navigation, not by page layouts. Its fixed widths do not fall on whole grid columns, so a page that uses the grid keeps the sidebar in its own track beside it (decided with the homepage migration).'
    }
  };

  // What the measurements do and don't cover.
  const limitations = [
    { what: 'Measured with realistic text at the CMS maximums', why: 'Floors come from ordinary 60-character titles and 24-character buttons. Text made of unusually wide characters (a title of capital Ms and Ws, for example) needs more room than any floor allows; widgets must handle it safely by wrapping, truncating or validating content, rather than every minimum growing to fit it.' },
    { what: 'Minimums and defaults are provisional', why: 'Minimums are the smallest safe size; defaults are a design preference for a newly added widget and can change freely. Both are starting values, to be revisited as widgets and pages evolve.' },
    { what: 'The fallback font can split a long word', why: 'When the display font can’t load, its replacement is about a quarter wider: a 12 or 13 letter word can break across lines in a Hero under 616px wide. Everything stays inside the card.' }
  ];

  const api = { reference, types, frameRegions, limitations };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonGrid = root.PergamonGrid || {}; root.PergamonGrid.widgetTypes = api; }
})(typeof window !== 'undefined' ? window : globalThis);
