# Pergamon Atlas CMS — architecture

Live in production. Which migrations are applied where, and what is open, is in
[`../STATUS.md`](../STATUS.md). Migration files stay in `supabase/proposed/`.

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
    // 0012: saved (inactive) cards per slot, optional
    "home.featured.saved":  { "order": ["summer-cup", ...] },     // ≤ 12 ids
    "home.featured.saved.summer-cup": Card,                       // one per id
    "home.spotlight.saved": { "order": [...] }, "home.spotlight.saved.<id>": Card,
    // 0013: Site Navigation (the sidebar on every page), optional; site-wide,
    // stored here to share this document's draft / publish / history
    "site.sidebar": { "sections": [ { "items": [
      { "id": "home", "label": "Home", "icon": "home", "href": "/", "visible": true }, ...
    ] }, ... ] },                                                  // ≤ 4 groups, ≤ 12 each, ≤ 16 in all
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

**Schema 2 (0014, §11)** adds the page's layout (`regions` of widget
instances) and lets any number of instances have cards like these; the schema-1
document above stays valid, and stays schema 1 until its layout is changed.

**Saved cards (0012).** `home.featured` / `home.spotlight` stay the
**active** cards, in the same place and shape as before, so the public
renderer, the static fallback and older cached scripts are unaffected. Each
slot may also keep up to 12 saved cards (`<slot>.saved` lists their ids in
order; each is a full Card, validated by the same `cms_check_card`). Making a
saved card active swaps it with the active card inside the draft: nothing is
overwritten or deleted. `get_published_content` leaves the saved lists and
cards out (visitors receive only what they see, and only those images);
administrators read the whole document through `get_draft`, and rollback
restores it whole. Limits live in `content.js` `LIMITS` and in
`validate_content` (a unit test checks they agree).

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

Identical uploads (`0011_shared_public_media.sql`): public copies are named
by content, so uploads with the same bytes share one public object, and
each upload keeps its own `site_media` row pointing at it (0011 removed 0009's
`UNIQUE (public_path)`; a plain index remains). `cms_record_prepared_media`
still only accepts the path derived from the row's own hash and type, so a
row can only point at a copy of its own content.

Orphan clean-up (later, service role, scheduled): public objects whose
`site_media` row has `published_at is null` and `prepared_at` older than 30
days, and draft originals whose row was never prepared after 30 days, can be
removed; images used by any published or archived version are kept so
rollback always works. Since 0011, delete a public object only when **no**
`site_media` row references its path (another upload may share it).

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
limits) before drawing. The `LIVE` table in `loader.js` switches it per
environment (`PERGAMON_ENV`); it is on in all of them.

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

