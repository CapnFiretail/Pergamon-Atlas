# Atlas Handbook

An internal, read-only design-system catalogue for administrators, at
`/handbook/`, inside the normal site (header, footer, themes). Its sections
are **Overview** (Dashboard, Vision), **Foundations** (Typography, Colors,
Spacing & Surfaces, Atlas Grid; Motion planned) and **Library** (Widgets; Elements and Layouts
planned).

**The long-term architecture is defined in [`ATLAS_VISION.md`](ATLAS_VISION.md)**,
the canonical, living vision for the design system, widgets, page builder and
admin tools. This file describes what is built. The vision is also readable
inside the Handbook (Vision & Architecture), generated from that file.
[`ARCHITECTURE_REVIEW_H1.md`](ARCHITECTURE_REVIEW_H1.md) compares H1 with the
vision and lists recommendations for later phases.

## Status: implemented, planned, long-term

| | What | Phase |
|---|---|---|
| **Implemented** | Admin-only `/handbook/` and the header's book icon | H1 |
| | Typography registry, generated tokens and `.pa-type-*` classes, alignment tests | H1 |
| | Overview, Foundations › Typography (live specimens, values, usage, exceptions) | H1 |
| | Vision & Architecture (this vision, rendered from the repository) | H1 |
| **Implemented** | Header, sidebar, homepage widgets, Settings, Account and footer take matching styles from the roles | H2 |
| **Implemented** | Handbook redesign: catalogue Dashboard, Typography specimens, Widgets catalogue; Handbook sections in the shared site sidebar | H3 |
| | Site Navigation: the sidebar's links, edited in Admin Mode, published with the homepage (`site.sidebar`, migration 0013) | H3 |
| **Planned** | Review of the remaining typography differences; Admin Mode typography; legacy game typography | H2 |
| | Motion, Responsive, Accessibility | H5 |
| **Implemented** | Component library: Feature banner (hero, banner), Content Card, Carousel, extracted from the homepage and previewed live in the Handbook | H4 |
| **Implemented** | Foundations › Colors: colour roles, previews that resolve every role per palette and mode, live contrast checks | H5.2a |
| | Foundations › Spacing & Surfaces: spacing scale, page frame (insets, widget gutter), radii and elevation tokens | H5.2b |
| | Atlas Grid foundation: 20-column square-cell layout model, widget sizing contracts, validation, read-only renderer; Foundations › Atlas Grid (no page uses it yet) | H5.2c |
| **Long-term** | Element and widget registry with dependencies and automatic where-used | H4+ |
| | Page model, templates and layout constraints | H5 |
| | Visual editing: drafts, preview, validation, publish, rollback | H6 |
| | Hybrid template + blank-grid page builder | H7 |

Planned and long-term items follow the vision's roadmap (section 11); they are
sequencing intentions, not commitments. The same status table closes
`ATLAS_VISION.md`; update both when a phase lands.

## Files

