// Atlas colour roles: what each semantic colour is for. Documentation only:
// the values live in /styles/theme.css (four palettes × dark / light, six
// base colours each; the derived roles are computed from them there), and
// /scripts/theme.js chooses the palette and mode. The Handbook's Colors page
// reads this list and shows each role's live value under every palette;
// tests/design/colors.test.mjs checks that this list and theme.css agree.
//
//   roles       { id, token, group: 'base' | 'derived', name, use, from? }
//   contrast    text and interface pairs checked under every palette and mode:
//               { fg, bg, over?, kind: 'text' (4.5:1) | 'ui' (3:1), what }
//               `over`: the colour behind a translucent `bg` (soft accent)
//   exceptions  approved colours that deliberately don't follow the palette
// Works in the browser (window.PergamonDesign.colors) and in Node.
(function (root) {
  'use strict';

  const roles = [
    { id: 'background', token: '--color-background', group: 'base', name: 'Page background', use: 'Behind everything: the page, and insets inside panels (fields, tiles, previews).' },
    { id: 'surface', token: '--color-surface', group: 'base', name: 'Surface', use: 'Panels, cards, the sidebar, the header’s menus and dialogs.' },
    { id: 'border', token: '--color-border', group: 'base', name: 'Border', use: 'Panel, card and field outlines; dividers.' },
    { id: 'accent', token: '--color-accent', group: 'base', name: 'Accent', use: 'The palette’s signature colour: primary buttons, selected outlines, focus, decorative rules.' },
    { id: 'text-primary', token: '--color-text-primary', group: 'base', name: 'Primary text', use: 'Headings and body text.' },
    { id: 'text-secondary', token: '--color-text-secondary', group: 'base', name: 'Secondary text', use: 'Supporting text, metadata, inactive navigation and icons.' },
    { id: 'surface-hover', token: '--color-surface-hover', group: 'derived', name: 'Hover surface', use: 'A row, link or button under the pointer.', from: 'Surface with 6% primary text' },
    { id: 'accent-hover', token: '--color-accent-hover', group: 'derived', name: 'Accent hover', use: 'A primary (accent) button under the pointer.', from: 'Accent with 16% primary text; Obsidian light: accent with 16% white, so its dark label stays readable' },
    { id: 'accent-soft', token: '--color-accent-soft', group: 'derived', name: 'Soft accent', use: 'The selected state: current navigation item, pressed tab, chosen option (with accent text and, often, an accent outline).', from: 'Accent at 14% opacity' },
    { id: 'accent-text', token: '--color-accent-text', group: 'derived', name: 'Accent text', use: 'Accent used as text or an icon: links, selected labels, small headings.', from: 'Accent; in light mode darkened (78% accent, black) to stay readable on the soft accent' },
    { id: 'on-accent', token: '--color-on-accent', group: 'derived', name: 'On accent', use: 'Text and icons on an accent fill (primary buttons, switches).', from: 'Background in dark mode; white in light mode, except Obsidian light: a dark ink (white on its gold is only 3.7:1)' },
    { id: 'focus', token: '--color-focus', group: 'derived', name: 'Focus', use: 'The keyboard focus outline (2px, offset 2px).', from: 'Accent' },
    { id: 'danger', token: '--color-danger', group: 'derived', name: 'Danger', use: 'Errors and destructive actions.', from: 'Fixed per mode (the same in every palette)' },
    { id: 'success', token: '--color-success', group: 'derived', name: 'Success', use: 'Confirmations.', from: 'Fixed per mode (the same in every palette)' },
    { id: 'overlay', token: '--color-overlay', group: 'derived', name: 'Overlay', use: 'Dims the page behind a modal layer: the phone menu, Admin Mode dialogs.', from: 'Black at 55% (every palette and mode)' }
  ];

  const contrast = [
    { fg: 'text-primary', bg: 'background', kind: 'text', what: 'Body text on the page' },
    { fg: 'text-primary', bg: 'surface', kind: 'text', what: 'Body text in a panel' },
    { fg: 'text-secondary', bg: 'background', kind: 'text', what: 'Secondary text on the page' },
    { fg: 'text-secondary', bg: 'surface', kind: 'text', what: 'Secondary text in a panel' },
    { fg: 'accent-text', bg: 'surface', kind: 'text', what: 'Links and accent labels in a panel' },
    { fg: 'accent-text', bg: 'accent-soft', over: 'surface', kind: 'text', what: 'Selected item label (soft accent in a panel)' },
    { fg: 'on-accent', bg: 'accent', kind: 'text', what: 'Primary button label' },
    { fg: 'on-accent', bg: 'accent-hover', kind: 'text', what: 'Primary button label, hover' },
    { fg: 'accent', bg: 'surface', kind: 'ui', what: 'Accent outlines, icons and focus in a panel' },
    { fg: 'accent', bg: 'background', kind: 'ui', what: 'Focus outline on the page' }
  ];

  const exceptions = [
    { where: 'Featured Content and Spotlight (styles/components/feature-banner.css)', colors: 'Card base #0A0806, title ivory #F8EFDD, button ink #16110A, dark shade gradients',
      why: 'Artwork-led: the cards always show dark artwork, in every palette and mode, so their text and shading are fixed for legibility on it. Only the accent (rules, button, border, glow) follows the palette; in light mode it is lifted so it still reads as lit.' },
    { where: 'Spotlight edge colour (CMS field “Edge colour”, art.base)', colors: 'Chosen per card, e.g. #030916',
      why: 'Content-controlled: it blends the card into the edges of its own artwork, so it belongs to the picture, not the theme.' },
    { where: 'Danger and success (styles/theme.css)', colors: 'Per mode, not per palette',
      why: 'Status colours must mean the same thing in every palette.' },
    { where: 'Admin Mode (styles/cms-admin.css)', colors: 'Light-mode error / success text, the “unsaved” amber, black shadows',
      why: 'Administrative status signals tuned for legibility; not part of the public site.' },
    { where: 'Service logos (scripts/studio/connections/registry.js)', colors: 'Each service’s own brand colour',
      why: 'A logo is recognised by its colour; one-colour marks follow the text colour.' },
    { where: 'Handbook samples (styles/handbook.css)', colors: 'Fixed dark stages for the feature and game typography samples',
      why: 'They show those roles on the surfaces they are designed for.' }
  ];

  const api = { roles, contrast, exceptions, role: id => roles.find(r => r.id === id) || null };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.PergamonDesign = root.PergamonDesign || {}; root.PergamonDesign.colors = api; }
})(typeof window !== 'undefined' ? window : globalThis);