- **Who sees it.** Runs only where the loader is live (§5). On
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
  re-applies them when the carousel redraws its cards or the document is
  redrawn. While Admin view is on, the carousel stops gliding
  (`PergamonHome.holdMotion`) and shows its real cards from the first one
  (the moving row's inert copies carry no pencils). No card box changes size. A badge on the pencil shows unsaved changes
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
  (`PergamonHome.render`; `PergamonHome.reveal(id)` keeps the card in
  view in the carousel). Desktop: docked on the right, the page narrows beside it.
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

## 5c. Card images (implemented in M5)

No schema or migration change: framing uses schema v1's art fields and
uploads use 0009 (`create_media_upload`, `get_media`, `site-media-drafts`).

- **Schema:** each card type's field list ends with an image slot
  (`type: 'image'`, key `art`) with its own `parts`: *Image description*
  (`alt`, optional, ≤ 140) for every card, and *Edge colour* (`base`,
  `#rrggbb`) for the spotlight, shown only for `fit: 'height'` art. A card
  type without an image slot shows no image controls.
- **Framing** (`scripts/cms/images.js`), stored in the art, never in the file:

  | Layout | cover art (featured, tiles) | `fit: 'height'` (spotlight) |
  |---|---|---|
  | Desktop | `focus`, `scale` (1–3) | `anchor` {x, offset, y}, `scale` (0.5–3) |
  | Phone (≤ 640px of content) | `focusNarrow`, `scaleNarrow` | `anchorNarrow`, `scaleNarrow` |

  With no phone fields the phone follows the desktop framing. Changing one
  layout never changes the other: a desktop edit first writes out a custom
  phone framing in full (so a shared value can't carry over). *Reset* centres
  the layout at zoom 1; *Match Desktop* removes the phone fields. A new image
  keeps the slot's drawing (fit, edge colour), starts centred, phone
  following, with an empty description.
- **Editor** (`scripts/cms/image-editor.js`, in the drawer): Desktop / Phone
  tabs (the first opens on the layout visitors on this screen get); a stage
  showing a copy of the card drawn by the homepage's own code and CSS
  (`PergamonHome.sample`) at a 1440px-screen (desktop) or 390px-screen
  (phone) size, the whole picture faded around it and the crop outlined.
  Drag (pointer, touch, or arrow keys; the stage has `touch-action: none`, so
  dragging never scrolls) and the zoom slider redraw the stage and the page's
  card live (`PergamonHome.previewArt`) and go into the working copy when the
  gesture ends, so images behave like text fields: unsaved state, Save Draft,
  Discard, the leave prompt and conflicts are M4's.
- **Uploads:** PNG / JPEG / WebP, ≤ 5 MB, ≤ 10,000px a side; the type is
  read from the bytes; GIF, SVG, empty, damaged and oversized files are
  refused before anything is sent. Small (below the slot's
  `recommendedWidth`) or heavy (> 2 MB) images get a warning. An accepted
  file is reserved (`create_media_upload`), uploaded to the one private path
  issued, and shown through a signed URL. Save Draft and leaving the card wait
  while an upload is in progress. *Revert to previous image* restores the
  saved art.
- **Privacy:** draft images live only in `site-media-drafts` (admin read,
  insert to an issued path once, no update or delete). The admin's browser
  resolves the working copy's images with `get_media` and signs previews for
  1 hour (re-signed before expiry); only Admin view draws them. User / Guest
  previews and visitors get published content and public images only.
  Anyone holding a signed URL can view that one image until it expires, and
  these URLs are only ever issued to admins.

## 5d. Publishing (implemented in M6)

No schema or migration change: the browser drives the existing
`publish-media` Edge Function and `publish` / `rollback` (0008).

- **Publish Changes** (Admin Mode panel) is enabled for a verified admin in
  Admin Mode when a saved draft exists. Opening the panel re-reads the
  server state (local edits are kept), so a draft another admin saved shows
  up. What is published is always the server's saved draft, never this
  browser's working copy.
- **Dialog** (`scripts/cms/publish-dialog.js`):
  1. reads `get_draft` again;
  2. if this browser has unsaved changes: *Save Draft and continue*, or
     *Publish saved draft only* (they stay local and unsaved), or Cancel;
     edits based on a draft another admin has since replaced must be saved
     (and combined) first;
  3. review: each changed card with what changed (title, button, link,
     category, new / added / removed image, desktop or phone framing as
     each layout shows it, description, edge colour) and how many uploaded
     images will become public. If the draft was started from an older
     live version (another admin published or rolled back since), it says
     so and Publish needs an extra explicit confirmation;
  4. Publish now (one at a time; repeated clicks are ignored, and the
     server refuses a consumed draft).
- **Sequence** (`scripts/cms/publish.js`, `run`): `get_media` for the
  draft's images; each one not yet public goes through `publish-media`
  (checks the bytes, copies to `site-media/media/<sha256>`, records it; a
  401 is retried once after refreshing the session); then
  `publish(home, draft_id, expected_live_id)`. Images not in the draft,
  such as reverted or replaced uploads, are never sent. The content keeps
  referencing images by media id; `get_published_content` returns their
  public paths. Any failure publishes nothing: the live version and the
  draft are unchanged and *Try again* skips images already prepared. An
  image prepared before a later failure has a public copy that nothing
  references (content-hashed name, not listed).
- **After publishing:** the workspace marks the draft as the new published
  version (excluded edits stay unsaved), `loader.refresh()` updates this
  browser's cache and published images, and every view follows. Visitors get
  the new version on their next visit; returning visitors see their cached
  copy first and the new version as soon as the M2 request answers.
- **Rollback:** `rollback(home, archived_version_id, expected_live_id)`
  republishes an earlier version as a new version; its images are already
  public. Admin Mode's Version History uses it (§5e).
- **Identical images** (re-uploading a picture that is already published,
  or using it on several cards) publish normally: each upload shares the
  one content-addressed public copy. This needs `0011_shared_public_media.sql`
  (§4, §8). Without 0011 such a draft can't be published (`record_failed`;
  nothing unsafe happens).

## 5e. Card collections and Version History (CMS Phase 2, 0012)

- **Manage cards** (`scripts/cms/manage.js`): a button beside the pencil on
  the Featured and Spotlight cards, and on the carousel's top edge (Admin
  view only, absolutely placed). The dialog lists the active card first,
  then the saved cards (thumbnail, state): Make active, Edit, Delete (asks
  first; Undo puts the card back exactly), reorder with the drag handle or
  Move up / Move down (announced). The carousel list does the same for its
  cards. Add card creates a saved card (or a carousel card at the end) and
  opens it in the card editor. Every change is a working-copy change: Save
  Draft, then Publish Changes.
