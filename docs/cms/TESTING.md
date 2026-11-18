# CMS tests

## Run

```sh
cd tests/cms
npm install      # once: PGlite 0.5.14 (Postgres 17 in-process), dev only
npm test         # node --test: database, hardening, Edge Function, config
```

## What runs today (no Supabase project needed)

| File | Covers |
|---|---|
| `db.test.mjs` | 0008 + 0009 (+ 0011) on an emulated Supabase (roles, default grants, `auth.uid()`, storage RLS) with production's 0001–0006 applied first. Authorization for guest / user / admin / service role, role spoofing, direct table access, draft privacy, validation (34 malformed or unsafe documents), conflicts, atomic publish, concurrent publish, failed-publish recovery, rollback, immutability, upload reservations, draft-bucket and public-bucket policies, prepared-media rules, identical uploads sharing one public copy (0011) without loosening the path/hash rule, write-once fields or service-role-only recording. |
| `hardening.test.mjs` | Optional 0010: profiles privileges, `homepage_settings` column grant, legacy bucket listing. |
| `function.test.mjs` | `publish-media` handler and byte checks with in-memory Auth/DB/Storage: real PNG/JPEG/WebP fixtures, SVG/GIF/HTML/EXE/truncated/oversized/huge-dimension rejection, auth, admin check, CORS, request shape, path tampering, type mismatch, failed copy/record and retry. |
| `config.test.mjs` | `tools/write-supabase-config.mjs`: production/preview/development separation, secret-key refusal, malformed input. |
| `editor.test.mjs` | Card editor logic: the declarative field schema (`content.cardFields`, `checkField` against the server's limits and unsafe links) and `workspace.js` (published / draft / working states, Save Draft keeps other cards, discard, tab-scoped persistence and tampering, conflicting saves never overwrite, combine / use theirs). |
| `images.test.mjs` | Card images (`scripts/cms/images.js`): the image slot and its parts in the schema, file checks by content (PNG/JPEG/WebP only, 5 MB, 10,000px), desktop / phone framing in schema v1's fields (each layout independent, server ranges, reset, match desktop, replacement), geometry matching the homepage CSS and drag maths, the upload store against a fake Supabase (issued path only, signed previews, failures and tampered answers change nothing, no retry loop), and image edits through the workspace (saved with text, discard, revert, conflicts). |
| `publish.test.mjs` | Publishing (`scripts/cms/publish.js`): the change summary (per card, framing as each layout shows it, new images), the sequence against a fake server (only unprepared images of the draft are prepared, publish only after all are ready, a failed image publishes nothing and a retry skips prepared ones, stale draft / live version refused, concurrent publishes create one version), and the workspace after publishing (excluded edits stay unsaved). |

The site regression suite (Playwright; homepage geometry, cards, carousel,
themes, navigation, games, account pages, redirects) also checks the pinned
supabase-js and reports report-only CSP violations per page.

## What the emulation can't prove (run on staging)

1. The real Storage API: bucket size and MIME limits, `upsert: false`, signed
   URLs for draft previews, public URL serving, listing denied for anon/users.
2. PostgREST: HTTP status mapping of `PTnnn` errors; RPC over GET for
   `get_published_content`; direct REST requests to the CMS tables as anon,
   user and admin (expect 401/403/empty).
3. The deployed Edge Function: JWT verification, CORS from the preview
   origin, a real draft → public copy, retry after a forced failure.
4. Real concurrency: two browsers saving/publishing at once.
5. End-to-end: admin uploads → prepares → saves → publishes → visitor sees
   the new version without a deploy → rollback restores the previous one.

None of these touch production: they run against the staging project only.
