# Pergamon Atlas CMS — architecture (Admin Mode V1, Phase 1B)

Status: **proposed**. Nothing here is applied to any Supabase project or
deployed. Migrations live in `supabase/proposed/` until approved.

## 1. Overview

```
 Browser (static site on Vercel)                         Supabase (one project per environment)
 ─────────────────────────────────                       ─────────────────────────────────────────
 Visitor  ── GET rpc/get_published_content('home') ───▶  Postgres  site_content_versions (published row only)
          ◀── { version, content, media paths } ──────            site_media (public paths of used images)
          ── GET storage/v1/object/public/site-media/media/<sha256>.webp ─▶ Storage bucket site-media (public, immutable)

 Admin    ── rpc get_draft / save_draft / discard_draft ─▶ Postgres (SECURITY DEFINER functions, is_admin() inside)
          ── rpc create_media_upload ───────────────────▶  site_media row + issued path
          ── upload original ───────────────────────────▶  Storage site-media-drafts (private, admin-only, no overwrite)
          ── POST functions/v1/publish-media {media_id} ─▶ Edge Function (service role, server-side secret)
                                                              checks admin + real bytes, copies to site-media,
                                                              records via cms_record_prepared_media
          ── rpc publish(page, draft_id, expected_live) ─▶ one transaction: validate, verify images, archive old,
                                                              insert new published version
          ── rpc rollback(page, version_id, expected) ──▶  publish a copy of an archived version as a new version
```

GitHub and Vercel are not involved in routine content changes: the homepage
reads the published document from Supabase at page load.

## 2. Authorization

| Layer | What it enforces |
|---|---|
| `profiles.role` (0001) | The only source of "admin". New accounts are always `user` (trigger); users can't change their role (the `protect_profile_fields` trigger reverts it; proposed 0010 also removes the UPDATE privilege). |
| `public.is_admin()` (0008) | The single server-side check: `profiles.role = 'admin'` for `auth.uid()`. Reads the database, never JWT metadata a user can influence. `SECURITY DEFINER`, empty `search_path`. MFA later: add `and auth.jwt()->>'aal' = 'aal2'` here. |
| Table privileges | `anon`/`authenticated` have **no** privileges on `site_content_versions`, `site_media`, `site_pages`, `site_content_routes` (explicitly revoked — Supabase grants ALL by default). RLS is enabled with no policies as a second layer. |
| Function privileges | All CMS functions revoke `EXECUTE` from `public, anon, authenticated` (Supabase grants it by default), then grant: `get_published_content` → anon + authenticated; admin functions → authenticated only (anon is refused before the function runs); `cms_record_prepared_media` → service_role only. Every admin function also calls `cms_require_admin()` itself. |
| Storage policies (0009) | `site-media-drafts`: admin-only read; insert only to the exact path `create_media_upload` issued to that admin, once; no update/delete policies. `site-media`: no policies for browsers at all (no writes, no listing); public URLs still serve. |
| Edge Function | Verifies the session with Supabase Auth, then reads `profiles.role` with the service key; locations come only from the `site_media` row and the file's own hash. |
| Frontend | Hides controls for non-admins (UX only; never relied on). |

Every privileged function is `SECURITY DEFINER` with `set search_path = ''`
and fully qualified names, so a caller can't shadow tables or functions.
Errors use PostgREST's `PTnnn` codes: `PT403` forbidden, `PT404` not found,
`PT409` conflict, `PT422` invalid content, `PT429` upload limit.

## 3. Content model (0008)

### Versions

`site_content_versions` is append-only history; one row = one complete document for one page.

| Column | Meaning |
|---|---|
| `id` | identity; the version number |
| `page` | `home` (from `site_pages`; new pages are added there with a schema) |
| `schema_version` | content schema used (1) |
| `content` | the whole document (jsonb, ≤ 256 KB) |
| `status` | `draft` (≤ 1 per page) · `superseded` (older/consumed draft) · `published` (≤ 1 per page) · `archived` (previously live) |
| `previous_version_id` | draft → the draft it replaced; published → the version it replaced |
| `based_on_published_id` | draft → live version when editing started |
| `source_version_id` | published → the draft or archived version it was copied from |
| `note` | optional revision note (≤ 280) |
| `created_by`, `created_at` | author |
| `published_by`, `published_at` | set exactly when status is published/archived |

Rules (trigger `site_content_guard`): rows are never deleted; content and
attribution never change; the only status changes are `draft → superseded`
and `published → archived`, and only from inside the content functions.

### Operations