| File | Role |
|---|---|
| `PergamonAtlas.V1/handbook/index.html` | The page: shared header, sidebar, footer and themes; an empty `#handbook-root` until access is decided. `noindex`. |
| `PergamonAtlas.V1/scripts/handbook/entry.js` | Administrator check and the header's book icon. Loaded on the homepage and the Handbook. |
| `PergamonAtlas.V1/scripts/handbook/gate.js` | Shows the Handbook (and only then loads its code) or a generic access-denied notice. |
| `PergamonAtlas.V1/scripts/handbook/handbook.js` | App shell: the sections (`GROUPS`, shown in the site sidebar), hash routes, breadcrumbs, the Dashboard, group and planned pages, the phone-preview frame mode. |
| `PergamonAtlas.V1/scripts/handbook/widgets-page.js` | Library › Widgets: the component catalogue, with live previews. |
| `PergamonAtlas.V1/scripts/handbook/component-examples.js` | Sample inputs for those previews (content only; the components draw them). |
| `PergamonAtlas.V1/scripts/components/*.js`, `styles/components/*.css` | The component library: `feature-banner`, `content-card`, `carousel`. |
| `PergamonAtlas.V1/scripts/layout.js` | The site's header and sidebar. One sidebar renderer for Site Navigation (published, cached or built-in) and a section's own navigation (the Handbook). |
| `PergamonAtlas.V1/scripts/cms/site-nav.js` | Admin Mode's Site Navigation editor. |
| `PergamonAtlas.V1/scripts/handbook/typography-page.js` | Foundations › Typography. |
| `PergamonAtlas.V1/scripts/handbook/colors-page.js` | Foundations › Colors: palettes, roles, examples, contrast, exceptions. |
| `PergamonAtlas.V1/scripts/handbook/spacing-page.js` | Foundations › Spacing & Surfaces: scale, page frame, radii, surfaces, elevation. |
| `PergamonAtlas.V1/styles/theme.css` | **Colour, spacing, radius and elevation values: the source of truth.** |
| `PergamonAtlas.V1/styles/layout.css` | Page frame tokens (`--page-inset-*`, `--layout-gutter`) and their narrow-screen values. |
| `PergamonAtlas.V1/scripts/design/colors.js`, `scripts/design/surfaces.js` | What each colour, spacing and surface token is for (no values); read by the Handbook. |
| `tests/design/colors.test.mjs`, `tests/design/surfaces.test.mjs` | Token definitions, documentation and contrast checks. |
| `PergamonAtlas.V1/scripts/grid/atlas-grid.js` | **Atlas Grid engine:** geometry (square cells, 1-based coordinates, canvas extent) and validation with structured errors. No DOM; also runs in Node. |
| `PergamonAtlas.V1/scripts/grid/widget-types.js` | **Widget sizing contracts: the source of truth** (minimum and default cells, content minimums in pixels, how they were measured). |
| `PergamonAtlas.V1/scripts/grid/renderer.js`, `styles/grid.css` | Read-only renderer: places widgets with CSS Grid, stacks below a page-set breakpoint, refuses invalid layouts, optional cell overlay. |
| `PergamonAtlas.V1/scripts/handbook/grid-page.js` | Foundations › Atlas Grid: live demonstrations drawn by the renderer. |
| `tests/design/grid.test.mjs` | Geometry, contracts, validation and fit (`node --test tests/design/grid.test.mjs`). |
| `PergamonAtlas.V1/styles/handbook.css` | Handbook layout (colours from theme tokens, text from type roles). |
| `PergamonAtlas.V1/scripts/design/typography.js` | **Typography registry: the source of truth.** |
| `tools/build-typography.mjs` | Writes `styles/typography.css` from the registry (`--check` to verify). |
| `PergamonAtlas.V1/styles/typography.css` | Generated tokens and `.pa-type-*` classes. Never edit by hand. |
| `tests/design/typography.test.mjs` | Registry, stylesheet and adoption checks (`node --test tests/design/typography.test.mjs`). |
| `docs/design/ATLAS_VISION.md` | **The Atlas vision: the source of truth for the Vision page.** |
| `tools/build-vision.mjs` | Writes `scripts/handbook/vision-content.js` from the vision (`--check` to verify). |
| `PergamonAtlas.V1/scripts/handbook/vision-content.js` | Generated: the vision as structured data. Never edit by hand. |
| `PergamonAtlas.V1/scripts/handbook/vision-page.js` | Vision & Architecture: renders that data with contents and per-section links. |
| `tests/design/vision.test.mjs` | The generated file is current and no words are lost (`node --test tests/design/vision.test.mjs`). |

## Access

The icon and the page use the same check as Admin Mode: a Supabase session,
then the server's `is_admin()` RPC. Guests and members see no icon, no link
and no mention of the Handbook; visiting `/handbook/` shows "Access denied"
without naming it, and the Handbook's scripts and styles are never
downloaded for them. Signing out while the page is open replaces it with the
notice.

