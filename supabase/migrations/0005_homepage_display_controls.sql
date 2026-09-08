-- Pergamon Atlas — Homepage customization v1.1: hero crop + editorial
-- featured description
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- AFTER 0004_homepage_storage.sql. Additive only — 0002/0003/0004 are
-- already applied and MUST NOT be edited.
--
-- Adds four columns to the existing single-row homepage_settings table:
--
--   hero_image_zoom / hero_image_x / hero_image_y
--     Presentation-only crop state for the hero image. Applied purely with
--     CSS on the homepage (object-position + transform: scale) — no new
--     image file is ever produced. x/y are object-position percentages
--     (50/50 = centred); zoom is a scale multiplier. Uploading a
--     replacement hero image resets these to the defaults.
--
--   featured_description
--     Homepage-specific editorial copy for the Featured Today card. NULL
--     means "use the artifact's canonical description" (entries.js /
--     atlas-meta). This never writes back to canonical artifact metadata.
--     Switching the featured artifact resets this to NULL.
--
-- RLS / GRANTS — nothing to add here, verified against 0003:
--   * homepage_settings_admin_update is `using/with check (<admin>)` with
--     NO column list, so it already governs every column, new ones
--     included.
--   * `grant update on public.homepage_settings to authenticated` is
--     table-wide (no column list) — new columns are covered; anon has no
--     write grant at all.
--   * homepage_settings_select_public_or_admin gates the whole row on
--     `published = true OR caller is admin`, so the new columns follow the
--     same publish/admin visibility as the rest of the row.
-- Creating extra policies would be redundant and is intentionally avoided.

alter table public.homepage_settings
  add column if not exists hero_image_zoom numeric not null default 1
      check (hero_image_zoom between 1 and 3),
  add column if not exists hero_image_x    numeric not null default 50
      check (hero_image_x between 0 and 100),
  add column if not exists hero_image_y    numeric not null default 50
      check (hero_image_y between 0 and 100),
  add column if not exists featured_description text;