- **Saved card editing**: the card editor edits a saved card in place; its
  slot shows it, with a "Preview: saved card, not active" badge, while the
  editor is open (Admin view only; visitors never get saved cards).
- **Add card tile**: in Admin view the carousel is a fixed row (no looping
  copies, no gliding; `glide.fix(true)`), and a dashed, card-sized Add card
  tile follows the cards (`glide` extras: never copied). The arrows scroll to
  it; keyboard focus brings it into view. With 24 cards it is disabled and
  says why. Visitors' carousel is unchanged.
- **Drafts**: `workspace.js` adds `addCard`, `removeCard`, `moveCard` and
  `activate`; added, deleted and reordered cards count as unsaved changes,
  Discard reverses each one, and a conflicting save combines per component
  (my version of what I changed, their added cards kept, lists tidied).
  Deleting a card never deletes its image or game.
- **Version History** (`scripts/cms/history.js`, Admin Mode panel): the 20
  newest published versions (`list_published_versions`, admin only) with
  date, publisher, "restored from" and the change summary against the
  previous version. Restore asks first, says it publishes immediately as a
  new version and keeps history, and warns about a saved draft (publishing
  it later would replace the restored version) and unsaved changes (kept).
  It calls `rollback` with the live version it showed, so a stale list is
  refused (PT409) and nothing changes.
- **Older editors** keep saved cards: they save the whole document they
  loaded, including components they don't know (`tests/cms/collections.test.mjs`
  runs the released modules; M7 runs the released site against staging).

## 6. Hardening

| Item | State |
|---|---|
| supabase-js pinned to 2.118.0, served from `/vendor/supabase-js/`, SRI `sha384` on every page; tarball verified against npm's integrity | **done** |
| Content-Security-Policy-Report-Only: strict policy on all non-game pages (`script-src 'self'` + hashes of the 6 inline `loadSnippets` calls; `style-src` + hash of the inline `<style>` on /suggestions/; Google Fonts; production Supabase only); permissive policy on game pages (AdSense needs `'unsafe-inline'`, Google ad hosts and a `www.google.com` frame). Scanned on all 17 pages: no violations | **done**, report-only |
| `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` | **done** |
| Explicit per-environment Supabase config (`tools/write-supabase-config.mjs` as the Vercel build command; previews → staging) | **done** (see STAGING.md) |
| Legacy exposures (`homepage_settings.updated_by`, listable `homepage` bucket) and profiles grants | **done** (`0010_legacy_hardening.sql`) |

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
2. When to switch the CSP from report-only to enforced on non-game pages.
3. Whether to keep `PUBLISH_MEDIA_ALLOWED_ORIGINS` to fixed domains for
   staging (previews have changing URLs; a stable preview alias helps).

## 8. Migration 0011: shared public media

`supabase/proposed/0011_shared_public_media.sql` only drops
`site_media_public_path_key` and adds `site_media_public_path_idx`; it is
idempotent and touches no data.

Any future orphan clean-up must keep a public object while any `site_media`
row references its path.