| Function | Who | Behaviour |
|---|---|---|
| `get_published_content(page)` | anyone | `{ page, version, schema, published_at, content, media: { id: { path, width, height } } }` — no account ids, no draft data. `null` if nothing is published. |
| `get_draft(page)` | admin | current draft (or null) + the live version it would replace |
| `save_draft(page, content, expected_draft_id, note?)` | admin | validates; refuses with PT409 if the current draft isn't the one the editor loaded; supersedes it and inserts the new draft |
| `discard_draft(page, expected_draft_id)` | admin | supersedes the draft (kept in history) |
| `publish(page, draft_id, expected_published_id)` | admin | one transaction: draft must be current, live version must be as expected, content re-validated, every image prepared; archives the live version, inserts the new published version, consumes the draft |
| `rollback(page, version_id, expected_published_id)` | admin | target must be an archived version of that page; re-validated; published as a **new** version (`source_version_id` = target) |
| `list_versions(page, limit)` | admin | history without bodies |

Concurrency: every write takes a per-page transaction advisory lock, and
uses expected-id checks (optimistic concurrency), so two admins can't
silently overwrite each other and two publishes can't both win.

### Document schema v1 (`page = 'home'`)

```jsonc
{
  "schema": 1,
  "components": {
    "home.featured":  Card,
    "home.spotlight": Card,
    "home.carousel":  { "order": ["battleship", "pong", ...] },   // ≤ 24 ids
    "home.carousel.battleship": CarouselCard,                     // one per id, stable ids
    ...
  }
}
Card         = { "title": 1–60, "cta": 1–24, "href": Route, "art"?: Art, "style"?: { "rules": boolean } }
CarouselCard = { "title": 1–40, "category": "Strategy"|"Arcade"|"Classic"|"Card", "href": Route, "art"?: Art|null }
Art          = { "source": { "media": "<uuid>" } | { "static": "/images/featured/<name>.(webp|png|jpg)" },
                 "alt"?: ≤140, "fit"?: "cover"|"height",
                 "focus"?: Point, "focusNarrow"?: Point,           // cover crop (object-position)
                 "scale"?: 0.5–3, "scaleNarrow"?: 0.5–3,           // fit: height
                 "anchor"?: Anchor, "anchorNarrow"?: Anchor,       // fit: height position
                 "base"?: "#rrggbb" }                              // card colour behind feathered art
Point  = { "x": 0–100, "y": 0–100 }                                // percent
Anchor = { "x": 0–100, "offset"?: -600–600, "y"?: 0–100 }          // percent, px, percent
Route  = a path listed in site_content_routes (e.g. "/games/chess-forge/")
```

Validation (`validate_content`) is allowlist-only: unknown components or
fields anywhere are rejected. Text must be trimmed, within length, and free
of `<`, `>`, control characters and bidirectional overrides. Positions are
numbers, never CSS strings (today's `calc(50% - 60px)` becomes
`{ "x": 50, "offset": -60 }`), so no CSS reaches the page from content.
Destinations come only from `site_content_routes`, which only migrations
change — no external, protocol-relative or `javascript:` URLs. Images are
either a `site_media` id or a file under `/images/featured/`. The renderer
will keep using `textContent`/`setAttribute` (never `innerHTML`) for content.

## 4. Media (0009 + Edge Function)

`site_media`:

| Column | Meaning |
|---|---|
| `id` | media id referenced by content |
| `draft_path` | `uploads/<id>.<ext>` in `site-media-drafts` (the preserved original) |
| `declared_mime`, `declared_bytes` | what the browser declared (checked: PNG/JPEG/WebP, ≤ 5 MiB) |
| `public_path` | `media/<sha256>.<ext>` in `site-media`, set once by the Edge Function |
| `mime`, `bytes`, `width`, `height`, `sha256` | measured from the actual file |
| `uploaded_by`, `uploaded_at` | uploader |
| `prepared_at` | when copied to the public bucket |
| `published_at` | first time a published content version used it |

Identity is immutable; prepared fields are written once; rows are deleted
only by the service role (clean-up). Crop, scale and focal point live in the
content document, so originals are never altered.

### publish-media (`supabase/functions/publish-media/`)

`POST { "media_id" }` with the admin's session token. Steps: authenticate
(Supabase Auth) → admin check (`profiles.role`, service key) → load the row →
derive the draft path from the id and declared type (a mismatched stored
path is refused) → download → check the real bytes (`media.ts`: PNG/JPEG/WebP
signatures and headers, 1–10,000 px per side, ≤ 40 MP, ≤ 5 MiB, matches the
declared type) → SHA-256 → upload to `site-media/media/<sha256>.<ext>` with a
one-year cache and no overwrite → `cms_record_prepared_media`. Responses
never echo internal errors. CORS is limited to the configured site origins.

