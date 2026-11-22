# Pergamon Atlas — Atlas Handbook Vision

**Version:** 0.1 — Draft

**Status:** Living vision document; not an implementation specification

**Priority:** Sitewide cohesion first, advanced visual editing later

> This is the canonical statement of Atlas's long-term architecture. Sections 1–13 are the vision as agreed; the closing *Implementation status* records where the site stands today and is updated as phases land. To change the vision, edit this file and run `node tools/build-vision.mjs` so the Handbook's copy is regenerated.

## 1. North Star

Pergamon Atlas is a coherent ecosystem of games, tools, and other experiences. Nearly every piece of page content should be a reusable, configurable element or widget. A living Atlas Handbook governs the shared design foundations, documents the real components in use, and eventually lets an administrator visually edit styles, configure widgets, and compose new pages.

**Guiding principle:** Consistency without uniformity. Unified by default, exceptions by design. A page should unmistakably belong to Atlas while allowing games and specialized tools to have their own functional and artistic character.

## 2. Layers of the System

- **Foundations:** typography, color and themes, spacing, grids, radii, borders, elevation, motion, responsive behavior, and accessibility standards. Shared, semantic definitions are the source of truth.
- **Elements:** buttons, labels, headings, icons, fields, badges, dialogs, and other small reusable interface pieces.
- **Widgets:** independently reusable, configurable compositions such as an inner page header, sidebar, Featured card, carousel, game controls, score panel, or complete playable game. A game can be a widget without exposing its internal rules to the page builder.
- **Pages and layouts:** responsive compositions of registered widgets, assembled from templates or on a blank canvas, with constraints and consistent snapping/spacing rules.
- **Handbook and admin tools:** browse foundations, inspect live components and dependencies, preview changes, and ultimately propose, approve, publish, and roll back edits.

The global site header and footer can remain special shell components rather than ordinary draggable page widgets, while still consuming the same design foundations. The sidebar may be a registered widget or a layout-level component depending on its role.

## 3. Design Inheritance

Widgets consume semantic foundation roles rather than embedding hardcoded brand values. For example, a Game Header uses `game-title` typography, and that role uses the `display` font family. Changing the display font in one controlled source updates all widgets that inherit it. Widgets may expose documented variants (for example, compact vs. standard), but should not accumulate arbitrary local overrides.

The system must distinguish:

- **Global rules** shared throughout Atlas;
- **Page-family conventions** for games, tools, catalogues, etc.;
- **Widget-specific configuration** for content and behavior;
- **Approved exceptions** for distinctive game boards, glyphs, canvas text, artwork, and other legitimate needs.

An exception should have a reason and a visible owner in the Handbook.

## 4. Widget Registry

Each reusable widget should eventually have a stable identifier, purpose, owner/source implementation, live preview or sample data, configurable properties, foundation dependencies, variants, layout constraints, responsive behavior, accessibility requirements, usage locations, and migration/deprecation status. The Handbook should preview the actual implementation, not a separate imitation. The site and Handbook should read the same registry/definitions wherever feasible.

Not every element must become a complex JavaScript component immediately. Registry adoption should be incremental and proportionate to actual reuse.

## 5. Hybrid Page Builder

Two entry points, one underlying page model:

- **Template:** choose a Game, Tool, Catalogue, or other predefined arrangement and customize it.
- **Blank canvas:** drag registered widgets into a responsive layout and snap them to a grid governed by Atlas spacing and layout rules.

Templates are saved widget compositions, not separate rendering engines. Widgets declare valid sizes, minimum widths, placement requirements, and mobile behavior. The builder prevents invalid combinations rather than permitting layouts that break at smaller screens. Future editing should support drafts, preview, validation, publishing, history, and rollback.

## 6. Handbook Information Architecture

