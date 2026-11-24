# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-24.

## Now

- **Branch:** `development/v1-admin-infrastructure`, ahead of `origin/main` by
  Atlas Studio (S1.1 and S2), which is not merged or in production.
- **Production:** `fd03796` (through the copyable source paths in Handbook ›
  Library › Widgets), verified 2026-11-24 against the live files and as a guest;
  later commits on `main` so far are this file only. Homepage version 52,
  schema 1, no draft (as of H5.3, 2026-11-24).
- **Migrations, production and staging:** 0001–0006, 0008–0014. 0007 (optional)
  not confirmed.
- **Active milestone:** none. Atlas Studio S1.1 (foundation) and S2 (Connections
  editor), `design/STUDIO.md`, are done: visual review approved by the user
  2026-11-24. Other Studio sections are placeholders. Connections are stored in
  the browser only. Browser checks ran locally in Chromium with a stand-in for
  Supabase. H5.3 is released and Gate 7 closed early (record:
  `cms/PRODUCTION-ROLLOUT.md` › H5.3 release).

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

- **S3, Unified Canvas Design** (not started): bring the Connections canvas
  appearance (`styles/canvas.css`; Handbook › Foundations › Node Canvas) to the
  existing Layout Editor, keeping its underlying grid logic as it is.
- Merging Studio to `main` deploys it to production: the user decides when.
- Deferred from S2: `design/STUDIO.md` › Connections.
- Workflow candidates: split `docs/cms/ARCHITECTURE.md`; tidy Claude's memory.
- Planned and deferred work: `design/HANDBOOK.md` › Built and planned.
