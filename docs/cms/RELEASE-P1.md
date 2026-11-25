# P1 phases 4 and 5 on production

**Done, 2026-11-25.** Each stage had its own approval; the database and content stages were
the user's. Project: **`rddijjezqrcjrnwskenb`**. Executed or verified by the agent: where it
says so. Everything else is user-reported.

## 0. Before

- Phase 5's staging review approved.
- Write down: the live homepage's version (52 when last read), Vercel's current production
  deployment (it was `B6qMwKMhyN3UwU4gUrmnFj8QfvZP`, `116e030`: the site of `91283c6`),
  pictures of `/` and `/games/`.
- Admin Mode on the homepage: no saved draft left, nothing unsaved; then close every Admin
  Mode, Studio and Handbook tab.
- Decide the pictures (stage 3). Every picture on production's homepage is an upload.

## 1. Database (maintenance window)

`STAGING-0016.md` steps 1–6, on production: GitHub integration off, `show server_version;`
17.x, preflight 7 true, `0016_game_library.sql` once, verification 15 true with the record
rows as before. Export both results. Part B isn't repeated: it passed on staging's same
major version. Afterwards the site is as it was, with the old code.

Undo: `recovery_0016.sql`, in the window, only until stage 3 saves anything.

**Result (executed and verified by the user, 2026-11-25):** preflight 7/7; verification 15/15;
homepage version 52, schema 1, answer fingerprint `beb045b73585ecf8b0cbd471893214bf`; 54
stored versions preserved (archived 16, published 1, superseded 37), fingerprint
`7b2d7501b4fe822db581e78135b4ba25`; no visibility overrides; nothing created for the library
or the Games page; every baseline value unchanged.

## 2. Code

`main` is fast-forwarded to the approved commit; Vercel deploys it. Check that commit's
deployment; as a guest: `/`, `/games/`, each game page, the header, no errors, ads requested;
as an administrator: no ads, Admin Mode on both pages, nothing saved.

Visitors see no difference: the homepage is version 52, the Games page the built-in one.

Undo: promote the deployment of stage 0.

**Result (the agent, as a guest, reads only, 2026-11-25):** `main` at `e3d3762`, Vercel
`9uhUEaV4SKaTbegvKT5kE1T7mBFa`; 155 of the commit's 157 site files are served exactly (the
generated configuration and an ignored README aside); homepage (version 52), Games (built
in) and the eight game pages as before the release; the ad script requested on those nine,
not on the homepage; only production's database asked. Administrators: the user's to check.

## 3. Content

In this order the library is published once and no page shows a picture that isn't chosen.

1. Games page or homepage › Game Library › Start with the built-in games. Check names,
   availability (production has no stored overrides) and destinations. Don't save yet.
2. Homepage › Use the Game Library… Choose for each card:
   - **… with these pictures:** the homepage stays exactly as it is; those games' pictures
     on the Games page become the homepage's.
   - **Use the game's details:** both pages show the built-in artwork; the homepage changes.
   - **Keep as it is:** the card stays out of the Game Library for now.
   Apply, look at the page.
3. Game Library: Save Draft, Publish…
4. Homepage: Save Draft, Publish Changes. Compare as a guest with stage 0's picture.
   **Pause here if anything differs.**
5. Games page: Publish Changes › Save it as a draft › Publish now. Compare.
6. Change one game's description, publish the library: nothing else changes.

**Result.** By the user, 2026-11-25 (UTC; a query of production's `site_content_versions`):
Games page 58 published 15:58:47, library 63 at 16:03:00, homepage 65 at 16:03:20; the final
functional review in Admin Mode succeeded. Choices made: the homepage's Featured and
Spotlight pictures were given to their games; its carousel uses the games' own pictures.
(The first report of success came before these publications; guest reads at 15:54 showed
nothing published, which was right.)

Undo, the newest first:
- Games page: can't be unpublished; restore an earlier version of it once there is one, or
  go back to the old code, which shows the built-in page.
- Homepage: Version History › Restore version 52 (schema 1). **Before any return to the old
  code**, which refuses cards that refer to games and would show the built-in homepage.
- Library: Version History › Open as draft, save, publish. Records are never deleted;
  archive or hide a game.
- 0016 stays from here on; older code ignores it.

## 4. Afterwards

**Result (the agent, as a guest, reads only, 16:06 UTC):** homepage 65 and Games page 58, both
schema 2, arrive with library 63, the same records on both. Eight references each, no details
of a game's own on any card. Markup and places as before the conversion at 1440, 1000 and
390px (text edges within 0.1px), no errors, the ad script as in stage 2. What changed: the
six carousel cards show the games' own pictures; all six had one and the same upload before.
Featured and Spotlight are unchanged (both show one upload, 255 × 198). Not seen by a guest:
hidden records, the library's order, drafts; signed-in checks are the user's.

**Built-in records against the live ones:** ids, names, categories, destinations,
availability, descriptions and square pictures are the same for all eight. Battleship has an
explicit centred framing (no visible difference). Chess Forge and Connect Four have wide
pictures only in the library. Nothing was changed: see `ARCHITECTURE.md` §13.

- Guest and administrator checks of both pages, light and dark, desktop and phone; ads as in
  stage 2.
- `STATUS.md`; the built-in records (`data/entries.js`) compared with the live library, and
  refreshed in their own change if they differ.
- The P1 retrospective.