Partial failures: nothing the public sees changes until a content version is
published, and `publish` refuses images that weren't recorded. If the copy
succeeds but recording fails, the call is retried (same bytes → same path).
Drafts are never deleted by the function.

Orphan clean-up (later, service role, scheduled): public objects whose
`site_media` row has `published_at is null` and `prepared_at` older than 30
days, and draft originals whose row was never prepared after 30 days, can be
removed; images used by any published or archived version are kept so
rollback always works.

Limitation (decision below): v1 publishes the uploaded original. A 5 MB
upload would be served as-is. Options: resize server-side to a WebP ≤ 2560 px
in the function (needs a WASM image library), or have the editor require
web-sized images.

## 5. Homepage loading (implemented in M2: `scripts/cms/loader.js`)

As built: `supabase-config.js`, `cms/content.js` and `cms/loader.js` load
before `home.js`, so the `get_published_content('home')` request (publishable
key only, no session) is in flight while the page parses. Repeat visits draw
the last published version this browser received (re-validated)
immediately; first visits keep card frames sized and hide only their
contents (`.home.cms-pending`) for at most 1.2 s. Invalid, slow (8 s timeout)
or failed answers keep the static/cached copy; "nothing published" returns
to the static copy. The browser re-validates every document
(`content.validateDocument`: internal links only, safe image paths, text
limits) before drawing. **Production:** the loader is off when
`PERGAMON_ENV` is `production` (`LIVE` table in `loader.js`); flip it only
after the production CMS rollout is approved.

Known browser behaviour (M1): after a live zoom edit is reverted, Chrome can
draw the image's edges very slightly differently (compositor resampling
after a transform; DOM and file identical; visitors never see it).

Original plan, for reference:

