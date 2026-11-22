// Atlas typography registry (Handbook H1): the single source of truth for
// the semantic type roles. Nothing else writes typography values:
//
//   this file ──► tools/build-typography.mjs ──► styles/typography.css
//                  (generated tokens + .pa-type-* classes; never edit it)
//   this file ──► the Handbook (/handbook/), which reads the role metadata
//                  here and the live values from the generated CSS
//
// tests/design/typography.test.mjs fails if the generated CSS is stale, if a
// family stack here differs from styles/theme.css, or if an `adoption` claim
// below doesn't match the CSS it points at. So the registry, the stylesheet
// and the Handbook can't drift apart.
//
// Shape (version 1). Plain data, so a future Handbook editor can load it,
// change it as a draft, run validate() and publish it as a new version:
//   families[id]  { label, token, owner, configured, stack, weights, loading, status, note }
//   roles[]       { id, name, kind, of?, status, use, restrictions[], family,
//                   size, weight, leading, tracking, transform, numeric?,
//                   responsive[], preview, adoption[] }
//     kind        'role' (global) | 'variant' (a controlled variation of `of`)
//                 | 'exception' (approved, documented, one place only)
//     variants    list only the values that differ from their base role; the
//                 rest are inherited (filled in below, listed in `inherits`),
//                 and their generated tokens point at the base role's, so a
//                 change to the base reaches the variant too
//     status      'active' | 'legacy' (describes styling that awaits migration)
//     responsive  { type: 'media', query, size } — applied by the generated CSS
//                 { type: 'container', container, query, size, name } — a
//                   --type-<role>-size-<name> token; the generated CSS applies it
//                   to .pa-type-* elements in that named container, and a
//                   component's own container rule uses the same token
//                 { type: 'note', text } — behaviour the tokens don't carry yet
//     adoption    where the site's existing CSS has this role today:
//                 { file, selector, status, current?, note? }
//                   'adopted'     the selector uses the role's tokens, so it
//                                 follows any change to the role
//                   'equivalent'  same declared values, not yet linked
//                   'pending'     differs; `current` records today's values
//                                 (verified by the test), normalisation pending
//                   'legacy'      legacy page styling, migration not started
//     consumers   widgets that use the role (empty until widgets are registered)
// Works in the browser (window.PergamonDesign.typography) and in Node.
(function (root) {
  'use strict';

  const VERSION = 1;

  const families = {
    display: {
      label: 'Display',
      token: '--font-display',
      owner: 'styles/theme.css',
      configured: 'Roboto Slab',
      stack: ['"Aptos Slab"', '"Roboto Slab"', 'Rockwell', 'Georgia', 'serif'],
      weights: [700, 800],
      loading: 'Roboto Slab from Google Fonts (700, 800). Aptos Slab only when installed on the device.',
      status: 'active',
      note: 'Titles and headings. Aptos Slab, first in the stack, replaces Roboto Slab on devices that have it; Rockwell, the next fallback, is about 25% wider.'
    },
    ui: {
      label: 'Interface',
      token: '--font-ui',
      owner: 'styles/theme.css',
      configured: 'Manrope',
      stack: ['"Manrope"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
      weights: [400, 500, 600, 700, 800],
      loading: 'Manrope from Google Fonts (400–800).',
      status: 'active',
      note: 'Everything that is not a title: body text, labels, buttons, navigation, numbers. Fallbacks are within a few percent of Manrope’s width.'
    },
    'legacy-serif': {
      label: 'Legacy serif',
      token: '--font-legacy-serif',
      owner: 'styles/typography.css',
      configured: 'Georgia',
      stack: ['Georgia', 'serif'],
      weights: [400, 700],
      loading: 'Not loaded: the device’s Georgia (often missing on Android and Linux).',
      status: 'legacy',
      note: 'Used by the game pages and the games catalogue today. Documented so game titles can be described; no new styling may use it.'
    }
  };

  const FEATURE_CONTAINER = 'upper';

  const roles = [
    {
      id: 'page-title', name: 'Page title', kind: 'role', status: 'active',
      use: 'The one <h1> of a page.',
      restrictions: ['Once per page.', 'Not for game pages until the game header migrates (see Game title).'],
      family: 'display', size: 'clamp(28px, 4vw, 40px)', weight: 800, leading: '1.15', tracking: 'normal', transform: 'none',
      responsive: [{ type: 'note', text: 'Fluid with the viewport: 28px at 700px wide and below, 40px at 1000px and above.' }],
      preview: { text: 'Settings' },
      adoption: [
        { file: 'styles/settings.css', selector: '.settings-title', status: 'equivalent' },
        { file: 'suggestions/index.html', selector: '.pa-main h1', status: 'equivalent' },
        { file: 'styles/placeholder.css', selector: '.pa-placeholder h1', status: 'pending',
          current: { size: 'clamp(28px, 4vw, 38px)' }, note: 'Placeholder pages top out at 38px; normalising to 40px is pending approval.' }
      ]
    },
    {
      id: 'section-title', name: 'Section title', kind: 'role', status: 'active',
      use: 'Section headings (<h2>) inside a page or panel.',
      restrictions: ['Use the large variant only for a page’s main content sections, such as the homepage carousel.'],
      family: 'display', size: '20px', weight: 700, leading: '1.2', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Atlas Navigation' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-context-title', status: 'adopted', note: 'Atlas Navigation panel heading.' },
        { file: 'operation/styles/footer.css', selector: '.footer-brand h3', status: 'equivalent', note: 'The footer brand uses this style; it should stop being a heading (see the heading-structure decision).' },
        { file: 'styles/settings.css', selector: '.settings-heading', status: 'pending', current: { leading: '1.3' } },
        { file: 'styles/account.css', selector: '.account-heading', status: 'pending', current: { size: '23px', leading: '1.3' } },
        { file: 'styles/cms-admin.css', selector: '.cms-drawer-prompt-title', status: 'pending', current: { weight: 800, leading: '1.25' } }
      ]
    },
    {
      id: 'section-title-large', name: 'Section title, large', kind: 'variant', of: 'section-title', status: 'active',
      use: 'A page’s main content section heading, and dialog titles.',
      restrictions: ['At most one level above Section title; never instead of the Page title.'],
      size: '22px',
      responsive: [{ type: 'container', container: 'lower', query: '(max-width: 640px)', size: '18px', name: 'narrow' }],
      preview: { text: 'Explore More Games' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-carousel-title', status: 'adopted', note: 'Games carousel heading; 18px when its section is 640px wide or less.' },
        { file: 'styles/cms-admin.css', selector: '.cms-drawer-title', status: 'pending', current: { weight: 800 } },
        { file: 'styles/cms-admin.css', selector: '.cms-publish-title', status: 'pending', current: { weight: 800 } }
      ]
    },
    {
      id: 'card-title', name: 'Card title', kind: 'role', status: 'active',
      use: 'The title of a game or content card.',
      restrictions: ['One line; truncate rather than wrap inside fixed-size cards.'],
      family: 'display', size: '16px', weight: 700, leading: '1.25', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Connect Four' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-tile-title', status: 'adopted', note: 'Games carousel cards.' },
        { file: 'games/index.html', selector: '.feat-name', status: 'legacy', current: { size: '15px' }, note: 'Games catalogue cards: Georgia 15px (inherited family).' }
      ]
    },
    {
      id: 'item-title', name: 'Item title', kind: 'role', status: 'active',
      use: 'The label of a row in a list or panel: navigation rows, palette names, managed cards.',
      restrictions: ['Pair with Caption for a second line.'],
      family: 'ui', size: '15px', weight: 700, leading: '1.5', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Login / Sign Up' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-context-label', status: 'adopted', note: 'Atlas Navigation rows.' },
        { file: 'styles/settings.css', selector: '.palette-name', status: 'equivalent' },
        { file: 'styles/cms-admin.css', selector: '.cms-manage-name', status: 'pending', current: { weight: 400 }, note: 'Inherits weight 400.' }
      ]
    },
    {
      id: 'body', name: 'Body', kind: 'role', status: 'active',
      use: 'Paragraphs and the default text of every page.',
      restrictions: ['Keep lines at or under about 70 characters for long text.'],
      family: 'ui', size: '16px', weight: 400, leading: '1.5', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Choose how PergamonAtlas looks on this device. Your choices apply to every page.' },
      adoption: [
        { file: 'styles/theme.css', selector: 'body', status: 'equivalent', note: 'Size is the browser default (16px).' },
        { file: 'styles/settings.css', selector: '.settings-intro', status: 'equivalent' },
        { file: 'styles/placeholder.css', selector: '.pa-placeholder p', status: 'pending', current: { leading: '1.6' } },
        { file: 'suggestions/index.html', selector: '.pa-main p', status: 'pending', current: { size: '17px', leading: '1.6' } }
      ]
    },
    {
      id: 'body-small', name: 'Body, small', kind: 'role', status: 'active',
      use: 'Supporting paragraphs: notes, dialog text, form introductions.',
      restrictions: ['Not for the main text of a page.'],
      family: 'ui', size: '14px', weight: 400, leading: '1.5', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Guests use Obsidian & Gold. Sign in to choose another palette.' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-track-empty p', status: 'adopted', note: 'Games carousel message for an empty category.' },
        { file: 'styles/settings.css', selector: '.settings-note', status: 'equivalent' },
        { file: 'styles/account.css', selector: '.account-intro', status: 'equivalent' },
        { file: 'styles/cms-admin.css', selector: '.cms-publish-body', status: 'equivalent' }
      ]
    },
    {
      id: 'caption', name: 'Caption', kind: 'role', status: 'active',
      use: 'Metadata and secondary lines: categories, descriptions under item titles, storage notes.',
      restrictions: ['Use the secondary text colour.', 'Not for anything a visitor must read to complete a task (use Body, small).'],
      family: 'ui', size: '13px', weight: 400, leading: '1.5', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Sign in or create an account' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-context-desc', status: 'adopted', note: 'Atlas Navigation row descriptions.' },
        { file: 'styles/settings.css', selector: '.settings-storage', status: 'equivalent' },
        { file: 'styles/home.css', selector: '.home-tile-category', status: 'pending', current: { weight: 500 } }
      ]
    },
    {
      id: 'label', name: 'Label', kind: 'role', status: 'active',
      use: 'Short uppercase tags and eyebrows: “Coming soon”, card states, drawer eyebrows.',
      restrictions: ['A few words at most.', 'Never for sentences.'],
      family: 'ui', size: '12px', weight: 700, leading: '1.5', tracking: '0.08em', transform: 'uppercase',
      responsive: [],
      preview: { text: 'Coming soon' },
      adoption: [
        { file: 'styles/placeholder.css', selector: '.pa-placeholder .pa-placeholder-tag', status: 'equivalent' },
        { file: 'styles/home.css', selector: '.home-track-tag', status: 'adopted', note: 'Games carousel “Coming soon” tags.' },
        { file: 'styles/cms-admin.css', selector: '.cms-drawer-eyebrow', status: 'equivalent' },
        { file: 'styles/home.css', selector: '.home-art-label', status: 'pending', current: { weight: 600 } },
        { file: 'styles/layout.css', selector: '.pa-sidebar-heading', status: 'pending', current: { weight: 600, tracking: '0.04em' } },
        { file: 'styles/cms-admin.css', selector: '.cms-admin-label', status: 'pending', current: { tracking: '0.06em' } }
      ]
    },
    {
      id: 'nav', name: 'Navigation', kind: 'role', status: 'active',
      use: 'Header, sidebar and footer links.',
      restrictions: ['Navigation only; tabs and filters use Tab.'],
      family: 'ui', size: '15px', weight: 600, leading: '1', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Games' },
      adoption: [
        { file: 'styles/layout.css', selector: '.pa-sidebar a, .pa-sidebar-toggle', status: 'adopted', note: 'Sidebar links and its expand/collapse button.' },
        { file: 'styles/layout.css', selector: '.pa-nav a', status: 'adopted', note: 'Header navigation. The link’s height is fixed, so line height 1 doesn’t move it.' },
        { file: 'operation/styles/footer.css', selector: '.footer-links a', status: 'pending', current: { leading: '1.5' }, note: 'Inherits line height 1.5; with no fixed height, line height 1 would make the links shorter.' }
      ]
    },
    {
      id: 'tab', name: 'Tab', kind: 'variant', of: 'nav', status: 'active',
      use: 'Category filters, tab lists and segmented controls.',
      restrictions: [],
      size: '14px', leading: 'normal',
      responsive: [],
      preview: { text: 'All Games' },
      adoption: [
        { file: 'styles/home.css', selector: '.home-tab', status: 'adopted', note: 'Games carousel category tabs.' },
        { file: 'styles/account.css', selector: '.account-tab', status: 'equivalent' },
        { file: 'styles/settings.css', selector: '.mode-option', status: 'pending', current: { size: '15px' } }
      ]
    },
    {
      id: 'button', name: 'Button', kind: 'role', status: 'active',
      use: 'Labels of buttons and button-like links.',
      restrictions: ['Sentence case.', 'The Featured card’s Play button is an approved exception (Feature call to action).'],
      family: 'ui', size: '15px', weight: 700, leading: '1', tracking: 'normal', transform: 'none',
      responsive: [],
      preview: { text: 'Publish changes' },
      adoption: [
        { file: 'styles/cms-admin.css', selector: '.cms-admin-publish', status: 'equivalent' },
        { file: 'styles/account.css', selector: '.account-submit', status: 'pending', current: { size: '17px', leading: 'normal' } }
      ]
    },
    {
      id: 'button-small', name: 'Button, small', kind: 'variant', of: 'button', status: 'active',
      use: 'Compact buttons in drawers, dialogs and lists.',
      restrictions: [],
      size: '14px',
      responsive: [],
      preview: { text: 'Save draft' },
      adoption: [
        { file: 'styles/cms-admin.css', selector: '.cms-drawer-primary, .cms-drawer-secondary, .cms-drawer-ghost', status: 'equivalent' }
      ]
    },
    {
      id: 'numeric', name: 'Numeric', kind: 'role', status: 'active',
      use: 'Numbers that change or line up: scores, counters, clocks.',
      restrictions: ['Takes its size from the context; it fixes the figures’ width and weight only.'],
      family: 'ui', size: 'inherit', weight: 700, leading: 'inherit', tracking: 'normal', transform: 'none', numeric: 'tabular-nums',
      responsive: [],
      preview: { text: '1,284 · 03:59' },
      adoption: [
        { file: 'styles/theme.css', selector: '.pa-numeric', status: 'equivalent', note: 'Defined but not used by any page yet.' },
        { file: 'games/battleship/index.html', selector: '.score-item .val', status: 'legacy', current: { size: '26px', weight: 800 }, note: 'Game scores: Georgia, 22–28px across games.' },
        { file: 'games/connect-four/index.html', selector: '.score-item .val', status: 'legacy', current: { size: '28px', weight: 800 } }
      ]
    },
    {
      id: 'game-title', name: 'Game title', kind: 'role', status: 'legacy',
      use: 'The title in a game page’s header and the games catalogue header.',
      restrictions: ['Describes the current game header; migration to the Atlas fonts awaits approval.', 'Do not use on new pages.'],
      family: 'legacy-serif', size: 'clamp(32px, 9cqi, 68px)', weight: 700, leading: '1', tracking: '0.01em', transform: 'none',
      responsive: [
        { type: 'media', query: '(max-width: 1200px)', size: 'clamp(22px, 9cqi, 46px)' },
        { type: 'media', query: '(max-width: 560px)', size: 'clamp(16px, 9cqi, 30px)' },
        { type: 'note', text: 'Sizes follow the title area’s width (cqi). Snake, Tic-Tac-Toe and the catalogue add a 1300px step and drop to 21px at 390px; the other games don’t, so phones show 24.5px or 21px.' }
      ],
      preview: { text: 'Connect Four', container: 'inline', width: 520, surface: 'game' },
      adoption: [
        { file: 'games/battleship/index.html', selector: '.gh-hero .game-hero-title h2', status: 'legacy', note: 'One of five identical copies (Battleship, Blackjack, Breakout, Connect Four, Pong).' },
        { file: 'games/connect-four/index.html', selector: '.gh-hero .game-hero-title h2', status: 'legacy' },
        { file: 'operation/styles/main.css', selector: '.game-hero-title h2', status: 'legacy', current: { size: 'clamp(36px, 4.5vw, 58px)' }, note: 'Base rule; every game header overrides its size.' }
      ]
    },
    {
      id: 'brand', name: 'Brand', kind: 'exception', status: 'active',
      use: 'The site name in the header.',
      restrictions: ['Header only.'],
      family: 'display', size: '28px', weight: 800, leading: '1', tracking: '-0.01em', transform: 'none',
      responsive: [
        { type: 'media', query: '(max-width: 1100px)', size: '23px' },
        { type: 'media', query: '(max-width: 900px)', size: '20px' },
        { type: 'media', query: '(max-width: 420px)', size: '17px' },
        { type: 'note', text: 'Hidden at 360px and below (and below 375px when Admin Mode adds header buttons).' }
      ],
      preview: { text: 'PergamonAtlas' },
      adoption: [{ file: 'styles/layout.css', selector: '.pa-brand-name', status: 'adopted', note: 'Header. On phones the admin header shrinks it to 15px (layout.css), outside the role.' }]
    },
    {
      id: 'feature-title', name: 'Feature title', kind: 'exception', status: 'active',
      use: 'The title on the homepage’s Featured card.',
      restrictions: ['Featured card only: always on dark artwork, in fixed ivory with a shadow (home.css).'],
      family: 'display', size: 'clamp(38px, 5.6cqi, 50px)', weight: 800, leading: '1', tracking: '0.005em', transform: 'none',
      responsive: [{ type: 'container', container: FEATURE_CONTAINER, query: '(max-width: 640px)', size: 'clamp(30px, 10cqi, 40px)', name: 'narrow' }],
      preview: { text: 'Chess Forge', container: FEATURE_CONTAINER, width: 700, surface: 'feature' },
      adoption: [{ file: 'styles/home.css', selector: '.home-feature-title', status: 'adopted', note: 'Featured card.' }]
    },
    {
      id: 'spotlight-title', name: 'Spotlight title', kind: 'variant', of: 'feature-title', status: 'active',
      use: 'The title on the homepage’s Spotlight card.',
      restrictions: ['Spotlight card only.'],
      size: 'clamp(26px, 3.6cqi, 32px)',
      responsive: [{ type: 'container', container: FEATURE_CONTAINER, query: '(max-width: 640px)', size: 'clamp(24px, 7.5cqi, 30px)', name: 'narrow' }],
      preview: { text: 'Connect Four', container: FEATURE_CONTAINER, width: 700, surface: 'feature' },
      adoption: [{ file: 'styles/home.css', selector: '.home-feature--spotlight .home-feature-title', status: 'adopted', note: 'Spotlight card.' }]
    },
    {
      id: 'feature-cta', name: 'Feature call to action', kind: 'exception', status: 'active',
      use: 'The Play button on the Featured and Spotlight cards.',
      restrictions: ['Featured and Spotlight cards only.'],
      family: 'display', size: '19px', weight: 800, leading: '1', tracking: '0.04em', transform: 'uppercase',
      responsive: [],
      preview: { text: 'Play now', surface: 'feature' },
      adoption: [{ file: 'styles/home.css', selector: '.home-feature .home-feature-play', status: 'adopted', note: 'Featured card.' }]
    },
    {
      id: 'spotlight-cta', name: 'Spotlight call to action', kind: 'variant', of: 'feature-cta', status: 'active',
      use: 'The Play button on the Spotlight card: the Feature call to action, smaller.',
      restrictions: ['Spotlight card only.'],
      size: '16px',
      responsive: [],
      preview: { text: 'Play now', surface: 'feature' },
      adoption: [{ file: 'styles/home.css', selector: '.home-feature--spotlight .home-feature-play', status: 'adopted', note: 'Spotlight card.' }]
    }
  ];

  // Game-specific glyphs (board pieces, card faces, canvas text) belong to
  // each game. They are documented exceptions without tokens.
  const glyphExceptions = [
    { where: 'Tic-Tac-Toe cells, card faces, chess pieces and coordinates', note: 'Part of each game’s look; set by the game.' },
    { where: 'Canvas text in Pong and Snake', note: 'Drawn by the game in Georgia (pong:230, snake:473-498).' }
  ];

  // ── Tokens ────────────────────────────────────────────────────────────
  const PROPS = ['family', 'size', 'weight', 'leading', 'tracking', 'transform'];
  const token = (id, prop) => `--type-${id}-${prop}`;

  // A variant takes every value it doesn't set from its base role.
  function inherit(list) {
    for (const r of list) {
      if (r.kind !== 'variant' || r.inherits) continue;
      const base = list.find(x => x.id === r.of);
      if (!base) continue;
      r.inherits = PROPS.filter(p => r[p] === undefined);
      r.inherits.forEach(p => { r[p] = base[p]; });
    }
    return list;
  }
  inherit(roles);
  // The CSS value of one property (family as the family token).
  function value(role, prop) {
    if (prop === 'family') return `var(${families[role.family].token})`;
    return String(role[prop]);
  }

  // ── Validation (also for a future editor's drafts) ────────────────────
  const KINDS = ['role', 'variant', 'exception'];
  const STATUSES = ['active', 'legacy'];
  const ADOPTION = ['adopted', 'equivalent', 'pending', 'legacy'];
  const ID = /^[a-z][a-z0-9-]{1,40}$/;
  const SIZE = /^(inherit|\d+(\.\d+)?px|clamp\(\s*\d+(\.\d+)?px\s*,\s*\d+(\.\d+)?(vw|cqi)\s*,\s*\d+(\.\d+)?px\s*\))$/;
  const LEADING = /^(inherit|normal|\d+(\.\d+)?)$/;
  const TRACKING = /^(normal|-?\d+(\.\d+)?em)$/;

  function validate(reg) {
    const errors = [];
    const err = (at, msg) => errors.push(`${at}: ${msg}`);
    if (!reg || reg.version !== VERSION) err('registry', `version must be ${VERSION}`);
    const fams = (reg && reg.families) || {};
    for (const [id, f] of Object.entries(fams)) {
      if (!/^--font-[a-z-]+$/.test(f.token || '')) err(`families.${id}`, 'token must look like --font-name');
      if (!Array.isArray(f.stack) || !f.stack.length) err(`families.${id}`, 'stack must list at least one font');
      if (!Array.isArray(f.weights) || !f.weights.length) err(`families.${id}`, 'weights must list the loaded weights');
    }
    const ids = new Set();
    for (const r of (reg && reg.roles) || []) {
      const at = `roles.${r.id}`;
      if (!ID.test(r.id || '')) err(at, 'id must be lower-case words joined by hyphens');
      if (ids.has(r.id)) err(at, 'duplicate id');
      ids.add(r.id);
      if (!KINDS.includes(r.kind)) err(at, `kind must be one of ${KINDS.join(', ')}`);
      if (!STATUSES.includes(r.status)) err(at, `status must be one of ${STATUSES.join(', ')}`);
      if (!r.name || !r.use) err(at, 'name and use are required');
      const fam = fams[r.family];
      if (!fam) err(at, `unknown family "${r.family}"`);
      else if (fam.status === 'legacy' && r.status !== 'legacy') err(at, 'only legacy roles may use a legacy family');
      if (!SIZE.test(String(r.size))) err(at, `size "${r.size}" must be px, inherit or clamp(px, vw|cqi, px)`);
      if (fam && !fam.weights.includes(r.weight)) err(at, `weight ${r.weight} is not loaded for ${fam.label} (${fam.weights.join(', ')})`);
      if (!LEADING.test(String(r.leading))) err(at, `leading "${r.leading}" must be a number, normal or inherit`);
      if (!TRACKING.test(String(r.tracking))) err(at, `tracking "${r.tracking}" must be normal or em`);
      if (!['none', 'uppercase'].includes(r.transform)) err(at, 'transform must be none or uppercase');
      if (r.numeric && r.numeric !== 'tabular-nums') err(at, 'numeric must be tabular-nums');
      for (const s of r.responsive || []) {
        if (s.type === 'note') continue;
        if (!['media', 'container'].includes(s.type)) err(at, `responsive type "${s.type}"`);
        if (!/^\((max|min)-width: \d+px\)$/.test(s.query || '')) err(at, `responsive query "${s.query}"`);
        if (!SIZE.test(String(s.size))) err(at, `responsive size "${s.size}"`);
        if (s.type === 'container' && !ID.test(s.container || '')) err(at, 'container steps need a container name');
        if (s.type === 'container' && !ID.test(s.name || '')) err(at, 'container steps need a step name (for their token)');
      }
      for (const a of r.adoption || []) {
        if (!ADOPTION.includes(a.status)) err(at, `adoption status "${a.status}"`);
        if (!a.file || !a.selector) err(at, 'adoption entries need file and selector');
      }
    }
    for (const r of (reg && reg.roles) || []) {
      if (r.kind === 'variant' && !ids.has(r.of)) err(`roles.${r.id}`, `variant of unknown role "${r.of}"`);
      const base = r.kind === 'variant' && reg.roles.find(x => x.id === r.of);
      if (base && base.kind === 'variant') err(`roles.${r.id}`, 'the base of a variant must be a role or exception');
      if (base) for (const p of r.inherits || []) if (r[p] !== base[p]) err(`roles.${r.id}`, `inherits ${p} from ${r.of} but has a different value`);
      if (r.kind !== 'variant' && r.of) err(`roles.${r.id}`, 'only variants name a parent');
    }
    return errors;
  }

  const registry = { version: VERSION, families, roles, glyphExceptions };
  const api = { registry, PROPS, token, value, validate, inherit, role: id => roles.find(r => r.id === id) || null };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PergamonDesign = root.PergamonDesign || {};
    root.PergamonDesign.typography = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
