# Status

The only record of current state: what is live, active, at risk and next.
Replace outdated lines at the end of each milestone. Last updated 2026-11-24.

## Now

- **Branches:** `development/v1-admin-infrastructure` is ahead of `main`: P1 phase 4 (0016's
  SQL, tests and documents, and the interface; `93b7a38`) and phase 5.
- **Production:** `91283c6` (P1 phases 1–3: shared pages, Page Heading and Card Grid,
  the Games page, the fixed-height sidebar; administrator controls in the shared header
  on every page), released 2026-11-24 (Vercel `3iJ8BtNUazx2xb4r2kZxghQehRaa`) and
  verified the same day as a guest (homepage, Games, every game page, the header,
  Handbook and Studio refused, production database only, nothing written) and by
  comparing every published site file with the commit; later commits on `main` so far
  are this file only. No database change; the published homepage is unchanged
  (version 52, schema 1).
  Frontend rollback: `8aY37MEUBFWP4wTFh2Z9S2PLikwz` (`d537d14`). **Leave 0015 in
  place**: its rollback deletes the saved documents (`design/STUDIO.md` › Saved
  documents).
- **Outstanding verification:** production as an administrator, the user's to do: the
  header's controls, Studio › Connections and Ideas (including the first save or move of
  a browser copy); and, without saving, Environments, Layout Mode, Layout Lab, Handbook.
  P1's local and staging reviews were done by the user.
- **Migrations, production and staging:** 0001–0006, 0008–0015; **staging also 0016**
  (2026-11-24, user-reported: `cms/STAGING-0016.md`). 0007 (optional) not confirmed.
  0015 was run by the user; all 8 rows of `verify_0015.sql` true in both (user-reported).
- **Active milestone:** P1, Games catalog on the shared page architecture: phases 1–3
  released (above). Phase 4 (migration 0016, the Game Library, editing the Games page,
  ads): built as `cms/ARCHITECTURE.md` §13 says; local and
  staging reviews approved by the user (2026-11-25, user-reported). The user
  published on staging, confirmed it worked, and rolled it back afterwards (how isn't recorded):
  staging's Games page isn't published now. Check 0016 is still there (`verify_0016.sql`)
  before the next staging review. Executed by the agent: the suites, the deployment's
  commit, and guest reads of staging. Phase 5 (the homepage's conversion): built; local
  review approved 2026-11-25. 0016 and its
  concurrency test (`cms/CONCURRENCY-0016.md`): reviewed, passed, on staging only. Next, each with
  approval: phase 5's staging review, then one production release of both
  (plan: `cms/RELEASE-P1.md`), then the P1 retrospective.
- **Standing:** Starting the local server at sign-in is not installed
  (`tools\dev-server install`). Other Studio sections are placeholders; S3's
  visual design is provisional (Next).

## Risks

- **No schema-2 homepage has been published or restored in production.** Before
  the first one: check there is no leftover draft, close older admin tabs and note
  the live version. If it goes wrong, restore that version before any frontend
  rollback (rollback deployment `DZcxwUDrU2Qkup2aeG63UFLCZxzH`, `41d691b`).
- **The homepage's conversion on production.** All eight pictures of production's homepage
  (version 52) are uploads, so a first library made from the built-in games differs from
  every one: choose per card (or "… with these pictures", which also changes the Games
  page), and publish the library before the page. It makes the first schema-2 homepage (below).
- **Release order.** Phase 4's code must not reach production before 0016 is applied there:
  saving the Games page or the Game Library would be refused.
- **Ads.** Real AdSense behaviour with `scripts/ads.js` is unverified (the local server and
  the tests block the ad script): check after the release, as a guest and as an
  administrator. The tag is no longer in the HTML (AdSense's site check: `ads.txt`).
- Local `main` may be behind `origin/main`; compare with `origin/main`.
- Untracked and deliberately left: `supabase/proposed/production-h53/` (release
  SQL kit), 0012 diagnostics, `review/`, `PergamonAtlas.Legacy/`, `-w`.

## Next

- The game catalog's visual refinement is deferred: Studio › Ideas.
- Deferred design refinement: revisit the visual design of the editing canvases
  (Layout Mode, Layout Lab). S3 is not finished visual polish.
- Claude Code Analytics, planned for Studio, not started: `design/STUDIO.md` ›
  Planned sections.
- Deferred from S2: `design/STUDIO.md` › Connections.
- Workflow candidates: split `docs/cms/ARCHITECTURE.md`; tidy Claude's memory.
- Planned and deferred work: `design/HANDBOOK.md` › Built and planned.
