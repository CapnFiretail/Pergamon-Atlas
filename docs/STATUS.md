# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-24.

## Now

- **Branches:** `development/v1-admin-infrastructure` and `main` are level.
- **Production:** `81e4731` (Atlas Studio S1.1 and S2, unified canvas design S3),
  released 2026-11-24 (Vercel `BJQ5GSPfDejBr2tLb4wWSjnQ4wWh`) and verified the same
  day against the live files and as a guest, 25/25; later commits on `main` so far
  are this file only. Homepage version 52, schema 1, unchanged by the release.
  Frontend rollback: `5wGMvFPPRwMiCnsogukHm9bxD4Jz` (`60bc79c`).
- **Outstanding verification of this release:**
  - The protected preview of `81e4731` was built but not opened (no Vercel
    sign-in); released by the user's decision on local validation and that build.
  - Production as an administrator (Studio › Connections, Layout Mode, Layout Lab,
    Handbook), without saving: not done, the user's to do.
- **Migrations, production and staging:** 0001–0006, 0008–0014. 0007 (optional)
  not confirmed.
- **Active milestone:** none. S3 is functionally approved; its visual design is
  acceptable for now and provisional (Next). Other Studio sections are placeholders.

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