- `scripts/home.js` keeps its renderer; it gains a `render(doc)` entry so the
  same code renders the published document (and, later, an admin's draft).
- Loading: an early script requests `get_published_content('home')` with
  `fetch(..., { cache: 'no-store' })` (plain REST, no wait for supabase-js).
  The cards and carousel keep their fixed sizes (260 / 140 / carousel row)
  and show a quiet placeholder state, so filling them causes no layout shift.
- Freshness: network first. If the request fails or takes > 1.5 s, render the
  last published version this browser received (stored with its version
  number), otherwise the bundled `data/home-content.js` snapshot; retry once
  in the background and re-render in place if a newer version arrives.
- The static snapshot is a fallback only, never preferred over a live
  answer. When releasing code, regenerate it from the current published
  version so the fallback is recent; between releases it is used only when
  Supabase is unreachable and the visitor has no cached copy.
- Outage behaviour: the site keeps working with the last known content; admin
  editing reports that Supabase is unavailable and saves nothing.
- Images: published images have content-hashed names (`media/<sha256>`), so a
  new image is a new URL — no cache clearing; they can be cached for a year.
  The document itself is never cached by the browser.
- Admins: after `is_admin()` is confirmed, the editor loads the draft via
  `get_draft`; drafts are never stored for visitors.

## 5a. Admin Mode (implemented in M3: `scripts/cms/admin.js`)

- **Who sees it.** Runs only where the loader is live (not production). On
  load and on every sign-in/sign-out it reads the session and calls
  `rpc is_admin()` with it; nothing is built (no button, no stylesheet, no
  pencils) unless the database answers `true`. Stored state
  (`sessionStorage['pa-cms-admin']`: on/off and view) is read only after
  that answer, and turning Admin Mode on asks again. A forged or edited
  session, or a regular user's session, gets `false` — and every CMS write
  function checks `is_admin()` itself, so the interface is never the
  boundary.
- **Controls.** A header button (beside search / settings / account) opens
  the Admin Mode panel: the on/off switch, "View as" Admin / User / Guest,
  and Publish Changes (disabled until editing exists). Styles:
  `styles/cms-admin.css`, loaded by the script after verification.
- **Indicators.** In Admin view, every card from `PergamonHome.cardIds()` /
  `element(id)` whose `content.cardType` is known gets an absolutely placed
  dashed frame and a pencil button (a tile's pencil sits beside its link,
  inside the list item, so the card still navigates). A MutationObserver
  re-applies them when the carousel pages or the document is redrawn. No
  card box changes size. A badge on the pencil shows unsaved changes
  (amber) or a saved draft (accent).
- **Previews.** User and Guest views remove every editing control and show
  the published content; Guest also shows the guest appearance
  (`PergamonTheme.previewSignedIn(false)`: default palette, signed-out
  Atlas Navigation row) without signing out. A bar at the bottom says which
  view is shown and returns to Admin view. Unsaved edits stay in the working
  copy and reappear, with the open drawer, in Admin view.
- **Loading.** `workspace.js`, `drawer.js` and `cms-admin.css` are loaded by
  `admin.js` only after verification; visitors download none of them.

## 5b. Card editing (implemented in M4)

- **States** (`scripts/cms/workspace.js`): *published* and *saved draft*
  come from `get_draft('home')`; the *working copy* starts as the draft (or
  the published version) and lives only in this tab
  (`sessionStorage['pa-cms-working:<supabase url>:home']`, re-validated on
  load, cleared on sign-out). Admin view draws the working copy; while Admin
  Mode is on, `loader.hold(true)` stops a fresh published version from
  being drawn over it (it's still recorded: `loader.published()`). Each card
  is *unsaved* (working ≠ its base), *in draft* (draft ≠ published) or
  *published*.
- **Fields** come from one declarative schema, `content.cardFields(id)`
  (`CARD_FIELDS` in `scripts/cms/content.js`): featured/spotlight → Title,
  Button label, Destination link; carousel tiles → Title, Category,
  Destination link; Description only if a card already has one (none in
  schema v1). `content.checkField` mirrors the server's limits (60/40/24
  characters, no `<`/`>`, no control or bidi characters, site paths only,
  fixed categories). Links are chosen from the live games (`data/entries.js`)
  or, for featured/spotlight, typed as a site path; the server's
  `site_content_routes` decides (its answer is shown on the field).
- **Drawer** (`scripts/cms/drawer.js`): one editor for every card. Valid
  values go straight into the working copy and the card is redrawn at once
  (`PergamonHome.render`; `PergamonHome.reveal(id)` keeps the card on the
  carousel page). Desktop: docked on the right, the page narrows beside it.
  ≤ 900px: a bottom sheet with room added below the page. Leaving a card
  with unsaved changes (another pencil, close, Escape) asks Save Draft /
  Discard / Cancel. Ctrl/⌘+S saves.
- **Save Draft** sends the whole working copy (every card, so other cards'
  content is kept) with the draft id it was based on: `save_draft(home, doc,
  expected)`. If another administrator saved since, the server answers
  `PT409` and writes nothing; the drawer explains it, keeps the local edits
  and offers *Combine and save* (re-applies this browser's changed cards on
  top of the newer draft; if both changed the same card it says so and the
  button reads *Keep my version and save*), *Use their draft* (needs a
  second click; drops the local edits) or *Not now*. Network failures and
  `PT422`/`PT403` answers keep the edits and say what happened.
- Not in M4: images (M5), publishing (M6), discarding a saved draft,
  card creation, version history.

## 6. Hardening

| Item | State |
|---|---|
| supabase-js pinned to 2.118.0, served from `/vendor/supabase-js/`, SRI `sha384` on every page; tarball verified against npm's integrity | **done** on this branch |
| Content-Security-Policy-Report-Only: strict policy on all non-game pages (`script-src 'self'` + hashes of the 6 inline `loadSnippets` calls; `style-src` + hash of the inline `<style>` on /suggestions/; Google Fonts; production Supabase only); permissive policy on game pages (AdSense needs `'unsafe-inline'`, Google ad hosts and a `www.google.com` frame). Scanned on all 17 pages: no violations | **done**, report-only |
| `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` | **done** |
| Explicit per-environment Supabase config (`tools/write-supabase-config.mjs` as the Vercel build command; previews → staging) | **done** on this branch (see STAGING.md) |
| Legacy exposures (`homepage_settings.updated_by`, listable `homepage` bucket) and profiles grants | **proposed** in `0010_legacy_hardening.sql` (optional) |

Inline hashes are of the text as the browser parses it: HTML parsing turns
CRLF into LF, so hash multi-line blocks after normalising line endings
(the hashes are in `vercel.json`; any edit to those inline blocks changes
them). Before enforcing the CSP: move the inline `loadSnippets(...)` calls into
data attributes (so hashes can't drift), add the staging Supabase host for
previews, decide whether to add `frame-ancestors 'none'` (ignored in
report-only mode, so it isn't in the policy yet) and consider a report
endpoint. Game pages can't get a strict policy while AdSense runs inline.

## 7. Decisions still open

1. Server-side resizing of published images (see §4).
2. Whether to apply the optional `0010_legacy_hardening.sql` to production.
3. When to switch the CSP from report-only to enforced on non-game pages.
4. Whether to keep `PUBLISH_MEDIA_ALLOWED_ORIGINS` to fixed domains for
   staging (previews have changing URLs; a stable preview alias helps).