- **Overview:** philosophy, current status, recent changes, and navigation.
- **Foundations:** Typography first; later Colors & Themes, Spacing & Grid, Surfaces, Motion, Responsive, Accessibility.
- **Elements:** reusable primitive UI and usage guidance.
- **Widgets:** catalogue with previews, properties, dependencies, and where-used links.
- **Page Architecture:** templates, slots, grids, and layout constraints.
- **Exceptions & Migration:** approved deviations, legacy components, adoption progress.

This structure is a proposed navigation model and may evolve.

## 7. Typography Foundation — V1 Decision

Adopt Roboto Slab as the current display default and Manrope as the current interface default. These are editable defaults, not permanent branding constraints. Typography should have semantic roles such as page-title, game-title, section-title, card-title, body, caption, label, button, navigation, numeric, and status, with controlled variants where justified.

A `game-title` role references the display family token; a widget references the role, not a font name. Preserve current visual appearance during initial token/registry setup; review any normalization separately. Long-term font changes should be possible through the Handbook without editing every component.

Audit findings to address incrementally: V1 pages use shared Atlas fonts while legacy game content uses Georgia; game title styles are duplicated; font sizes and tracking values are scattered; some game text has inadequate contrast; heading semantics and font fallbacks need review. Do not mistake the number of distinct values alone for proof that every variation is wrong.

## 8. Handbook Experience — First Visible Milestone

Create an admin-only Handbook destination inside the existing website, accessible through a small book icon immediately left of the Admin Mode button in the existing header (or the nearest safe, consistent admin control location after inspection). It should preserve the established header behavior and not appear to non-admin users.

First page: Handbook overview and a real Typography section. Show actual loaded font specimens, semantic role samples, token values, usage descriptions, and migration status. Read from the same foundation definitions and computed styles used by the website. Clearly label proposed/unmigrated styles. Keep it read-only initially. Prefer a restrained, functional design consistent with Atlas, not a new independent visual language.

## 9. Source of Truth and Editing Future

Initial source of truth should be version-controlled design definitions (e.g., registry plus CSS tokens) with validation that the registry and live CSS stay aligned. The Handbook reads these definitions and live computed values. Future admin editing should draft changes, preview them safely, validate affected components and responsive states, and publish through a reviewable, reversible mechanism. Whether publication ultimately uses Git automation, a database, or a hybrid is not yet decided. Avoid prematurely binding the architecture to one backend.

## 10. Engineering Constraints

- Respect the current plain HTML/CSS/JavaScript site and existing Supabase homepage CMS; do not add a framework solely to build the Handbook.
- Keep game logic and saved content intact.
- Preserve the existing four palettes and dark/light behavior.
- Avoid creating duplicate sources of truth or hand-maintained where-used lists.
- Favor semantic tokens, reusable implementation boundaries, documented exceptions, and tests.
- Admin visibility in navigation is not security: enforce access control for Handbook pages and any future write operations.
- Do not add CMS migrations, deployment changes, or write privileges without a specific approved phase.

## 11. Phased Roadmap

- **Phase H1 — Foundation and visible Handbook:** establish typography registry/tokens, validate alignment, add admin-only Handbook route and navigation, and show read-only live typography specimens. Avoid unapproved visual changes to existing pages.
- **Phase H2 — Typography adoption:** connect V1 components, consolidate repeated game hero styles, migrate legacy game page chrome to Atlas typography, correct accessibility issues, and validate responsive behavior in small reviewed steps.
- **Phase H3 — Broader foundations:** colors/themes, spacing/grid, surfaces, motion, and responsive standards; connect them to live Handbook views.
- **Phase H4 — Element and widget library:** register existing reusable components, extract shared implementations when useful, add previews and dependency/usage reporting.
- **Phase H5 — Template and layout engine:** define common page composition model and responsive constraints, introduce reusable page-family templates.
- **Phase H6 — Visual editor:** admin changes to foundation values and widget configuration with drafts, previews, approval, publishing, and rollback.
- **Phase H7 — Hybrid page builder:** template-based and blank-grid drag-and-drop composition, with safe creation of new pages through Admin Mode.

These are sequencing intentions, not deadlines or commitments to specific technologies.

## 12. Decisions and Open Questions

