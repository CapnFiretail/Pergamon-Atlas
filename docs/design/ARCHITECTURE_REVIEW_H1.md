# H1 Architecture Review against the Atlas Vision

**Date:** 2026-11-21 · **Scope:** Handbook Phase H1 as built, compared with
[`ATLAS_VISION.md`](ATLAS_VISION.md) v0.1 · **Status:** historical
record of H1; not current. See [`../STATUS.md`](../STATUS.md) and
[`HANDBOOK.md`](HANDBOOK.md).

## Summary

H1 is compatible with the vision. Nothing built in H1 has to be undone to
reach H2–H7. The registry → generated CSS → live Handbook pattern is the right
foundation for every design layer. The existing CMS already has the draft,
validate, publish and rollback machinery that visual editing will need.

What H1 does not yet have:
- **A component model.** Widgets are page-specific code today, so the Widgets
  layer starts with extracting them (H4), not cataloguing them.
- **A page model.** Pages are hand-written HTML files; templates and the
  builder need a stored page document and a renderer (H5/H7).

Both are expected at this stage, and both need decisions the vision lists as
open.

## Capability by capability

| Capability | Where H1 stands | Fit | What later phases need |
|---|---|---|---|
| **Centralised design foundations** | Typography only: `scripts/design/typography.js` → `styles/typography.css`, validated by tests. Colours live in `styles/theme.css` and `scripts/theme.js` (four palettes × two modes). | Good | Reuse the same pattern for colour, spacing, radii and motion (H3). Each foundation gets a registry, generated tokens and an alignment test, in a shared `scripts/design/` namespace. |
| **Semantic typography roles** | 19 roles, variants and exceptions, with tokens and classes, values equal to today's CSS. No page uses the classes yet. | Good | Adoption (H2): add `typography.css` to each page's `<head>` and swap selectors to roles page by page, pixel-checked. |
| **Semantic colour roles** | `theme.css` already exposes semantic tokens (`--color-text-primary`, `--color-accent`, …) per palette and mode. There is no registry, and there are about 28 hard-coded hex values in `home.css`, `cms-admin.css` and `handbook.css` (Featured card and game header artwork backgrounds). | Partial | A colour registry describing palettes, semantic roles and contrast pairs, generated from or validated against `theme.css`. The fixed artwork colours become documented exceptions or "on-artwork" roles (H3). |
| **Reusable elements and widgets** | The Handbook's own renderer registry (`app.register`) is the only component contract. Site widgets (Featured card, Spotlight, carousel, sidebar, header) are built inside `home.js`, `glide.js`, `layout.js` and the CMS scripts, tied to their page's DOM and data. Each game is one self-contained `index.html` with inline code. | Gap (expected) | A small, framework-free widget contract (see recommendation 1). Extract one widget first, probably the Featured card, and preview it in the Handbook from the same code the homepage uses. |
| **Widget registry** | None. The typography registry's shape (id, kind, status, purpose, rules, adoption) is a working template for one. | Pattern ready | Registry entries for id, purpose, source file, config schema, variants, foundation dependencies, constraints, usage and status (vision §4). Usage should be generated, not hand-written (see debt 1). |
| **Widget configuration and dependencies** | The CMS already validates per-component configuration on the server (`validate_content` and the `cms_check_*` functions in migrations 0008–0012) for `home.featured`, `home.spotlight` and `home.carousel`. Those schemas are written in SQL for each component key. | Partial | One config schema per widget type that both the client form and the server validator derive from. Dependencies (which roles and tokens a widget uses) can be read from its CSS by a test, as the typography adoption test already does. |
| **Structured page templates** | Pages are static HTML files that share a shell (header, sidebar, footer via `loadSnippets`) and per-page CSS lists. `site_pages` and `site_content_versions` store content for named slots on the homepage only. | Partial | A page document (template id, slots, widget instances and their config) stored like today's content versions; templates are saved documents (vision §5). Needs a schema change, so it needs approval (H5). |
| **Freeform grid composition** | None. Layout breakpoints are scattered: about 13 distinct widths across the stylesheets (360–1280px), including H1's admin-header rules. | Gap | A grid and breakpoint specification (an open question in the vision) and widget size and constraint declarations. Container queries, already used by the Featured card, are the right tool for widget-level responsiveness inside grid cells (H5/H7). |
| **Responsive layout constraints** | The Typography registry already records viewport and container steps per role and tests them. | Partial | Constraints at widget level (minimum width, valid spans, mobile behaviour), checked by automated width sweeps like the existing 1440→320 suites. |
| **Future visual editing** | Tokens are CSS custom properties. The H1 suite shows a token changed at runtime reaches every sample, so a live preview is cheap. The registry is plain data with `validate()`. | Good | An "override layer": edited token values applied as a `:root` style block, previewed per session and later published. The registry's data needs to be separable from its code (see debt 2). |
| **Preview, publishing, rollback** | The CMS has drafts, preview, server-side validation, publish, version history and rollback, all behind `is_admin()` and row-level security. Design definitions are versioned only in Git. | Good (CMS) / Open (design) | Decide the publish backend for design values (vision §9 leaves Git, database or hybrid open). The CMS's version model can be reused for token overrides and page documents without a new mechanism. |

