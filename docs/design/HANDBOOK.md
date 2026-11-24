# Atlas Handbook

An internal, read-only design-system catalogue for administrators, at
`/handbook/`, inside the normal site (header, footer, themes). Its sections
are **Overview** (Dashboard, Vision), **Foundations** (Typography, Colors,
Spacing & Surfaces, Atlas Grid, Layout Lab, Node Canvas; Motion planned) and **Library** (Widgets; Elements and Layouts
planned).

**The long-term architecture is defined in [`ATLAS_VISION.md`](ATLAS_VISION.md)**,
the canonical, living vision for the design system, widgets, page builder and
admin tools. This file describes what is built. The vision is also readable
inside the Handbook (Vision & Architecture), generated from that file. What is
live and active now is in [`../STATUS.md`](../STATUS.md).

## Built and planned

Milestone labels (H1, H5.3 …) follow the order of work, not the numbering of
the roadmap in `ATLAS_VISION.md` §11.

| Area | State |
|---|---|
| Handbook, vision page, typography registry (H1); typography adoption where it matches (H2) | Built |
| Handbook catalogue, Site Navigation (H3); component library (H4) | Built |
| Colours, spacing and surfaces, Atlas Grid (H5.2); Layout Lab (H5.4) | Built |
| Homepage on the grid, Layout Mode (H5.3) | Built |
| Node Canvas, with Atlas Studio's Connections (S2) | Built |
| Unified canvas design: the Connections canvas appearance in the Layout Editor, its grid logic unchanged (S3) | Next |
| Remaining typography differences, Admin Mode and game typography | Deferred on purpose |
| Motion, Responsive, Accessibility; Elements and Layouts pages | Planned |
| Widget registry with where-used; page templates; page builder | Long-term |

## Files