Reverting 0011 (re-adding the unique constraint) only works while no two rows
share a path; once identical images are published that way, keep 0011.

## 5f. Site Navigation (H3, 0013)

- **What**: the sidebar's links on every regular page, as `site.sidebar` in
  the homepage document. It is site-wide configuration, independent of the
  homepage's cards and their order; it is stored here only so it shares the
  draft, Publish Changes, Version History and Restore (one publishing
  system). The Handbook's sidebar sections are defined in code and are not
  part of it.
- **Visitors** (`scripts/layout.js`): every page draws the last published
  Site Navigation this browser has (localStorage `pa-site-nav`) or the
  built-in links, then reads `get_published_content('home')` (on the
  homepage, the CMS loader's request) and redraws if it differs. A missing,
  invalid or unreachable answer keeps the built-in links (or the cached
  ones). The browser re-checks shape, icons, labels and destinations.
- **Editing** (`scripts/cms/site-nav.js`): Admin Mode panel › Site
  Navigation, or the pencil on the homepage's sidebar. Groups of links;
  per link: label, icon (fixed set), destination (the site's pages and live
  games only), visible; move up / down (across groups), add, remove with
  undo, add a group. Changes go into the working copy, so Admin view draws
  them on the homepage's sidebar at once; Save Draft is in the dialog (or
  any card editor), Publish Changes in the panel. The publish dialog and
  Version History name it "Site Navigation (every page)".
- **Security**: `cms_check_nav` (0013) accepts only the fixed icon list and
  internal destinations (`/`, the site's own pages, game pages from
  `site_content_routes`); never external, script, admin or Handbook URLs.
  Hiding or removing a link never protects a page: pages keep their own
  access checks (the Handbook its admin gate).

## 9. Migration 0012: saved cards and version history

`supabase/proposed/0012_saved_cards.sql` replaces `validate_content` and
`get_published_content`, and adds `cms_check_card` and `list_published_versions`; no table, policy,
bucket or data changes. Every existing document stays valid and the public
answer for a document without saved cards is byte-identical (checked on
staging before and after).

It comes before the code that saves saved cards (which would otherwise get
PT422; nothing unsafe). `anon` can execute only `get_published_content`, and
`authenticated` also `list_published_versions` (it checks `is_admin()`
itself). Revert (only
while no draft or published version uses saved cards): re-run 0008's two
functions and drop the two new ones.

## 10. Migration 0013: Site Navigation

`supabase/proposed/0013_site_sidebar.sql` (checked by `verify_0013.sql`) adds
`cms_check_nav` and replaces
`validate_content` (0012's body plus an optional `site.sidebar` checked by
`cms_check_nav`); no table, policy, grant or data changes. Every existing
document stays valid; `get_published_content` is unchanged and already
returns the component.

The code is safe without it: pages then show the built-in links (no published document has
`site.sidebar`), and saving a Site Navigation draft would be refused with
PT422 (the editor shows the error; nothing is stored). Revert (only while no
draft or published version contains `site.sidebar`): re-run 0012's
`validate_content`, then drop `cms_check_nav`.

## 11. Migration 0014: page layout, schema 2

`supabase/proposed/0014_page_layout.sql` (H5.3) lets the homepage document
describe its own layout, so widgets can be placed, resized, added and
removed as independent instances.

It only creates or replaces functions and their grants: no table, policy or
data changes.

```jsonc
{
  "schema": 2,
  "regions": [
    { "id": "upper", "frame": "sidebar", "rowHeight": 23.43,
      "stack": ["featured", "spotlight", "navigation"], "widgets": [
      { "id": "featured",   "type": "feature-hero",      "col": 1,  "row": 1, "cols": 14, "rows": 7 },
      { "id": "spotlight",  "type": "feature-spotlight", "col": 1,  "row": 8, "cols": 14, "rows": 4 },
      { "id": "navigation", "type": "atlas-navigation",  "col": 15, "row": 1, "cols": 6,  "rows": 11 } ] },
    { "id": "lower", "rowHeight": 23.43, "widgets": [
      { "id": "carousel",   "type": "carousel",          "col": 1,  "row": 1, "cols": 20, "rows": 10 } ] }
  ],
  "components": {
    "home.featured": Card, "home.featured.saved": { "order": [...] }, "home.featured.saved.<key>": Card,
    "home.spotlight": Card, …,
    "home.carousel": { "order": [...] }, "home.carousel.<key>": CarouselCard,
    "site.sidebar": { … }
  }
}
```

