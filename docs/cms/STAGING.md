# Staging environment for the CMS

Set up and in use: Vercel previews and local development use the separate
**staging** project. The numbered steps below are the record of how it was set
up; for daily work read only *Keeping production isolated*.

| Where | Supabase project |
|---|---|
| Production (pergamonatlas.com) | production `rddijjezqrcjrnwskenb` |
| Vercel previews | staging `rambkiswuigtjfgdxexk` |
| Local development / tests | staging, or the in-process emulation in `tests/cms` |

## Steps that need you (Supabase / Vercel owner)

### 1. Create the project

1. Supabase Dashboard → **New project** in the same organisation. Name:
   `pergamon-atlas-staging`. Same region as production. Store the database
   password in your password manager (it isn't needed day to day).
2. **Project Settings → API**: note the **Project URL**
   (`https://<staging-ref>.supabase.co`) and the **publishable** key
   (`sb_publishable_…`). Do **not** copy the secret / service-role key
   anywhere outside Supabase.

### 2. Apply the schema

Supabase Dashboard → **SQL Editor**, run each file's full contents in order:

1. `supabase/migrations/0001_pergamon_profiles.sql` … `0006_homepage_featured_trio.sql`
   (makes staging match production)
2. `supabase/proposed/0008_site_content.sql`
3. `supabase/proposed/0009_site_media.sql`, then
   `supabase/proposed/0011_shared_public_media.sql` (identical images share
   one public copy; on staging since 2026-11-18, see ARCHITECTURE §8)
4. optionally `supabase/proposed/0010_legacy_hardening.sql` (to test it before production)

Then check **Storage**: buckets `site-media-drafts` (private) and
`site-media` (public) exist with a 5 MB limit.

### 3. Auth settings and test accounts

1. **Authentication → URL Configuration**: Site URL = the branch's preview
   alias (Vercel → the deployment → **Domains**; Vercel shortens long branch
   names, so copy it from there); add Redirect URLs
   `https://*-cms12306-9421s-projects.vercel.app/**` and `http://localhost:4173/**`.
2. **Authentication → Users → Add user** (tick *Auto confirm*):
   `staging-admin@<your domain>` and `staging-user@<your domain>`, with
   strong passwords kept in your password manager.
3. SQL Editor (promote the admin; the id is on the Users page):
   ```sql
   update public.profiles set role = 'admin' where id = '<staging-admin user id>';
   ```

### 4. Edge Function

Use the Supabase CLI through `npx`, pinned (a global `npm i -g supabase`
install is not supported). In Windows PowerShell call `npx.cmd`, because
script execution policy blocks `npx.ps1`. Docker isn't needed: `--use-api`
bundles the function on Supabase's side.

1. Log in once, in a normal PowerShell window (the login asks you to type
   a code):
   ```powershell
   npx.cmd supabase@2.122.1 login
   ```
   The token is stored under your user profile and can reach every project
   in the account, so always pass `--project-ref`, and revoke it at
   https://supabase.com/dashboard/account/tokens when you no longer need it.
2. Set the allowed origins (comma-separated, no spaces):
   ```powershell
   npx.cmd supabase@2.122.1 secrets set --project-ref <staging-ref> PUBLISH_MEDIA_ALLOWED_ORIGINS=http://localhost:4173
   ```
   Add the preview alias when previews are connected (step 5).
3. Deploy:
   ```powershell
   npx.cmd supabase@2.122.1 functions deploy publish-media --project-ref <staging-ref> --use-api --no-verify-jwt
   ```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
provided to functions by Supabase automatically; never set them anywhere
else.

**Why `--no-verify-jwt`.** That flag only turns off the gateway's built-in
JWT check, which is designed for sessions signed with the legacy JWT secret.
New projects (staging included: its `/auth/v1/.well-known/jwks.json`
publishes an ES256 key) sign sessions with asymmetric keys, which that check
may reject. The function itself still refuses every request without a valid
session: `handler.ts` requires a bearer token, validates it with Supabase
Auth (`auth.getUser`), and then reads `profiles.role` with the service key.
Before deploying to production, check production's JWKS: if it still uses
the legacy secret, the gateway check can stay on as an extra layer.

### 5. Vercel environment variables

Vercel → Project `pergamon-atlas` → Settings → **Environment Variables**:

| Name | Production | Preview | Development |
|---|---|---|---|
| `PERGAMON_SUPABASE_URL` | `https://rddijjezqrcjrnwskenb.supabase.co` | `https://<staging-ref>.supabase.co` | staging URL |
| `PERGAMON_SUPABASE_PUBLISHABLE_KEY` | production publishable key (already public in the site) | staging publishable key | staging key |

Both are public values. No secret is ever added to Vercel for the CMS.

### 6. Tell me

Send the staging **project ref** and **publishable key** (both public), and
confirm steps 2–5. If you'd rather I run steps 2 and 4, a short-lived
Supabase personal access token for the CLI works; revoke it afterwards.

## Steps I do after that (on the development branch, with your approval)

1. ✅ Wire the config: `vercel.json` → `"buildCommand": "node tools/write-supabase-config.mjs"`.
   The script refuses to build a preview that points at production, refuses
   secret keys, and fails a production build that lacks its values (so a
   misconfiguration leaves the current production deployment live).
   The committed `supabase-config.js` is the local-development copy and
   points at staging; every Vercel build overwrites it for its environment.
2. ✅ Make `supabase.js` tolerate an unconfigured build (auth disabled instead
   of an error), and make `theme.js` recognise any project's session key.
3. ✅ Add the staging host to the report-only CSP.
4. Add the preview alias to staging Auth redirect URLs and to
   `PUBLISH_MEDIA_ALLOWED_ORIGINS`, then run the staging integration tests
   (see TESTING.md) against the preview.

Production builds need the Production-scope variables (set in step 5); without
them the build fails and the previous production deployment stays live.

## Keeping production isolated

- The production publishable key and URL stay in the Production scope only;
  previews physically cannot load them (the build
  refuses).
- Migrations reach production only after approval, by running the reviewed
  files in the production SQL editor, in order, after a backup
  (Database → Backups).
- The Edge Function is deployed to production separately
  (`--project-ref rddijjezqrcjrnwskenb`) with production origins only.
