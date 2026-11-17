-- PROPOSED — NOT APPLIED. Review before moving into supabase/migrations/.
--
-- Pergamon Atlas — CMS v1: media storage
--
-- Apply together with 0008_site_content.sql (uses public.is_admin()).
-- Additive only: the legacy 'homepage' bucket and its policies (0004) are
-- not touched.
--
-- Flow
--   1. An admin calls create_media_upload(mime, bytes). It records a
--      'site_media' row and returns the one path the admin may upload to:
--      site-media-drafts/uploads/<media id>.<ext>.
--   2. The admin's browser uploads the original there. Storage enforces the
--      bucket's size and type limits; the policies below only allow that
--      exact, not-yet-uploaded path, and nothing can overwrite or delete it,
--      so the original is preserved.
--   3. Before content is published, the publish-media Edge Function (service
--      role, server-side only) reads the draft object, checks its real bytes
--      (format, dimensions, size), copies it to the public bucket as
--      site-media/media/<sha256>.<ext>, and records that with
--      cms_record_prepared_media(). Content publish (0008) refuses any
--      document whose images have not been through this step.
--   Crop, scale and focal point live in the content document, never in the
--   file, so originals are never altered.
--
-- Buckets
--   site-media-drafts  private. Admin-only read; insert only to a path
--                      issued by create_media_upload. No update/delete.
--   site-media         public read by URL (objects are served without an
--                      RLS check, as with any public bucket). NO policies for
--                      anon/authenticated, so nobody but the service role can
--                      write, and listing the bucket is denied.

-- ── Metadata ───────────────────────────────────────────────────────────────