## Conflicts and technical debt

1. **Hand-written where-used lists** (conflicts with vision §10). Each
   registry role lists where the site uses it. The tests verify every claim
   against the CSS, so the lists can't silently go wrong, but they are still
   maintained by hand. **Recommendation (H2):** once pages use `.pa-type-*`,
   generate usage by scanning HTML, CSS and JS for the classes, and keep
   hand-written entries only for not-yet-migrated styles.
2. **Registry data lives in a JavaScript file.** That suits Git-based
   editing; a database-backed editor could not write it. **Recommendation
   (before H6):** separate the data (JSON) from the helpers (`validate`,
   `token`) so the same validator can run in the browser, in Node tests and,
   if needed, against a database draft.
3. **Per-page `<head>` lists.** Each of the 18 HTML pages lists its own
   stylesheets and scripts, so adopting `typography.css` sitewide means
   editing every page. **Recommendation (H2):** accept this for adoption, but
   add a test that every page includes the foundation stylesheets in the
   right order.
4. **Scattered breakpoints.** About 13 distinct widths, plus admin-only header
   rules added in H1 (`layout.css`, scoped to `:has(.pa-handbook-link)`).
   **Recommendation (H3):** define named breakpoints as part of Spacing &
   Grid and migrate gradually; H1's admin rules are the first to fold in.
5. **Fixed artwork colours.** The Featured and Spotlight cards and the game
   header use fixed colours (the Handbook preview copies two of them in
   `handbook.css` to show those roles on the right background). This is
   intentional design, but it sits outside the palette system.
   **Recommendation (H3):** register these as approved exceptions with an
   owner, per vision §3.
6. **Client-side access gate.** Handbook files, including the generated
   vision, can be fetched by URL. That is acceptable for read-only
   documentation (decided for H1), but **not** for drafts or anything an
   editor writes. **Recommendation (H6):** draft design values and page
   documents must come from Supabase under row-level security and
   `is_admin()`, never from static files, and every write must go through
   server-validated functions as the CMS's do.
7. **Games are self-contained pages with inline code** and their own CSP.
   The vision treats a game as a widget without exposing its rules. This
   needs a wrapper boundary (mount a game into a slot) rather than rewriting
   games. **Recommendation (H4/H5):** define a "game widget" that hosts the
   existing page's content, and decide how much game styling is editable
   (open in vision §12).
8. **Component-specific CMS validators.** Each new widget type currently
   needs new SQL check functions and a migration. **Recommendation (H4/H5):**
   when the widget registry has config schemas, consider one generic
   schema-driven validator on the server. This is a schema change that needs
   its own approved phase.
9. **Hash routing in the Handbook** is fine for an internal tool and needs no
   server routes. It is not a pattern for public pages; the page model (H5)
   should keep real URLs.

No conflict was found with the vision's engineering constraints: no framework
was added, game logic and CMS content are untouched, the palettes and modes
are preserved, and access is enforced by the same server check as Admin Mode.

## Recommended sequence

1. **H2, typography adoption.** Include `typography.css` sitewide, adopt the
   roles with pixel-identical checks, then make the approved normalisations
   separately. Generate where-used from class usage (debt 1) and add the
   head-order test (debt 3).
2. **H3, colour foundation first.** Add a colour registry over `theme.css`
   with contrast tests, and register the artwork exceptions (debt 5). Then
   spacing and grid with named breakpoints (debt 4).
3. **Before H4, agree the widget contract.** A plain-JS module per widget,
   for example `mount(el, config, ctx) → { update(config), destroy() }`,
   plus a registry entry with a config schema, dependencies, constraints and
   status. Pilot it on the Featured card so the homepage and the Handbook
   render the same code.
4. **Before H5/H6, decide the design publish backend** and the page-document
   schema (vision §9 and §12). Reuse the CMS version model (draft → validate
   → publish → rollback) rather than building a second one.

## Decisions needed (from the vision's open questions)

- Widget registry format and the widget contract (before H4).
- Grid and breakpoint specification (H3).
- Publish backend for design values: Git, database or hybrid (before H6).
- Page schema and template constraints (H5).
- Scope of editable game-specific styling (H4/H5).