| File | Role |
|---|---|
| `PergamonAtlas.V1/handbook/index.html` | The page: shared header, sidebar, footer and themes; an empty `#handbook-root` until access is decided. `noindex`. |
| `PergamonAtlas.V1/scripts/handbook/entry.js` | Administrator check and the header's book icon. Loaded on the homepage and the Handbook. |
| `PergamonAtlas.V1/scripts/handbook/gate.js` | Shows the Handbook (and only then loads its code) or a generic access-denied notice. |
| `PergamonAtlas.V1/scripts/handbook/handbook.js` | App shell: the sections (`GROUPS`, shown in the site sidebar), hash routes, breadcrumbs, the Dashboard, group and planned pages, the phone-preview frame mode. |
| `PergamonAtlas.V1/scripts/handbook/widgets-page.js` | Library › Widgets: the component catalogue, with live previews. |
| `PergamonAtlas.V1/scripts/handbook/component-examples.js` | Sample inputs for those previews (content only; the components draw them). |
| `PergamonAtlas.V1/scripts/components/*.js`, `styles/components/*.css` | The component library: `feature-banner`, `content-card`, `carousel`, `atlas-navigation`. |
| `PergamonAtlas.V1/scripts/layout.js` | The site's header and sidebar. One sidebar renderer for Site Navigation (published, cached or built-in) and a section's own navigation (the Handbook). |
| `PergamonAtlas.V1/scripts/cms/site-nav.js` | Admin Mode's Site Navigation editor. |
| `PergamonAtlas.V1/scripts/handbook/typography-page.js` | Foundations › Typography. |
| `PergamonAtlas.V1/scripts/handbook/colors-page.js` | Foundations › Colors: palettes, roles, examples, contrast, exceptions. |
| `PergamonAtlas.V1/scripts/handbook/spacing-page.js` | Foundations › Spacing & Surfaces: scale, page frame, radii, surfaces, elevation. |
| `PergamonAtlas.V1/styles/theme.css` | **Colour, spacing, radius and elevation values: the source of truth.** |
| `PergamonAtlas.V1/styles/layout.css` | Page frame tokens (`--page-inset-*`, `--layout-gutter`) and their narrow-screen values. |
| `PergamonAtlas.V1/scripts/design/colors.js`, `scripts/design/surfaces.js` | What each colour, spacing and surface token is for (no values); read by the Handbook. |
| `tests/design/colors.test.mjs`, `tests/design/surfaces.test.mjs` | Token definitions, documentation and contrast checks. |
| `PergamonAtlas.V1/scripts/grid/atlas-grid.js` | **Atlas Grid engine:** geometry (square or fixed-height rows, 1-based coordinates, canvas extent), pages of several regions and validation with structured errors. No DOM; also runs in Node. |
| `PergamonAtlas.V1/scripts/grid/widget-types.js` | **Widget sizing contracts: the source of truth** (minimum and default cells, content minimums in pixels with height floors per the widget’s own width bands, how they were measured). |
| `PergamonAtlas.V1/scripts/grid/renderer.js`, `styles/grid.css` | Read-only renderer: places widgets with CSS Grid, stacks below a page-set breakpoint, refuses invalid layouts, optional cell overlay. |
| `PergamonAtlas.V1/scripts/handbook/grid-page.js` | Foundations › Atlas Grid: live demonstrations drawn by the renderer. |
| `tests/design/widgets-page.test.mjs` | Every Widgets entry gives implementation paths, and the files exist. |
| `tests/design/grid.test.mjs` | Geometry, contracts, validation and fit (`node --test tests/design/grid.test.mjs`). |
| `PergamonAtlas.V1/scripts/grid/editor.js` | **Editing engine** (pure; also runs in Node): move, eight-handle resize, add, remove and stacking-order proposals, gesture transactions, history. Validates at the width its caller gives. |
| `PergamonAtlas.V1/scripts/grid/interaction.js`, `scripts/grid/overlay.js`, `styles/grid-editor.css` | Pointer, touch and keyboard controller, and the editing decorations (hit areas, selection, handles, previews). Content-neutral; reusable by any editor. |
| `PergamonAtlas.V1/scripts/handbook/layout-lab.js` | Foundations › Layout Lab: the Handbook wiring and its policy (changes validated at the live grid width and accepted only if the layout fits at every wider width; below the layout’s own fitting width it is shown stacked and read-only). |
| `PergamonAtlas.V1/scripts/canvas/*.js`, `styles/canvas.css` | **Node canvas:** geometry (pure), renderer and interaction. Content-neutral; Atlas Studio uses it (`STUDIO.md`). |
| `PergamonAtlas.V1/scripts/handbook/canvas-page.js` | Foundations › Node Canvas: a live example, its elements with their source, and the canvas conventions. |
| `PergamonAtlas.V1/scripts/cms/layout-mode.js` | Admin Mode's Layout Mode on the homepage: the same engine, controller and overlay per page region, with the CMS working copy as the document (`docs/cms/ARCHITECTURE.md` §12). |
| `tests/design/grid-editor.test.mjs` | The editing engine’s proposals, gestures and history. |
| `tests/cms/layout-editing.test.mjs` | Layout Mode's document: instances, history, conflicts, saving and rollback. |
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
is on:

| Component | Kind | Owns | Inputs |
|---|---|---|---|
| Feature banner (`feature-banner.js`) | Content | Artwork, title lockup, one action; variants `hero` (Featured Content) and `banner` (Spotlight) | `{ title, actionLabel, href, art }`, `actionIcon` |
| Content Card (`content-card.js`) | Content | Artwork (with its phone crop when 180px or narrower), title, metadata, link, optional action icon | `{ title, meta, href, art, action }` |
| Carousel (`carousel.js`) | Container | Layout, gliding and arrows (`glide.js`), optional filters and sections, empty state, announcements, responsive widths | sections of `{ key, element, label, facet }` items |

The **homepage** (`scripts/home.js`) owns everything game- and CMS-specific:
it turns CMS cards and game entries into those inputs (`featureCard`,
`gameCard`, `gamesCarousel`), draws the document's widget instances in its
regions with the shared grid renderer, and keeps the API Admin Mode uses. Admin Mode marks its controls `data-no-copy`, so the carousel's
moving copies leave them out without knowing about Admin Mode.