create table public.site_media (
  id             uuid primary key default gen_random_uuid(),
  draft_path     text not null unique
                 check (draft_path ~ '^uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'),
  declared_mime  text not null check (declared_mime in ('image/png', 'image/jpeg', 'image/webp')),
  declared_bytes integer not null check (declared_bytes between 1 and 5242880),
  -- Filled by the Edge Function from the actual file, once.
  public_path    text unique check (public_path ~ '^media/[0-9a-f]{64}\.(png|jpg|webp)$'),
  mime           text check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  bytes          integer check (bytes between 1 and 5242880),
  width          integer check (width between 1 and 10000),
  height         integer check (height between 1 and 10000),
  sha256         text check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by    uuid not null references auth.users (id),
  uploaded_at    timestamptz not null default now(),
  prepared_at    timestamptz,
  -- First time a published content version used this image (set by 0008's publish).
  published_at   timestamptz,
  check ((public_path is null) = (prepared_at is null)),
  check ((public_path is null) or (mime is not null and bytes is not null and width is not null
                                   and height is not null and sha256 is not null))
);

alter table public.site_media enable row level security;
revoke all on public.site_media from anon, authenticated;

-- Immutable identity; prepared fields are written once; rows are never
-- deleted except by the service role (for the orphan clean-up, see docs).
create or replace function public.site_media_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if auth.role() is distinct from 'service_role' then
      raise exception 'site_media rows can only be removed by maintenance' using errcode = 'PT403';
    end if;
    return old;
  end if;
  if new.id <> old.id or new.draft_path <> old.draft_path or new.declared_mime <> old.declared_mime
     or new.declared_bytes <> old.declared_bytes or new.uploaded_by <> old.uploaded_by
     or new.uploaded_at <> old.uploaded_at then
    raise exception 'site_media identity is immutable' using errcode = 'PT403';
  end if;
  if old.public_path is not null and (
       new.public_path is distinct from old.public_path or new.mime is distinct from old.mime
       or new.bytes is distinct from old.bytes or new.width is distinct from old.width
       or new.height is distinct from old.height or new.sha256 is distinct from old.sha256
       or new.prepared_at is distinct from old.prepared_at) then
    raise exception 'prepared media is immutable' using errcode = 'PT403';
  end if;
  if old.published_at is not null and new.published_at is distinct from old.published_at then
    raise exception 'site_media.published_at is set once' using errcode = 'PT403';
  end if;
  return new;
end;
$$;

create trigger site_media_guard_change
  before update or delete on public.site_media
  for each row execute function public.site_media_guard();

-- ── Buckets ────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('site-media-drafts', 'site-media-drafts', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('site-media',        'site-media',        true,  5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage policies (site-media-drafts only) ──────────────────────────────
-- An admin may upload only to a path create_media_upload issued to them that
-- has not been uploaded yet. Reading drafts (for signed preview URLs) is
-- admin-only. No UPDATE or DELETE policy: originals can't be replaced or
-- removed from the browser. site-media gets no policies at all.

create or replace function public.cms_draft_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
     and exists (
       select 1 from public.site_media m
       where m.draft_path = p_name and m.uploaded_by = auth.uid() and m.prepared_at is null
     )
     and not exists (
       select 1 from storage.objects o where o.bucket_id = 'site-media-drafts' and o.name = p_name
     );
$$;

revoke all on function public.cms_draft_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.cms_draft_upload_allowed(text) to authenticated;

drop policy if exists "site_media_drafts_admin_read" on storage.objects;
drop policy if exists "site_media_drafts_admin_insert" on storage.objects;

create policy "site_media_drafts_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'site-media-drafts' and public.is_admin());

create policy "site_media_drafts_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-media-drafts' and public.cms_draft_upload_allowed(name));

-- ── Functions ──────────────────────────────────────────────────────────────

-- Admin: reserve an upload. Returns the bucket and the only path that may be
-- written. The browser's declared type and size are checked here and again
-- by Storage; the real bytes are checked by the Edge Function.
create or replace function public.create_media_upload(p_mime text, p_bytes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.cms_require_admin();
  new_id uuid := gen_random_uuid();
  ext text;
  path text;
begin
  ext := case p_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
  if ext is null then
    raise exception 'only PNG, JPEG and WebP images are accepted' using errcode = 'PT422';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > 5242880 then
    raise exception 'images must be at most 5 MB' using errcode = 'PT422';
  end if;
  -- A simple brake on runaway uploads: 200 reservations per admin per day.
  if (select count(*) from public.site_media where uploaded_by = me and uploaded_at > now() - interval '1 day') >= 200 then
    raise exception 'upload limit reached for today' using errcode = 'PT429';
  end if;
  path := 'uploads/' || new_id::text || '.' || ext;
  insert into public.site_media (id, draft_path, declared_mime, declared_bytes, uploaded_by)
  values (new_id, path, p_mime, p_bytes, me);
  return jsonb_build_object('media_id', new_id, 'bucket', 'site-media-drafts', 'path', path);
end;
$$;

-- Admin: media details for the editor (draft path for signed previews,
-- public path once prepared).
create or replace function public.get_media(p_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_admin();
  if coalesce(array_length(p_ids, 1), 0) > 100 then
    raise exception 'ask for at most 100 images at a time' using errcode = 'PT422';
  end if;
  return coalesce((
    select jsonb_object_agg(m.id, jsonb_build_object(
      'draft_path', m.draft_path, 'public_path', m.public_path, 'mime', m.mime,
      'bytes', coalesce(m.bytes, m.declared_bytes), 'width', m.width, 'height', m.height,
      'uploaded_at', m.uploaded_at, 'prepared_at', m.prepared_at, 'published_at', m.published_at))
    from public.site_media m where m.id = any (p_ids)
  ), '{}'::jsonb);
end;
$$;

-- Service role only (the publish-media Edge Function): record a verified
-- public copy. Idempotent for the same values; refuses to change them.
create or replace function public.cms_record_prepared_media(
  p_id uuid, p_public_path text, p_mime text, p_bytes integer, p_width integer, p_height integer, p_sha256 text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.site_media;
  expected_path text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role only' using errcode = 'PT403';
  end if;
  select * into m from public.site_media where id = p_id for update;
  if m.id is null then
    raise exception 'unknown media %', p_id using errcode = 'PT404';
  end if;
  expected_path := 'media/' || p_sha256 || '.' ||
    case p_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
  if expected_path is null or p_public_path is distinct from expected_path then
    raise exception 'public path does not match the file hash and type' using errcode = 'PT422';
  end if;
  if m.public_path is not null then
    if m.public_path = p_public_path and m.sha256 = p_sha256 then
      return jsonb_build_object('media_id', m.id, 'public_path', m.public_path, 'already_prepared', true);
    end if;
    raise exception 'media % was already prepared with a different file', p_id using errcode = 'PT409';
  end if;
  update public.site_media
     set public_path = p_public_path, mime = p_mime, bytes = p_bytes, width = p_width,
         height = p_height, sha256 = p_sha256, prepared_at = now()
   where id = p_id;
  return jsonb_build_object('media_id', p_id, 'public_path', p_public_path, 'already_prepared', false);
end;
$$;

revoke all on function public.create_media_upload(text, integer) from public, anon, authenticated;
revoke all on function public.get_media(uuid[]) from public, anon, authenticated;
revoke all on function public.cms_record_prepared_media(uuid, text, text, integer, integer, integer, text) from public, anon, authenticated;

grant execute on function public.create_media_upload(text, integer) to authenticated;
grant execute on function public.get_media(uuid[]) to authenticated;
grant execute on function public.cms_record_prepared_media(uuid, text, text, integer, integer, integer, text) to service_role;

-- Rollback of this migration (reference only; empty the buckets first):
--   drop policy if exists "site_media_drafts_admin_read" on storage.objects;
--   drop policy if exists "site_media_drafts_admin_insert" on storage.objects;
--   drop function if exists public.cms_record_prepared_media(uuid, text, text, integer, integer, integer, text),
--     public.get_media(uuid[]), public.create_media_upload(text, integer),
--     public.cms_draft_upload_allowed(text), public.site_media_guard();
--   drop table if exists public.site_media;
--   delete from storage.buckets where id in ('site-media-drafts', 'site-media');
