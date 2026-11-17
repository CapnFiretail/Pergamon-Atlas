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
| `db.test.mjs` | 0008 + 0009 on an emulated Supabase (roles, default grants, `auth.uid()`, storage RLS) with production's 0001–0006 applied first. Authorization for guest / user / admin / service role, role spoofing, direct table access, draft privacy, validation (34 malformed or unsafe documents), conflicts, atomic publish, concurrent publish, failed-publish recovery, rollback, immutability, upload reservations, draft-bucket and public-bucket policies, prepared-media rules. |
| `hardening.test.mjs` | Optional 0010: profiles privileges, `homepage_settings` column grant, legacy bucket listing. |
| `function.test.mjs` | `publish-media` handler and byte checks with in-memory Auth/DB/Storage: real PNG/JPEG/WebP fixtures, SVG/GIF/HTML/EXE/truncated/oversized/huge-dimension rejection, auth, admin check, CORS, request shape, path tampering, type mismatch, failed copy/record and retry. |
| `config.test.mjs` | `tools/write-supabase-config.mjs`: production/preview/development separation, secret-key refusal, malformed input. |

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
