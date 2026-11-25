# 0016 on staging: instructions

**Done on staging, 2026-11-24.** Reported by the user: PostgreSQL 17.12; GitHub integration
checked; preflight 7/7; migration applied; verification 15/15; part B as expected
(`CONCURRENCY-0016.md`) and verification 15/15 again, with all 497 stored versions and the
fingerprints preserved; the site review, with a homepage draft saved and discarded; window
closed. Production: the same steps, each with its own approval, not started.

Each step is the user's, in the Supabase dashboard. Use the
files of the approved commit, copied whole from GitHub (Raw). What is tested and why:
`CONCURRENCY-0016.md`.

**Stop and report, changing nothing more,** at the first result that isn't as described.
Don't correct anything by hand, and don't run `recovery_0016.sql` unless we agree to.

In the SQL Editor, every time: the address has **`rambkiswuigtjfgdxexk`**, the role is
`postgres`, and no text is selected (only a selection would run).

## 1. The GitHub integration

Project Settings › Integrations › GitHub, **in both projects** (look only):

| Setting | Expected |
|---|---|
| Connected to this repository | No. If it is, the next two matter |
| Deploy to production (push to the production branch) | Off |
| Automatic branching | Off |
| Working directory | Note it |

On would mean that a push can apply `supabase/migrations/` and deploy Edge Functions
([Supabase's documentation](https://supabase.com/docs/guides/deployment/branching/github-integration)).
0016 is in `supabase/proposed/`, which it doesn't read; if either is on, stop anyway and
decide about the setting first.

## 2. Version

```sql
show server_version;
```

Expected: **17.x**. Anything else: stop; part A is run again on that version first.

## 3. Maintenance window

From here to the end of step 6: no Admin Mode, Studio or Handbook tab open on staging or
the local server (both use this database), no saves, no publishes, nobody else editing.
Note the time.

## 4. Preflight

Run `preflight_0016.sql`. Expected: **7 rows with `ok` true, none false, no error**; the
other rows have no `ok`. **Export the result** (CSV): step 6 compares with it. The last row
but one lists games with a visibility override; keep it for the first library draft.

## 5. Migration

Run `0016_game_library.sql` once. Expected: success, no rows. It is one transaction: an
error means nothing was applied; stop.

## 6. Verification

Run `verify_0016.sql`. Expected: **15 rows true, none false, no error**. These rows must
read exactly as in step 4: live homepage version, homepage answer fingerprint, stored
versions, fingerprint of every stored version, fingerprint of all visibility overrides.
**Export it.** The maintenance window can stay open for step 7.

If a row is false or differs: stop. Nothing has been saved yet, so recovery is still
possible, once agreed.

## 7. Part B

`CONCURRENCY-0016.md` › Part B, with its own approval, still in the window and **before
anything is saved for the library or the Games page** (that can't be undone, and ends
recovery for good). Two SQL Editor tabs; order **B2, B4, B1, B3, B5**. Copy both tabs'
`RESULT` line for each case.

Then run `verify_0016.sql` once more: everything exactly as in step 6.

## 8. The site

As a guest, on the staging site: the homepage and Games look as before, Games lists eight.

As administrator (a real request through the API): Admin Mode on the homepage, change one
word, Save, reload (the draft is there), discard the draft. It leaves one superseded
version in staging's history, as any save does. Don't publish; don't save anything else.

## Report

The results of steps 1–2, the exports of 4 and 6, part B's `RESULT` lines, the repeated
verification, and step 8. Production has its own approval afterwards.

## Recovery

`recovery_0016.sql`, only if agreed, only before anything is saved for the library or the
Games page (it refuses otherwise), and **always in a maintenance window**. Its 10-second
wait makes it likely that requests already running have finished; it doesn't guarantee it.
The window does. Afterwards `preflight_0016.sql` is true again in every row.