**Agreed:**

- unified Atlas theme by default;
- exceptions can be approved later;
- nearly all inner-page UI should be elements/widgets;
- typography and colors are governed centrally;
- hybrid template + freeform grid builder;
- initial typography defaults Roboto Slab + Manrope;
- visible Handbook from the start;
- cohesion before full editor.

**Open:**

- exact semantic typography values;
- precise component boundaries;
- sidebar placement model;
- widget registry format;
- grid and breakpoint specifications;
- font hosting;
- admin authentication/authorization integration;
- where-used automation;
- long-term publish backend;
- scope of editable game-specific styling;
- template constraints and page schema.

## 13. Definition of Success

- Changing a shared design role affects all intended consumers without hunting through pages.
- Existing pages look coherent and remain functional across devices and palettes.
- The Handbook accurately reflects live code and exposes remaining exceptions/legacy usage.
- New widgets and pages reuse existing foundations rather than inventing styles.
- An admin can eventually assemble new pages visually without compromising design consistency, responsiveness, accessibility, or site security.

## Implementation status

As of 2026-11-22 (after the H4 component library). This section is maintained with the code; the vision above is not changed by it.

| Area | State | Where |
|---|---|---|
| Admin-only Handbook at `/handbook/`, book icon left of Admin Mode | Implemented (H1) | `handbook/`, `scripts/handbook/` |
| Typography registry, generated tokens and `.pa-type-*` classes, alignment tests | Implemented (H1) | `scripts/design/typography.js`, `styles/typography.css`, `tests/design/` |
| Live Typography page: specimens, roles, values, usage, exceptions | Implemented (H1) | Foundations › Typography |
| This vision, readable in the Handbook | Implemented (H1) | Vision & Architecture |
| Header, sidebar, homepage widgets, Settings, Account and footer using the type roles where they match | Implemented (H2) | Their CSS reads the role tokens |
| Handbook catalogue redesign: Dashboard, Typography specimens, Widgets catalogue, Handbook sections in the shared sidebar | Implemented (Handbook redesign milestone) | `scripts/handbook/`, `scripts/layout.js` |
| Site Navigation: the sidebar links edited in Admin Mode, published with the homepage | Implemented (Handbook redesign milestone; migration 0013 on staging) | `scripts/cms/site-nav.js`, `site.sidebar` |
| Remaining typography differences, Admin Mode typography | Planned (H2) | Kept as pending in the registry |
| Normalisations, legacy game typography, contrast fixes | Planned (H2) | Listed as pending/legacy in the registry |
| Colors & Themes: colour roles documented, previews resolve every role per palette and mode, live contrast checks | Implemented (H5.2a) | `styles/theme.css`, `scripts/design/colors.js`, Handbook › Colors |
| Spacing & Surfaces: spacing scale, page frame tokens (two inset families, 16px widget gutter), radii and elevation, documented live | Implemented (H5.2b) | `styles/theme.css`, `styles/layout.css`, `scripts/design/surfaces.js`, Handbook › Spacing & Surfaces |
| Atlas Grid foundation: 20-column square-cell layout model, widget sizing contracts, validation and a read-only renderer, demonstrated in the Handbook (no page uses it yet) | Implemented (H5.2c) | `scripts/grid/`, `styles/grid.css`, Handbook › Atlas Grid |
| Homepage on the Atlas Grid; Layout Lab; layout editing in Admin Mode | Planned (H5.3+) | — |
| Motion, Responsive, Accessibility | Planned (H5) | Shown as Planned in the Handbook |
| Component library: Feature banner (hero / banner), Content Card, Carousel, previewed live in the Handbook | Implemented (H4) | `scripts/components/`, `styles/components/` |
| Element and widget registry with dependencies and automatic where-used | Long-term (H4+) | — |
| Page model, templates and layout constraints | Long-term (H5) | — |
| Visual editing with drafts, preview, publish and rollback | Long-term (H6) | — |
| Hybrid page builder | Long-term (H7) | — |
