# P1 phases 4 and 5 on production: plan

**Not approved, not started.** Each stage has its own approval; the database and content
stages are the user's. Stop after any stage that isn't as described. Project:
**`rddijjezqrcjrnwskenb`** (check the address every time).

## 0. Before

- Phase 5's staging review approved.
- Write down: the live homepage's version (52 when last read), Vercel's current production
  deployment (`3iJ8BtNUazx2xb4r2kZxghQehRaa`, `91283c6`), pictures of `/` and `/games/`.
- Admin Mode on the homepage: no saved draft left, nothing unsaved; then close every Admin
  Mode, Studio and Handbook tab.
- Decide the pictures (stage 3). Every picture on production's homepage is an upload.

## 1. Database (maintenance window)

`STAGING-0016.md` steps 1–6, on production: GitHub integration off, `show server_version;`
17.x, preflight 7 true, `0016_game_library.sql` once, verification 15 true with the record
rows as before. Export both results. Part B isn't repeated: it passed on staging's same
major version. Afterwards the site is as it was, with the old code.

Undo: `recovery_0016.sql`, in the window, only until stage 3 saves anything.

## 2. Code

`main` is fast-forwarded to the approved commit; Vercel deploys it. Check that commit's
deployment; as a guest: `/`, `/games/`, each game page, the header, no errors, ads requested;
as an administrator: no ads, Admin Mode on both pages, nothing saved.

Visitors see no difference: the homepage is version 52, the Games page the built-in one.

Undo: promote the deployment of stage 0.

## 3. Content

In this order the library is published once and no page shows a picture that isn't chosen.

1. Games page or homepage › Game Library › Start with the built-in games. Check names,
   availability (stored overrides are applied) and destinations. Don't save yet.
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

Undo, the newest first:
- Games page: can't be unpublished; restore an earlier version of it once there is one, or
  go back to the old code, which shows the built-in page.
- Homepage: Version History › Restore version 52 (schema 1). **Before any return to the old
  code**, which can't read schema 2 and would show the built-in homepage.
- Library: Version History › Open as draft, save, publish. Records are never deleted;
  archive or hide a game.
- 0016 stays from here on; older code ignores it.

## 4. Afterwards

- Guest and administrator checks of both pages, light and dark, desktop and phone; ads as in
  stage 2.
- `STATUS.md`; the built-in records (`data/entries.js`) compared with the live library, and
  refreshed in their own change if they differ.
- The P1 retrospective.
