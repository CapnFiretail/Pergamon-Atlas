-- PROPOSED. Applied to STAGING (rambkiswuigtjfgdxexk) on 2026-11-18 for
-- testing. NOT applied to production; see docs/cms/ARCHITECTURE.md §4 for the
-- rollout requirements.
--
-- Pergamon Atlas — CMS v1: several uploads may share one published image.
--
-- Apply after 0009_site_media.sql.
--
-- Why
--   publish-media stores public copies by content: site-media/media/<sha256>.<ext>.
--   Two uploads with identical bytes (the same picture uploaded twice, for
--   two cards or again after a revert) therefore map to the same public
--   object. The function already reuses an existing object ("exists"), but
--   0009 declared site_media.public_path UNIQUE, so recording the second
--   upload failed and a draft using it could never be published.
--
-- Change (nothing else)
--   Drop that uniqueness; add an ordinary index for lookups by public path.
--
-- Why this is safe
--   * cms_record_prepared_media (unchanged) still requires public_path to be
--     exactly 'media/' || p_sha256 || '.' || <ext of p_mime>, and is callable
--     by the service role only; publish-media computes p_sha256 from the
--     row's own draft bytes. So a row can only ever point at a public copy
--     of its own content. Rows sharing a path have identical bytes.
--   * No policy, grant or bucket changes: drafts stay private, the public
--     bucket stays service-role-write-only and unlistable.
--   * Every existing row stays valid (a uniqueness constraint is only being
--     removed). Prepared fields stay write-once (site_media_guard).
--   * Consequence for maintenance: an orphan clean-up may delete a public
--     object only when NO site_media row references its path.
--
-- Rollback (reference only): the constraint can be restored only while no
-- two rows share a public_path:
--   drop index if exists public.site_media_public_path_idx;
--   alter table public.site_media add constraint site_media_public_path_key unique (public_path);

alter table public.site_media drop constraint if exists site_media_public_path_key;

create index if not exists site_media_public_path_idx
  on public.site_media (public_path)
  where public_path is not null;

comment on column public.site_media.public_path is
  'Content-addressed public copy, media/<sha256>.<ext>. Uploads with identical bytes share one copy: delete the object only when no row references it.';
