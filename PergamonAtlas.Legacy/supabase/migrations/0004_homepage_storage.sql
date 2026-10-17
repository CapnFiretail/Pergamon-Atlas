-- Pergamon Atlas — Homepage customization v1: 'homepage' Storage bucket
--
-- Run this once in the Supabase SQL editor after 0003_homepage_settings.sql.
-- (The bucket can equivalently be created in the Storage dashboard with the
-- same settings; the policies below must still be applied.)
--
-- Holds admin-uploaded homepage imagery — currently just the hero banner
-- (objects under hero/). Public read (the published homepage loads the
-- image by public URL); writes are authenticated-admin only, enforced by
-- RLS on storage.objects against profiles.role — identical trust model to
-- atlas_visibility_overrides (0002) and homepage_settings (0003).
--
-- homepage_settings.hero_image_path stores the OBJECT PATH within this
-- bucket (e.g. 'hero/1725660000000.webp'), never a full URL and never
-- image bytes.

-- ── Bucket ────────────────────────────────────────────────────────────────
-- public = true            → objects are served by public URL / CDN.
-- file_size_limit          → 3 MiB.
-- allowed_mime_types       → PNG / JPEG / WebP only; Storage rejects the
--                            upload before it ever reaches an RLS check
--                            otherwise.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage', 'homepage', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Policies on storage.objects (scoped to this bucket) ────────────────────
-- storage.objects already has RLS enabled by default in Supabase.

drop policy if exists "homepage_bucket_public_read"   on storage.objects;
drop policy if exists "homepage_bucket_admin_insert"  on storage.objects;
drop policy if exists "homepage_bucket_admin_update"  on storage.objects;
drop policy if exists "homepage_bucket_admin_delete"  on storage.objects;

create policy "homepage_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'homepage');

create policy "homepage_bucket_admin_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'homepage'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "homepage_bucket_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'homepage'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    bucket_id = 'homepage'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "homepage_bucket_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'homepage'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
