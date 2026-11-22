# Atlas Handbook

An internal, read-only design-system catalogue for administrators, at
`/handbook/`, inside the normal site (header, footer, themes). Its sections
are **Overview** (Dashboard, Vision), **Foundations** (Typography; Colors,
Spacing and Motion planned) and **Library** (Widgets; Elements and Layouts
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
| | Colors & Themes, Spacing & Grid, Surfaces, Motion, Responsive, Accessibility | H3 |
| **Long-term** | Element and widget registry with live previews, dependencies, where-used | H4 |
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
| `PergamonAtlas.V1/scripts/handbook/widgets-page.js` | Library › Widgets: the widget catalogue. |
| `PergamonAtlas.V1/scripts/layout.js` | The site's header and sidebar. One sidebar renderer for Site Navigation (published, cached or built-in) and a section's own navigation (the Handbook). |
| `PergamonAtlas.V1/scripts/cms/site-nav.js` | Admin Mode's Site Navigation editor. |
| `PergamonAtlas.V1/scripts/handbook/typography-page.js` | Foundations › Typography. |
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

## The Widgets catalogue

One entry per widget: purpose, a preview, its configuration, the type roles
it uses and its source files. Sidebar Navigation is drawn live by the site's
sidebar code; the homepage widgets are static previews (labelled as such)
that use the widgets' real type roles. Drawing them live would mean loading
the homepage's code into the Handbook; that waits for component extraction.

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
