# CMS / Admin Mode: production rollout runbook

Status: **completed 2026-11-18; historical record.** Not a description of
production today: see [`../STATUS.md`](../STATUS.md).

## Audit findings (2026-11-18)

| Area | Finding |
|---|---|
| Branches | `main` = `bd38af4` (local = remote). `development/v1-admin-infrastructure` is `main` + 16 commits, no divergence: the merge is a fast-forward. |
| Production site | Deployment `dpl_2p7AhJLkKTwgTDGw7x2E5NywpRX2` (from `bd38af4`), canonical origin `https://www.pergamonatlas.com` (the apex redirects there). |
| Production database | Legacy schema only (0001–0006: `profiles`, `homepage_settings`, `atlas_visibility_overrides`, `homepage` bucket). No CMS tables, functions or buckets; no `is_admin()` (so 0008 creates it, nothing is replaced). |
| Production Edge Functions | None deployed; no function secrets. |
| Session signing | Both projects publish ES256 keys, so production's `publish-media` is deployed like staging's (`--no-verify-jwt`; the function verifies the user and the admin role itself). |
| Vercel variables | Production scope: its own `PERGAMON_SUPABASE_URL` (production ref) and publishable key; the build script accepts them. Preview/Development: staging. |
| Build guard | `tools/write-supabase-config.mjs` (the `buildCommand`) fails the build if production points elsewhere, if a preview points at production, or if a key is secret/service-role. |
| CMS switch | `scripts/cms/loader.js`: `LIVE.production = false`. After the merge, production keeps the static homepage and Admin Mode stays unavailable until this one line is changed. |
| Legacy exposure | Anonymous visitors can read `homepage_settings.updated_by` (an admin's user id). 0010 fixes it, together with `homepage` bucket listing and `profiles` grants. |

## Isolation

- **Production can't reach staging data.** Its browser config is generated
  from Production-scope variables, and the build refuses any non-production
  ref. The staging config committed for local development is overwritten
  on every Vercel build; if the build step fails, the deploy fails.
- **Staging can't modify production.** The staging Edge Function only has
  the staging project's own injected credentials. Sessions are signed per
  project, so staging tokens are rejected by production. Previews refuse
  the production ref at build time.
- **Residual:** the report-only CSP lists both Supabase hosts in
  `connect-src`. That isn't a path in today's code; restrict production's
  CSP to the production host when the CSP is enforced.

## Decisions needed

1. **0010** (legacy hardening): apply with the CMS rollout? Recommended:
   yes, it has been on staging throughout testing.
2. **Production administrators:** which accounts have `profiles.role =
   'admin'` (pre-flight query 3)? Each of them gets Admin Mode.
3. **`PUBLISH_MEDIA_ALLOWED_ORIGINS` for production:**
   `https://www.pergamonatlas.com` only (recommended; the apex redirects),
   or the apex as well.
4. **Phasing:** merge with the CMS off first (phase A), then database and
   function (B, C), then switch it on (D). Recommended, so each step is
   small and independently reversible.
5. **First publish:** publish an unchanged copy of the current homepage as
   version 1 (no visible change), then make real edits.

## Sequence

### Phase 0: backups and baselines
1. Supabase (production) → Database → Backups: confirm a recent backup
   exists, or take one (on a plan without on-demand backups, export the
   `public` schema and data from the SQL Editor or with `pg_dump`).
2. Note the current Vercel production deployment
   (`dpl_2p7AhJLkKTwgTDGw7x2E5NywpRX2`) for instant rollback.
3. Supabase → Authentication → URL Configuration: confirm the Site URL is
   `https://www.pergamonatlas.com` and the redirect URLs cover the
   production domains (the CMS adds no auth flow; this is just a baseline).

### Phase A: merge, CMS off
1. Fast-forward `main` to the approved development commit; Vercel builds
   production (build log: `supabase-config.js: production ->
   https://rddijjezqrcjrnwskenb.supabase.co`).
2. Smoke tests A: homepage, games, account pages and settings load with no
   errors; the served `supabase-config.js` says `production` and the
   production project; no request goes to `/rest/v1/rpc/get_published_content`
   (the CMS is off); sign-in and password reset work; no Admin Mode button.

### Phase B: database (production SQL Editor, in order)
1. `supabase/proposed/preflight_production_readonly.sql`: all expected
   answers.
2. `0008_site_content.sql` → `0009_site_media.sql` → `0010_legacy_hardening.sql`
   (if approved) → `0011_shared_public_media.sql`.
3. Verify: as anon, `rpc/get_published_content?p_page=home` → `null`;
   `rpc/get_draft` → refused; buckets `site-media` (public) and
   `site-media-drafts` (private) exist with 5 MB limits; anon `select *` on
   `homepage_settings` no longer returns `updated_by` (if 0010 applied).
4. The live site is unaffected (the CMS is still off in code).

### Phase C: Edge Function
1. `npx.cmd supabase@2.122.1 functions deploy publish-media --project-ref
   rddijjezqrcjrnwskenb --use-api --no-verify-jwt`
2. `npx.cmd supabase@2.122.1 secrets set --project-ref rddijjezqrcjrnwskenb
   PUBLISH_MEDIA_ALLOWED_ORIGINS=https://www.pergamonatlas.com`
3. Verify: OPTIONS from the production origin → 204 with CORS headers;
   from any other origin → 403; POST without a session → 401; with a
   non-admin session → 403.

### Phase D: switch on
1. One-line commit on `main`: `LIVE.production = true` in
   `scripts/cms/loader.js`; deploy.
2. Smoke tests D:
   - guest: the homepage looks exactly as before (nothing published, so
     the static copy), one `get_published_content` request, no errors;
   - admin: the Admin Mode button appears; regular user: it doesn't;
   - first publish (decision 5): save the unchanged homepage as a draft,
     publish it as version 1, and the guest page is identical;
   - upload one small test image to a carousel tile, publish it, and the
     guest sees it from `site-media`; revert by publishing the previous
     content or `rollback`;
   - all browser traffic goes to `rddijjezqrcjrnwskenb` only.

## Rollback

| Problem | Action | Effect |
|---|---|---|
| Phase A site issue | Vercel → Deployments → promote `dpl_2p7AhJLkKTwgTDGw7x2E5NywpRX2` (instant), then revert the merge on `main` | Back to today's site |
| CMS misbehaves after D | Commit `LIVE.production = false` (or promote the phase A deployment) | Static homepage, Admin Mode off; data kept |
| Bad published content | Admin publishes a fix, or `rollback(home, <earlier version>, <current>)` | New version restores old content; history kept |
| Edge Function issue | Unset or narrow `PUBLISH_MEDIA_ALLOWED_ORIGINS`, or delete the function | Publishing new images stops; published images keep working |
| Database | The CMS migrations are additive and unused while the CMS is off, so leaving them in place is harmless; each file ends with reference rollback SQL. 0010 has a rollback block. Restore from the phase 0 backup only as a last resort. | — |

## H5.3 release (2026-11-23) and Gate 7

Production went from `41d691b` to `d6c2cee`, after migrations 0013 and 0014.

| Check | Result |
|---|---|
| Staging image publishing from a schema-2 page | Passed, 24/24 |
| Preview | Passed, 29/29 |
| Migrations 0013 and 0014 in production (run by the user) | Passed, 7/7 and 8/8 |
| Production after release | Passed, 23/23 |
| Admin inspection (user) | Passed, 10/10 |

**Gate 7, the first production schema-2 publish, was closed early on 2026-11-24
by the user's decision.**

| Step | Result |
|---|---|
| Backup of version 52; isolated admin session | Passed (session user-reported) |
| Saving a schema-2 draft in production (draft 53) | Passed (user-reported) |
| Public homepage unchanged while that draft existed | Passed, 31/31 |
| Second draft (54) | Saved; its contents were not checked |
| Discarding the draft | Passed: 53 and 54 are superseded, no draft remains |
| Final state (user's query) | Live 52, schema-1 content and the history to 52 unchanged |
| Publishing schema 2, and restoring from it | **Deferred: not tested in production.** Local rehearsal only, 28/28 |
