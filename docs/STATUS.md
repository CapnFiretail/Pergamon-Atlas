# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-25.

## Now

- **Branches:** `main` and `development/v1-admin-infrastructure` are level.
- **Production:** `e3d3762` (P1 phases 4 and 5), released 2026-11-25 (Vercel
  `9uhUEaV4SKaTbegvKT5kE1T7mBFa`); later commits on `main` so far are documents only.
  **Content, published by the user 2026-11-25:** Games page version 58, Game Library 63
  (schema 1), homepage 65, the two pages schema 2; all eight homepage cards and all eight
  Games page cards refer to the library. Read by the agent as a guest afterwards:
  `cms/RELEASE-P1.md`.
  **Rollback:** the homepage's version 52 (schema 1) first, in Version History; then the
  code before `e3d3762`, `B6qMwKMhyN3UwU4gUrmnFj8QfvZP` (`116e030`), which refuses cards
  that refer to games. **Leave 0015 and 0016 in place**: 0015's rollback deletes the saved
  documents (`design/STUDIO.md` › Saved documents); 0016's recovery has ended.
- **Staging:** homepage 497 (schema 1, own details); no published Games page.
- **Outstanding verification:** production as an administrator, the user's to do: the
  header's controls, Studio › Connections and Ideas (including the first save or move of
  a browser copy); and, without saving, Environments, Layout Mode, Layout Lab, Handbook.
  P1's local, staging and production functional reviews were done by the user (reported).
  Not reported separately: ads for a member (requested) and an administrator (none).
- **Migrations, production and staging:** 0001–0006, 0008–0016. 0007 (optional) not
  confirmed. Run by the user: 0015 (all 8 rows of `verify_0015.sql` true in both) and 0016
  (`cms/STAGING-0016.md`, `cms/RELEASE-P1.md`).
- **Active milestone:** none. P1, Games catalog on the shared page architecture, is
  complete: phases 1–5 released, content converted (`cms/ARCHITECTURE.md` §13,
  `cms/RELEASE-P1.md`). Next: discussing its retrospective.
- **Standing:** Starting the local server at sign-in is not installed
  (`tools\dev-server install`). Other Studio sections are placeholders; S3's
  visual design is provisional (Next).

## Risks

- **Fallback pictures.** The wide pictures of Chess Forge and Connect Four are uploads, which
  the built-in records (`data/entries.js`) can't hold; nothing drawn from them needs these
  yet (`cms/ARCHITECTURE.md` §13).
- **Ads.** Real AdSense behaviour with `scripts/ads.js` is unverified beyond the request
  for the ad script (guests): check what is shown, and as an administrator that nothing is.
  The tag is no longer in the HTML (AdSense's site check: `ads.txt`).
- Local `main` may be behind `origin/main`; compare with `origin/main`.
- Untracked and deliberately left: `supabase/proposed/production-h53/` (release
  SQL kit), 0012 diagnostics, `review/`, `PergamonAtlas.Legacy/`, `-w`.

## Next

- The game catalog's visual refinement is deferred: Studio › Ideas.
- Open from P1, undecided: built-in copies of uploaded pictures, and a built-in homepage
  that refers to game records (`cms/ARCHITECTURE.md` §13).
- Deferred design refinement: revisit the visual design of the editing canvases
  (Layout Mode, Layout Lab). S3 is not finished visual polish.
- Claude Code Analytics, planned for Studio, not started: `design/STUDIO.md` ›
  Planned sections.
- Deferred from S2: `design/STUDIO.md` › Connections.
- Workflow candidates: split `docs/cms/ARCHITECTURE.md`; tidy Claude's memory.
- Planned and deferred work: `design/HANDBOOK.md` › Built and planned.
