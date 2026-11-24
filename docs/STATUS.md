# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-24.

## Now

- **Branch:** `development/v1-admin-infrastructure`, ahead of `main` by
  documentation and configuration only. Uncommitted: copyable source paths in
  Handbook › Library › Widgets (awaiting review).
- **Production:** `d6c2cee` on `origin/main` (through H5.3). Homepage version 52,
  schema 1, no draft (verified 2026-11-24).
- **Migrations, production and staging:** 0001–0006, 0008–0014. 0007 (optional)
  not confirmed.
- **Active milestone:** none. H5.3 is released and Gate 7 closed early
  (record: `cms/PRODUCTION-ROLLOUT.md` › H5.3 release).

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

- The user chooses the next feature milestone.
- Workflow candidates: split `docs/cms/ARCHITECTURE.md`; tidy Claude's memory.
- Planned and deferred work: `design/HANDBOOK.md` › Built and planned.
