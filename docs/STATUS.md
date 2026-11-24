# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-24.

## Now

- **Branches:** `development/v1-admin-infrastructure` and `main` are level.
- **Production:** `d537d14` (S5: Studio › Ideas; Connections and Ideas saved in
  Supabase), released 2026-11-24 (Vercel `8aY37MEUBFWP4wTFh2Z9S2PLikwz`) and verified
  the same day as a guest and by comparing every published site file with the
  commit; later commits on `main` so far are this file only. No homepage change
  (version 52, schema 1, as last checked for the S3 release).
  Frontend rollback: `7zNFJvbBqQxjTNaH9C3T4SpWwdgS` (`e1155fa`). **Leave 0015 in
  place**: its rollback deletes the saved documents (`design/STUDIO.md` › Saved
  documents).
- **Outstanding verification:** production as an administrator: Studio › Connections
  and Ideas, including each administrator's first save or move of a browser copy;
  and, without saving, Environments, Layout Mode, Layout Lab, Handbook: not done, the
  user's to do. S5's local and staging reviews were done by the user.
- **Migrations, production and staging:** 0001–0006, 0008–0015. 0007 (optional)
  not confirmed. 0015 was run by the user; all 8 rows of `verify_0015.sql` true in
  both (user-reported).
- **Active milestone:** none.
- **Standing:** Starting the local server at sign-in is not installed
  (`tools\dev-server install`). Other Studio sections are placeholders; S3's
  visual design is provisional (Next).

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
