-- PROPOSED — NOT APPLIED. Review before moving into supabase/migrations/.
--
-- Pergamon Atlas — appearance preferences on profiles
--
-- Adds two columns so signed-in users' palette and display mode can follow
-- them across devices. Until this is applied (and the client sync is built
-- and tested), preferences live only in each browser's localStorage under
-- 'pa-appearance' (see PergamonAtlas.V1/scripts/theme.js).
--
-- Additive only: existing rows get the defaults, nothing is dropped or
-- rewritten, and no existing column, trigger or policy changes.

alter table public.profiles
  add column if not exists theme_palette text not null default 'obsidian'
    check (theme_palette in ('obsidian', 'sapphire', 'emerald', 'copper')),
  add column if not exists theme_mode text not null default 'dark'
    check (theme_mode in ('dark', 'light', 'system'));

-- RLS: no new policy needed. "profiles_select_own" / "profiles_update_own"
-- (0001) already limit reads and writes to the owner's own row.
--
-- Column grants: 0001 grants the authenticated role UPDATE on display_name
-- only, so the new columns must be granted explicitly or client writes fail.
-- role / atlas_address / coord_* remain ungranted, and the
-- protect_profile_fields trigger still reverts them for non-service callers.
grant update (theme_palette, theme_mode) on public.profiles to authenticated;

-- Rollback (reference only):
--   revoke update (theme_palette, theme_mode) on public.profiles from authenticated;
--   alter table public.profiles drop column if exists theme_palette, drop column if exists theme_mode;