The site is static, so the Handbook's files can still be fetched by URL
(as Admin Mode's can). That is acceptable for H1 because the Handbook only
documents public styling and the direction in the vision, which contains no
secrets; anything confidential must not be put in the vision or the registry. Anything the Handbook may **change** in a later
phase must be enforced by the server (as the CMS functions are), never by
this check alone. A denied visit still returns HTTP 200 (static hosting).

## Typography registry

`scripts/design/typography.js` defines font families (owned by
`styles/theme.css`, plus the legacy serif) and **roles**:

- `kind`: `role` (global), `variant` (a controlled variation, `of` a role) or
  `exception` (approved, one place only);
- `status`: `active`, or `legacy` (describes styling awaiting migration);
- values: `family`, `size` (px, or `clamp(px, vw|cqi, px)`), `weight`,
  `leading`, `tracking`, `transform`, optional `numeric`;
- `responsive`: viewport (`media`) and `container` steps, applied by the
  generated CSS, or `note`s;
- `adoption`: where the site's CSS has the role today, as `adopted`,
  `equivalent`, `pending` (with `current` values) or `legacy`. The tests check
  every claim against the CSS file and selector it names.

Each role becomes `--type-<role>-<property>` tokens on `:root` and one
`.pa-type-<role>` class. Text colour is not part of a role.

To change or add a role: edit the registry, run
`node tools/build-typography.mjs`, run the tests. The registry is plain data
with a `validate()` function so a future editor can draft, validate and
publish versions of it.

## The Typography page

Every sample carries the role's real class, so it is drawn by
`styles/typography.css`. Values shown are read back from the page: the
declared token (at the current width) and what the browser rendered. If the
stylesheet and the registry disagree, the role shows a warning. The phone
preview is the page's specimen view (`/handbook/?view=specimen#/…`) in a
390px frame, so viewport breakpoints apply as on a phone.

## The Vision page

`docs/design/ATLAS_VISION.md` is the only copy anyone edits. After changing
it, run `node tools/build-vision.mjs` and the tests. The generator understands
the Markdown the vision uses (headings to `####`, paragraphs, lists, quotes,
tables, `code`, **strong**, *em*, links) and stops with an error on anything
else, such as nested lists or code blocks, rather than silently drop it. Its
output is data, not HTML; the page builds it with DOM methods.

Every `##` section has its own address, `/handbook/#/vision/<section-id>`, so
it can be bookmarked or shared with another admin. The contents list sits
beside the document on wide screens and becomes a menu above it below
1201px; it marks the section being read.

## Navigation: one sidebar

The Handbook has no menu of its own. While it is open, `handbook.js` gives
the site's sidebar its sections (`PergamonLayout.setNavigation`), so the
same component, styles, collapse button and phone menu serve both. On desktop
it sits in the Handbook's grid as the floating, rounded rail, exactly as on the
homepage (`PergamonLayout.mountSidebar`; `unmountSidebar` when the Handbook
closes), and stays in view while long pages scroll. The
Handbook opens the sidebar expanded (with group names) and remembers its own
collapsed / expanded choice, separately from the rest of the site. Leaving
the Handbook, or losing access to it, puts the site's links back. Guests and
members never receive the Handbook's sections: they are in the Handbook's
code, which only administrators load.

The rest of the site shows **Site Navigation**: the links administrators edit
in Admin Mode (see `docs/cms/ARCHITECTURE.md` §5f), or the built-in links in
`layout.js` when nothing is published.

## The component library (H4)

General-purpose components, not game widgets. Each owns its presentation and
behaviour and knows nothing about games, the CMS, Admin Mode or the page it
is on (a test checks the code for that):

| Component | Kind | Owns | Inputs |
|---|---|---|---|
| Feature banner (`feature-banner.js`) | Content | Artwork, title lockup, one action; variants `hero` (Featured Content) and `banner` (Spotlight) | `{ title, actionLabel, href, art }`, `actionIcon` |
| Content Card (`content-card.js`) | Content | Artwork (with its phone crop when 180px or narrower), title, metadata, link, optional action icon | `{ title, meta, href, art, action }` |
| Carousel (`carousel.js`) | Container | Layout, gliding and arrows (`glide.js`), optional filters and sections, empty state, announcements, responsive widths | sections of `{ key, element, label, facet }` items |

The **homepage** (`scripts/home.js`) owns everything game- and CMS-specific:
it turns CMS cards and game entries into those inputs (`featureSlot`,
`gameCard`, `gamesCarousel`), places them, and keeps the API Admin Mode
uses. Admin Mode marks its controls `data-no-copy`, so the carousel's
moving copies leave them out without knowing about Admin Mode.

**Responsiveness**: the Carousel and the Content Card follow their own width
(size containers `carousel` and `content-card`). The feature banner's
compact layout follows the page area it sits in (a size container named
`upper`): a banner can be narrow inside a wide two-column page and should
keep its wide layout there, so that is the page's decision. Its height also
comes from where it is placed.

**Placing a feature banner on another page.** Put it in a page area that is a
size container named `upper`, and give the banner its height there (the
homepage uses rows of 260px for the hero and 140px for the banner, and `auto`
once compact):

```css
.my-area { container: upper / inline-size; display: grid; grid-template-rows: 260px; }
@container upper (max-width: 640px) { .my-area { grid-template-rows: auto; } }
```

The compact layout then applies when that area is 640px or narrower. Without
an `upper` area the banner always shows its wide layout. The Handbook's
previews and Admin Mode's image editor provide such an area the same way.

The CSS class names (`home-*`) are kept from the homepage so nothing that
relies on them changed; renaming them is optional later work.

## The Widgets catalogue

Grouped as **Containers** (Carousel), **Content components** (Featured
Content — Hero, Spotlight — Banner, Content Card) and **Navigation and page
widgets** (Sidebar Navigation, Atlas Navigation panel). Every preview is drawn
by the real code: the components with the sample inputs in
`component-examples.js` (variants, missing artwork, long titles, no action
icon, filters, an empty collection, and a Wide / Compact width control), the
sidebar by the site's sidebar code. Only the Atlas Navigation panel, a
homepage widget that isn't a component yet, is a labelled static preview.
Each entry lists its inputs, what it owns, where it is used, what Admin Mode
can change, its type roles and its source files.

## Adding a section

Add it to `GROUPS` in `handbook.js` (it appears as Planned, in the sidebar
and on its group page), then register a
renderer: `PergamonHandbook.app.register('<group>/<id>', { render(el, ctx), specimen?(el, ctx), navigate?(rest) })`
from a script that `gate.js` loads. Anything after the section's path in the
address arrives as `ctx.rest`; a renderer with `navigate(rest)` handles later
changes to it without being drawn again.

## Connecting a component to a role (H2)

A component keeps its own selector and takes its text style from the role's
tokens in its own stylesheet; no classes are added to the HTML or JavaScript:

```css
.home-tile-title {
  font-family: var(--type-card-title-family);
  font-size: var(--type-card-title-size);
  font-weight: var(--type-card-title-weight);
  line-height: var(--type-card-title-leading);
  letter-spacing: var(--type-card-title-tracking);
  text-transform: var(--type-card-title-transform);
}
```

All six, so any change to the role reaches it. Then set its registry
`adoption` entry to `adopted`; the tests check that the rule really uses
those tokens.

- **Viewport steps** (e.g. the brand's smaller sizes) live on the role's
  tokens, so the component needs no media rule for them.
- **Container steps** have a name; the component's own container rule uses
  `font-size: var(--type-<role>-size-<name>)`.
- **A genuine variation** (the Spotlight's smaller Play button) is a variant
  that lists only what differs; the rest is inherited from its base role
  through the tokens, so changing the base changes the variant too.
- If using a role would visibly change a component, leave the component's own
  values and record it as `pending` with today's values for later review.

Every page loads `styles/typography.css` right after `theme.css`; a test
checks it, because a page without it would lose the shell's text styles.

Connected so far:
- the header (brand, navigation) and the sidebar;
- the homepage's Featured and Spotlight cards, Atlas Navigation and games
  carousel;
- Settings (title, introduction, notes, palette names, storage note);
- Account (introduction, benefits list, loading message, member detail
  labels);
- the footer's brand heading.

Before connecting a style, compare it in the browser with the role applied
in the same place: inherited line heights (and buttons, which don't inherit
them) can make a style that looks equivalent in the CSS render differently.

## Current limits

- Styles that differ from their role keep their own values for review
  (`pending`), for example the placeholder pages' title (38px), lead text
  and tag (line height 1.6), Settings section headings and mode buttons,
  Account headings, field labels and submit button, and the footer links.
  Account tabs match but keep their own 12px size on very small screens.
  The Suggestions title matches, but its style is inline and covered by a
  CSP hash in `vercel.json`, so it stays as it is until that hash is updated.
- Admin Mode's interface and the games still use their own values (`legacy`
  for the games).
- The `.pa-type-*` classes are used by the Handbook's previews only.
- Game typography is documented (legacy serif, Game title) but not migrated.
- The book icon appears where Admin Mode lives (the homepage) and on the
  Handbook itself.
- The Vision page is read-only; the vision is changed in the repository.