- **Instances.** A widget instance is a placement (in exactly one region) plus
  its content under `home.<instance id>`: a Card (with its own saved cards)
  for `feature-hero` / `feature-spotlight`, an `{ order }` list plus
  `.<key>` cards for a `carousel`, nothing for `atlas-navigation`. Two
  Featured widgets are two instances with two cards. Every component must
  belong to an instance (or be `site.sidebar`); nothing is orphaned, and a
  saved card is always listed in its instance's `.saved` order (without a list
  there can be none), so none goes unchecked.
  Today's keys become today's instances (`featured`, `spotlight`,
  `carousel`), so upgrading a schema-1 document renames nothing
  (`content.upgradeDocument`).
- **Server checks** (`cms_validate_home_v2`): allowlisted fields and types; 1–4
  regions with unique ids; `frame` only `"sidebar"`; `rowHeight` 8–400px;
  an optional `stack` (the order on narrow screens) listing every widget of
  its region once; ≤ 24 widgets with unique ids page-wide; whole-number positions and spans
  within 20 columns and 400 rows; no overlaps within a region; each instance's
  content checked with the existing card / carousel-card / list rules.
  Pixel content floors depend on screen width and fonts, so the editor
  checks them (`scripts/grid/atlas-grid.js`), not the server.
- **Schema 1 is unchanged**: its validator is 0013's, renamed
  `cms_validate_home_v1`; `validate_content` dispatches on the document's own
  `schema`. Rollback to any schema-1 version keeps working. Every existing CMS
  test passes with 0014 applied (`CMS_EXTRA_MIGRATIONS=0013_site_sidebar,0014_page_layout`).
- **Visitors** still receive no saved cards: `get_published_content` now
  strips `home.<any instance>.saved…`.
- **`site_pages.schema_version` stays 1.** `get_published_content` reports it
  and the loader still requires it; a document's own `schema` says which shape
  it is.
- **Tests:** `tests/cms/page-layout.test.mjs` (server and client must agree on
  every case).
- **The homepage draws both schemas.** `content.toModel`
  reads either schema: a schema-1 document is upgraded for drawing only (the
  stored document is never changed), so today's published content is drawn
  as the two regions above. `scripts/home.js` renders each region with the
  shared Atlas Grid renderer; a document whose layout fails
  `PergamonGrid.validatePage` is refused whole (the page keeps what it had).
  `content.validateDocument` accepts schema 2 (with the grid rules when the
  grid scripts are on the page), so the loader and its cache take schema-2
  documents.
- **Long titles.** Titles never go below a readable size (Hero 26px,
  Spotlight 20px; compact 30 / 24px; fallback font 22 / 18px). On the grid the
  sizing contracts guarantee the room; stacked cards are at least their
  authored height and grow with their content (layout data is untouched).
- **Before publishing a layout**, close or reload older tabs: a page loaded
  before H5.3 that receives a schema-2 document shows its built-in content, and
  an older Admin Mode tab would start from the built-in content too. Scripts and
  styles are revalidated on every load (a Cloudflare cache rule), so a reload is
  enough.
