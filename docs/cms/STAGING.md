# Staging environment for the CMS

Vercel previews currently use the **production** Supabase project (the
values are hard-coded in `operation/scripts/auth/supabase-config.js`). No
admin write may be tested until previews use a separate project.

Target:

| Where | Supabase project |
|---|---|
| Production (pergamonatlas.com) | production `rddijjezqrcjrnwskenb` |
| Vercel previews | **staging** (new) |
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
3. `supabase/proposed/0009_site_media.sql`
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

With the Supabase CLI (`npm i -g supabase`, then `supabase login`):

```sh
supabase functions deploy publish-media --project-ref <staging-ref>
supabase secrets set --project-ref <staging-ref> \
  PUBLISH_MEDIA_ALLOWED_ORIGINS="https://<preview alias>,http://localhost:4173"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
provided to functions by Supabase automatically; never set them anywhere
else. Keep **Verify JWT** on (the default).

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

1. Wire the config: `vercel.json` → `"buildCommand": "node tools/write-supabase-config.mjs"`.
   The script refuses to build a preview that points at production, refuses
   secret keys, and fails a production build that lacks its values (so a
   misconfiguration leaves the current production deployment live).
2. Make `supabase.js` tolerate an unconfigured build (auth disabled instead
   of an error).
3. Add the staging host to the report-only CSP for previews.
4. Run the staging integration tests (see TESTING.md) against the preview.

## Keeping production isolated

- The production publishable key and URL stay in the Production scope only;
  previews physically cannot load them once step 1 is wired (the build
  refuses).
- Migrations reach production only after approval, by running the reviewed
  files in the production SQL editor, in order, after a backup
  (Database → Backups).
- The Edge Function is deployed to production separately
  (`--project-ref rddijjezqrcjrnwskenb`) with production origins only.
