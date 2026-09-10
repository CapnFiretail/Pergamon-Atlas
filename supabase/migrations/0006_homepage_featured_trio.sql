-- Pergamon Atlas — Featured Today trio (experiment): two Featured Tools
-- + one Featured Game in one enclosure.
--
-- Run once in the Supabase SQL editor after 0005_homepage_display_controls.
-- Additive only — 0002–0005 are already applied and MUST NOT be edited.
--
-- Evolves the single Featured slot (featured_path / featured_description,
-- from 0003/0005) into three independent editorial slots. The single-slot
-- columns are DELIBERATELY kept: the pre-trio homepage render path still
-- reads them, and the current selection is migrated into the Game slot
-- below so nothing that is featured today is lost.
--
--   featured_tool_1_path / _description
--   featured_tool_2_path / _description
--   featured_game_path    / _description
--
-- *_path        = normalized Atlas artifact path. Source of truth for the
--                 artwork / name / canonical description stays the
--                 Tools & Games catalogs + entries.js — NOT this table.
-- *_description = homepage-only editorial copy. NULL falls back to the
--                 artifact's own catalog/canonical description. Never
--                 writes back to canonical metadata. Reset to NULL when
--                 its slot's artifact changes.
--
-- RLS / GRANTS — nothing to add (identical reasoning to 0005):
--   * homepage_settings_admin_insert/update are `with check (<admin>)` /
--     `using (<admin>)` with NO column list — they already govern every
--     column, new ones included.
--   * `grant update on public.homepage_settings to authenticated` is
--     table-wide; anon has no write grant at all.
--   * homepage_settings_select_public_or_admin gates the WHOLE row on
--     published = true OR admin, so the new columns follow the same
--     publish/admin visibility as the rest of the row.

alter table public.homepage_settings
  add column if not exists featured_tool_1_path        text,
  add column if not exists featured_tool_1_description  text,
  add column if not exists featured_tool_2_path        text,
  add column if not exists featured_tool_2_description  text,
  add column if not exists featured_game_path          text,
  add column if not exists featured_game_description   text;

-- Preserve the current single selection: carry it into the Game slot.
-- Only fills blanks, so re-running is a no-op.
update public.homepage_settings
set featured_game_path       = coalesce(featured_game_path, featured_path),
    featured_game_description = coalesce(featured_game_description, featured_description)
where id = true
  and featured_game_path is null;

-- Sensible starting Tools so the trio isn't half-empty on first load.
-- An admin's choice always wins (coalesce keeps any existing value).
update public.homepage_settings
set featured_tool_1_path = coalesce(featured_tool_1_path, '/tools/gpa-calculator'),
    featured_tool_2_path = coalesce(featured_tool_2_path, '/tools/scientific-calculator')
where id = true;
