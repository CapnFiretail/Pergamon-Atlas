// Atlas spacing and surface tokens: what each is for. Documentation only:
// the values live in /styles/theme.css (spacing scale, radii, elevation) and
// /styles/layout.css (page frame: insets and the widget gutter, with their
// narrow-screen values). The Handbook's Spacing & Surfaces page reads this
// list and shows each token's live value; tests/design/surfaces.test.mjs
// checks that this list and the stylesheets agree.
//
//   spacing   { token, use }
//   frame     { token, use }               defined in layout.css
//   radii     { token, name, use }
//   shadows   { token, name, use }         dark and light values
//   surfaces  { id, name, radius, shadow?, use, where }   the recipes
//   notYet    { what, why }                considered, not tokens (yet)
// Works in the browser (window.PergamonDesign.surfaces) and in Node.
(function (root) {
  'use strict';

  const spacing = [
    { token: '--space-1', use: 'Hairline gaps: an icon and its count, stacked captions.' },
    { token: '--space-2', use: 'Gaps inside a control or between small items; the most common gap.' },
    { token: '--space-3', use: 'Gaps between items in a list or panel; control padding.' },
    { token: '--space-4', use: 'Panel padding, the widget gutter, narrow-screen page insets.' },
    { token: '--space-5', use: 'Roomier panel padding (feature cards, Handbook heroes).' },
    { token: '--space-6', use: 'Widget page inset; padding of large panels.' },
    { token: '--space-8', use: 'Ordinary page inset; padding of standalone panels.' }
  ];

  const frame = [
    { token: '--page-inset-block', use: 'Space above and below the content of an ordinary page (Settings, placeholders, games).' },
    { token: '--page-inset-inline', use: 'Space either side of the content of an ordinary page.' },
    { token: '--page-inset-widgets', use: 'Space around a widget page (homepage, Handbook). Deliberately tighter than ordinary pages: the panels already frame their content.' },
    { token: '--layout-gutter', use: 'The default space between widgets on a widget page: sidebar and content, the 70/30 columns, stacked banners. Not a rule for spacing inside a widget, which uses the spacing scale.' }
  ];

  const radii = [
    { token: '--radius-sm', name: 'Small', use: 'Chips, tags and inset swatches.' },
    { token: '--radius-item', name: 'Item', use: 'Items inside a panel: navigation links, options, fields, previews.' },
    { token: '--radius-md', name: 'Control', use: 'Buttons and icon buttons.' },
    { token: '--radius-card', name: 'Card', use: 'Cards and option groups inside a panel: game tiles, palette options.' },
    { token: '--radius-panel', name: 'Panel', use: 'Panels on the page: the sidebar, homepage widgets, Settings cards, placeholders.' },
    { token: '--radius-dialog', name: 'Dialog', use: 'Dialogs.' },
    { token: '--radius-pill', name: 'Pill', use: 'Pill buttons, tabs, status chips.' }
  ];

  const shadows = [
    { token: '--shadow-raised', name: 'Raised', use: 'A panel lifted slightly off the page: the sidebar rail on the homepage and in the Handbook.' },
    { token: '--shadow-popover', name: 'Popover', use: 'A panel opened over the page and dismissed by clicking away: the Admin Mode panel.' },
    { token: '--shadow-dialog', name: 'Dialog', use: 'A modal dialog above the overlay: the Admin Mode publish dialog.' }
  ];

  const surfaces = [
    { id: 'panel', name: 'Panel', radius: '--radius-panel', use: 'Surface background, 1px border, panel radius. Padding 16–24px (32px when standalone).', where: 'Sidebar, Atlas Navigation, carousel, Settings cards, placeholders, Studio environment cards' },
    { id: 'card', name: 'Card', radius: '--radius-card', use: 'Inside a panel: surface or page background, 1px border, card radius.', where: 'Game tiles, palette options, the empty carousel track' },
    { id: 'item', name: 'Item', radius: '--radius-item', use: 'A row or option inside a panel; hover uses the hover surface, selected the soft accent.', where: 'Sidebar links, mode options, palette previews, fields' },
    { id: 'control', name: 'Control', radius: '--radius-md', use: 'Buttons: an accent fill (primary) or a 1px border (secondary); pills use the pill radius.', where: 'Menu button, carousel buttons, placeholder actions' },
    { id: 'dialog', name: 'Dialog', radius: '--radius-dialog', shadow: '--shadow-dialog', use: 'Surface, 1px border, dialog radius and shadow, above the overlay.', where: 'Admin Mode publish dialog, Studio dialogs' },
    { id: 'framed', name: 'Framed panel', radius: '--radius-panel', shadow: '--shadow-raised', use: 'A panel that introduces a page: 1.5px accent border, a thin inner line 7px in, an accent glow on the surface.', where: 'Page Heading' },
    { id: 'raised', name: 'Raised panel', radius: '--radius-panel', shadow: '--shadow-raised', use: 'A panel that floats beside the content.', where: 'Sidebar rail (homepage, Handbook, Studio), canvas nodes and their panel, widgets being edited, floating canvas controls' }
  ];

  const notYet = [
    { what: 'Component steps 6, 10 and 14px', why: 'Deliberate in-between values (tight icon rows, header and banner spacing). They stay literal rather than become extra scale steps.' },
    { what: 'Adopting the spacing scale everywhere', why: 'Most 4/8/12/16/20/24/32px values already match the scale; rewriting them adds churn without changing anything. New CSS uses the tokens.' },
    { what: 'Border widths', why: 'Surfaces use a 1px border; 1.5px marks emphasis (selected tiles, Featured cards). Two widths, no token needed yet.' },
    { what: 'Accent-tinted borders and disabled opacity', why: 'Ten different mixes and five opacities today; standardising them would change visuals. Kept as they are by decision.' },
    { what: 'Other shadows', why: 'Accent glows on hover, the Featured cards’ artwork treatment, and Admin Mode’s bar, drawer and drag shadows are specific to one component.' }
  ];

  const api = { spacing, frame, radii, shadows, surfaces, notYet };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonDesign = root.PergamonDesign || {}; root.PergamonDesign.surfaces = api; }
})(typeof window !== 'undefined' ? window : globalThis);
