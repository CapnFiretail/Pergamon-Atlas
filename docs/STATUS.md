# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-24.

## Now

- **Branch:** `development/v1-admin-infrastructure`, ahead of `origin/main` by
  Atlas Studio and S3 (S1.1, S2, S3), approved by the user for release.
- **Production:** `fd03796` (through the copyable source paths in Handbook ›
  Library › Widgets), verified 2026-11-24 against the live files and as a guest;
  later commits on `main` so far are this file only. Homepage version 52,
  schema 1, no draft (as of H5.3, 2026-11-24).
- **Migrations, production and staging:** 0001–0006, 0008–0014. 0007 (optional)
  not confirmed.
- **Active milestone:** releasing S1–S3. Atlas Studio S1.1 (foundation) and S2
  (Connections editor, stored in the browser only), `design/STUDIO.md`: approved.
  S3, Unified Canvas Design: functionally approved 2026-11-24; its visual design is
  acceptable for now and provisional (Next). Other Studio sections are placeholders.
  Browser checks ran locally in Chromium with the real migrations in PGlite.

## Risks

- **No schema-2 homepage has been published or restored in production.** Before
  the first one: check there is no leftover draft, close older admin tabs and note
  the live version. If it goes wrong, restore that version before any frontend
  rollback (rollback deployment `DZcxwUDrU2Qkup2aeG63UFLCZxzH`, `41d691b`).
- No committed test keeps components independent of games and the CMS.
- Local `main` may be behind `origin/main`; compare with `origin/main`.
- Untracked and deliberately left: `supabase/proposed/production-h53/` (release
  SQL kit), 0012 diagnostics, `review/`, `PergamonAtlas.Legacy/`, `-w`.

## Next

- Deferred design refinement: revisit the visual design of the editing canvases
  (Layout Mode, Layout Lab). S3 is not finished visual polish.
- Claude Code Analytics, planned for Studio, not started: `design/STUDIO.md` ›
  Planned sections.
- Deferred from S2: `design/STUDIO.md` › Connections.
- Workflow candidates: split `docs/cms/ARCHITECTURE.md`; tidy Claude's memory.
- Planned and deferred work: `design/HANDBOOK.md` › Built and planned.
