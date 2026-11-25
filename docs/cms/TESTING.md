# Tests

## Run

| Changed | Run (from the repository root unless shown) |
|---|---|
| CMS code, migrations, functions, build config | `cd tests/cms`, then `npm test` (first time: `npm install`) |
| Any migration 0013 onward, or schema 2 | Also the same with `CMS_EXTRA_MIGRATIONS=0013_site_sidebar,0014_page_layout,0015_studio_documents` (and with `,0016_game_library`, proposed) |
| Design registries, styles, grid, the Widgets catalogue, the Studio, the local development server, a page's `<head>`, the vision | `node --test "tests/design/*.test.mjs"` |
| `scripts/design/typography.js` | `node tools/build-typography.mjs` (`--check` to verify) |
| `docs/design/ATLAS_VISION.md` | `node tools/build-vision.mjs` (`--check` to verify) |
| The page renderer, the loader, Admin Mode, the registries | Also `tests/site/` (below) |
| Documentation only | The check for its generated copy, if any; links and paths exist |

`tests/cms/staging-*.mjs` **write to staging**: run them only with approval.
The other tests need no Supabase project, and none touches production. Each
test file's header says what it covers; the table below has the original CMS
suites.

## What the CMS suites cover

| File | Covers |
|---|---|
| `db.test.mjs` | 0008 + 0009 (+ 0011) on an emulated Supabase (roles, default grants, `auth.uid()`, storage RLS) with production's 0001–0006 applied first. Authorization for guest / user / admin / service role, role spoofing, direct table access, draft privacy, validation (34 malformed or unsafe documents), conflicts, atomic publish, concurrent publish, failed-publish recovery, rollback, immutability, upload reservations, draft-bucket and public-bucket policies, prepared-media rules, identical uploads sharing one public copy (0011) without loosening the path/hash rule, write-once fields or service-role-only recording. |
| `content`, `collections`, `saved-cards`, `site-sidebar`, `page-layout`, `layout-editing` `.test.mjs` | See their headers (0012–0014 and the editor). |
| `game-library.test.mjs` | 0016 (proposed): the Game Library and the Games page, references, what visitors receive, authorization, that everything valid before is judged and answered as before, and its preflight, verification and recovery scripts. |
| `studio-documents.test.mjs` | 0015, and the Studio's storage and store through it. See its header. |
| `hardening.test.mjs` | Optional 0010: profiles privileges, `homepage_settings` column grant, legacy bucket listing. |
| `function.test.mjs` | `publish-media` handler and byte checks with in-memory Auth/DB/Storage: real PNG/JPEG/WebP fixtures, SVG/GIF/HTML/EXE/truncated/oversized/huge-dimension rejection, auth, admin check, CORS, request shape, path tampering, type mismatch, failed copy/record and retry. |
| `config.test.mjs` | `tools/write-supabase-config.mjs`: production/preview/development separation, secret-key refusal, malformed input. |
| `editor.test.mjs` | Card editor logic: the declarative field schema (`content.cardFields`, `checkField` against the server's limits and unsafe links) and `workspace.js` (published / draft / working states, Save Draft keeps other cards, discard, tab-scoped persistence and tampering, conflicting saves never overwrite, combine / use theirs). |
| `images.test.mjs` | Card images (`scripts/cms/images.js`): the image slot and its parts in the schema, file checks by content (PNG/JPEG/WebP only, 5 MB, 10,000px), desktop / phone framing in schema v1's fields (each layout independent, server ranges, reset, match desktop, replacement), geometry matching the homepage CSS and drag maths, the upload store against a fake Supabase (issued path only, signed previews, failures and tampered answers change nothing, no retry loop), and image edits through the workspace (saved with text, discard, revert, conflicts). |
| `publish.test.mjs` | Publishing (`scripts/cms/publish.js`): the change summary (per card, framing as each layout shows it, new images), the sequence against a fake server (only unprepared images of the draft are prepared, publish only after all are ready, a failed image publishes nothing and a retry skips prepared ones, stale draft / live version refused, concurrent publishes create one version), and the workspace after publishing (excluded edits stay unsaved). |

## Browser checks (`tests/site/`)

They need the local development server and an installed Playwright (not a dependency;
`lib.mjs` says how it is found). The database is emulated and sign-in is a stand-in:
nothing leaves the machine, and they say nothing about real authentication. Run one at
a time.

| File | Use |
|---|---|
| `snapshot.mjs` | What visitors see of the homepage, before and after a change that must not alter it: markup, geometry, styles, pictures, requests (43 views). |
| `admin.mjs` | Admin Mode end to end, before and after: what an administrator sees and what the database holds at each step. Two transcripts must be the same. |
| `header.mjs` | The shared header on every page, for guests, members and administrators: the administrator controls, Admin Mode by page, sign-in and sign-out, every width. |
| `games.mjs` | The Games page: games, destinations, artwork, availability and stored overrides, the shared frame, every width, palette and mode, the sidebar, keyboard, the ad tag. |
| `widgets.mjs` | Page Heading and Card Grid, and widgets that grow: drawing at every width, palette and mode, and editing them in both modes on a made-up page. |
| `second-page.mjs` | A made-up second page on the shared code: its own content, cache, draft and ids; Site Navigation from the homepage. |

Not covered by a committed suite: the games themselves, account pages and redirects.

## What the emulation can't prove (run on staging)

1. The real Storage API: bucket size and MIME limits, `upsert: false`, signed
   URLs for draft previews, public URL serving, listing denied for anon/users.
2. PostgREST: HTTP status mapping of `PTnnn` errors; RPC over GET for
   `get_published_content`; direct REST requests to the CMS tables as anon,
   user and admin (expect 401/403/empty).
3. The deployed Edge Function: JWT verification, CORS from the preview
   origin, a real draft → public copy, retry after a forced failure.
4. Real concurrency: two browsers saving/publishing at once. (0016: `CONCURRENCY-0016.md`.)
5. End-to-end: admin uploads → prepares → saves → publishes → visitor sees
   the new version without a deploy → rollback restores the previous one.

None of these touch production: they run against the staging project only.