- **Not needed for content.** A document stays schema 1 until its layout
  changes, so without 0014 Admin Mode works exactly as before; only saving a
  layout is refused (PT422, shown as "This server can't store page layouts
  yet"), with nothing stored and the edits kept.

## 12. Layout Mode: the admin visual editor (H5.3)

Admin Mode on the homepage has two modes (panel › Edit): **Content**, as
before, and **Layout**, where the widgets themselves are selected, moved,
resized, added and removed on the page.

- **Code.** `scripts/cms/layout-mode.js` is wiring, the inspector and the
  scaled workspace. The grid
  side is the Layout Lab's shared code, loaded by `admin.js` only after
  `is_admin`: `grid/editor.js` (proposals; new here: `proposeAdd`,
  `proposeRemove`, `proposeStack`, `history.amend`), `grid/interaction.js`
  and `grid/overlay.js`, one of each per region over the homepage's own
  renderers (`PergamonHome.regions()`). The document side is the workspace.
  Visitors download none of it (checked: guest and member pages are
  byte-identical to before, scripts included).
- **Document.** `workspace.js` holds one undo / redo history for the whole
  document: cards, lists, Site Navigation, widgets. Typing in one field is one
  step; every gesture, key press, addition and removal is one step; undo
  reaches back past a save. `setRegion`, `addInstance`, `removeInstance` and
  `discardLayout` keep nothing the page couldn't show
  (`content.validateDocument`, with the grid rules). The first layout change
  turns a schema-1 document into schema 2; a layout back at today's homepage
  on a schema-1 base is schema 1 again.
- **Instances.** What an id means comes from the document
  (`content.ownerOf(id, ...docs)`; `cardType`, `isSaved`, `slotOf`, `listOf`
  and `cardFields` take documents too; without any they answer for today's
  homepage). New widgets get ids no known document uses (`featured-2`, …), so
  a new widget is never taken for a removed one. A new Featured / Spotlight
  starts with a placeholder card, a Carousel empty, and goes to the first free
  place of its default size in the chosen region. Removing a widget removes
  its cards and saved cards with it, in one undoable step. The card drawer,
  Manage cards, the Add card tile and the image editor work per instance.
- **Regions** are fixed: a widget stays in its region. "Earlier / Later on
  phones" changes the region's `stack` order; the grid doesn't move.
- **Widths.** A change must fit the region as it is in a 1280px window with
  the sidebar expanded (981px beside it, 1217px full width), or at its current
  width if narrower, and at every wider one.
- **Workspace** (windows over 900px). The page is laid out at desktop size
  (the window's width, at least a 1280px window's) and drawn with a transform
  on `#home`, scaled to fit beside a right-hand column: 360px, 320px up to
  1100px. The column holds the inspector and, over it, the card editor, so
  nothing covers a widget and opening the editor doesn't move or restack the
  page. Tall pages shrink to 60% (or what the width allows), then scroll; the
  canvas is never rescaled during a drag. `layout-mode.js` sets the variables
  (`--cms-canvas-*`, `--atlas-scale`) and removes them on leaving;
  `cms-admin.css` has the rules. The renderer, engine and controller are
  unchanged: they measure layout pixels, and the controller reads positions
  from the screen. The look is the shared canvas design
  (`styles/canvas-kit.css`): the dotted canvas fills the window beside the
  column (the footer is left out while arranging), Undo, Redo, Grid and the
  zoom float at its bottom left over 48px kept free below the page, and the
  selected widget has the round pencil and delete, which press the inspector's
  own buttons (the overlay's `actions`). `--atlas-scale` is also read by `grid-editor.css` (handles
  and outlines keep their on-screen size) and `glide.js` (a card's layout
  width); without it both are as before. At 900px and narrower nothing can be
  arranged, the page shows as it does there, and the inspector says so.
- **Saving, conflicts, publishing.** Save Draft, Publish Changes, Version
  History and Restore are the same calls. A conflicting save is combined
  widget by widget (a placement changed on one side only is kept; on both,
  this browser's, after asking); layouts that don't fit together are refused
  and nothing changes. The publish review and Version History list layout
  changes per widget; a draft or version whose layout this site wouldn't show
  can't be published or restored from the dialogs. Restoring a schema-1
  version brings back today's homepage, layout and content.
- **Image previews.** `PergamonHome.cardSize(id, layout, room)` gives the size
  a card's widget is really drawn at (its own or a saved card's), and the
  image editor builds the card in a grid slot of that size: in this window as
  if the drawer weren't docked; stacked at 390px for Phone. A widget too narrow
  for the wide card on any screen (560px or less) offers the phone framing only.
- **Tests.** `tests/cms/layout-editing.test.mjs` (workspace, history,
  instances, conflicts, draft → publish → rollback against 0014 in PGlite, and
  without it), `tests/design/grid-editor.test.mjs`, `page-layout.test.mjs`.