**Responsiveness**: the Carousel and the Content Card follow their own width
(size containers `carousel` and `content-card`). The feature banner's
compact layout follows the page area it sits in (a size container named
`upper`): a banner can be narrow inside a wide two-column page and should
keep its wide layout there, so that is the page's decision. Its height also
comes from where it is placed.

**Placing a feature banner on another page.** Put it in a page area that is a
size container named `upper`, and give the banner its height there (on the
homepage both come from its slot on the Atlas Grid):

```css
.my-area { container: upper / inline-size; display: grid; grid-template-rows: 260px; }
@container upper (max-width: 560px) { .my-area { grid-template-rows: auto; } }
```

The compact layout then applies when that area is 560px or narrower. Without
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
sidebar by the site's sidebar code. The Atlas Navigation panel is a library
component since H5.3 (`scripts/components/atlas-navigation.js`).
Each entry lists its inputs, what it owns, where it is used, what Admin Mode
can change, its type roles and its **Source**: the implementation files as
repository-relative paths, each with a copy button (`{ path }` parts in
`widgets-page.js`, checked by `tests/design/widgets-page.test.mjs`).

## Adding a widget type

First decide whether you need one. New content is a card; a second copy is
another instance (Layout Mode adds it); a different look is usually a variant
of an existing component. A new **type** touches everything below, in this
order. Skip the content steps for a widget with no content of its own (as
`atlas-navigation`). Paths are under `PergamonAtlas.V1/` unless shown in full.

1. **Component.** `scripts/components/<name>.js` and
   `styles/components/<name>.css`. Its header comment is the API
   documentation. It knows nothing about games, the CMS or its page, uses theme
   tokens only, and follows its container's width.
2. **Typography.** Type-role tokens, with `adoption` entries
   ([Connecting a component to a role](#connecting-a-component-to-a-role-h2)).
3. **Sizing.** An entry in `scripts/grid/widget-types.js`, measured at the
   CMS's maximum content, and the placeable list in `tests/design/grid.test.mjs`.
4. **Loading.** Style and script in `index.html`, and in `gate.js` `ASSETS`.
5. **Homepage.** `scripts/home.js`: `DRAW`, the adapter from CMS content to the
   component's inputs, and (with content) in-place redraw and `sample`.
6. **Content.** `scripts/cms/content.js`: `WIDGET_TYPES`, `WIDGET_NAMES`,
   `BASE_IDS`; then search it for `'feature-hero'` and `'carousel'` to find each
   per-type branch (model, ownership, validation, starter content, lists, fields).
7. **Server.** A new migration replacing `cms_validate_home_v2`: the type
   allowlist and its content rules, and `get_published_content` if it keeps
   private parts. Client and server must agree (`tests/cms/page-layout.test.mjs`).
8. **Admin Mode** (`scripts/cms/`). `layout-mode.js` (which inspector buttons
   apply), `manage.js` `NAMES`, `MANAGE_LABELS` in `admin.js`, and `LIST_LABELS`
   in both `admin.js` and `publish.js`.
9. **Handbook** (`scripts/handbook/`). Sample input in `component-examples.js`;
   an entry (with its Source paths) and `ROLES` in `widgets-page.js`. Only if it is demonstrated on the
   grid: `componentDraw` in `grid-page.js`.
10. **Tests and status.** Extend `tests/cms/layout-editing.test.mjs` and
    `tests/design/`, run the checks (`docs/cms/TESTING.md`), then finish the
    milestone as in `CLAUDE.md`.

**Release order:** migration (staging, then production), then the code, then
the first published document that uses the type. A front end that doesn't know
the type refuses the whole document and shows the built-in homepage, so before
rolling the code back, restore a version without it.

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
- The homepage is the only page on the Atlas Grid and the only one Layout
  Mode edits; widgets stay in their region, and extra carousels share the
  "Explore More Games" heading.
- The book icon appears where Admin Mode lives (the homepage) and on the
  Handbook itself.
- The Vision page is read-only; the vision is changed in the repository.
