# Concurrency test for 0016

**A plan. Not approved, not run.** Required before 0016 reaches production. The rules it
tests: the header of `supabase/proposed/0016_game_library.sql`.

## Locks, by write path

Each request is one transaction (READ COMMITTED) and takes locks only in this order:
**page → library → images by id**. Advisory locks and row locks last until it ends.

| Write | 1. Page's lock | 2. Library's lock | 3. Rows |
|---|---|---|---|
| `save_draft(page)` without references | exclusive | — | its own versions |
| `save_draft(page)` with references | exclusive | shared, after validation | its own versions |
| `publish`, `rollback` (page) without references | exclusive | — | its versions, then unpublished images by id |
| `publish`, `rollback` (page) with references | exclusive | shared, after validation and the image check | its versions, then unpublished images by id |
| `save_draft(library)` | exclusive (the same lock) | held | its own versions |
| `publish(library)` | exclusive (the same lock) | held | its versions, then unpublished images by id |
| `rollback(library)` | refused before any lock | | |
| `discard_draft(any)` (0008, unchanged) | exclusive | — | its own draft |
| `cms_record_prepared_media` (0011, unchanged) | — | — | one image |
| `create_media_upload` (0009, unchanged) | — | — | inserts one image |
| `recovery_0016.sql` | home, games | library, all exclusive | its check, then functions and page rows |

- Nothing takes a page's lock while holding the library's, so nobody can wait in a circle.
  Nothing takes two pages' locks but recovery, which takes the library's last.
- Published ids only grow and versions are never deleted, so a reference that was valid
  when a page was published stays valid.
- The library is read by a new statement after the lock is granted, so under READ
  COMMITTED it sees what the previous holder committed. These functions must not be given
  a stricter isolation level.
- Reading takes no lock. `get_published_content` is `stable`: one snapshot.
- **Found in review:** 0008's `cms_activate` updates image rows in no fixed order. Harmless
  with one page; two pages sharing images could have deadlocked (one is aborted, nothing
  corrupted). 0016 locks them by id first, and only those not yet published. A7 tests it.

## Part A: a private PostgreSQL (everything, including commits)

`tests/cms/concurrency-0016.mjs`: a throwaway PostgreSQL on this machine, many connections,
real commits. Committing on staging would leave permanent versions and ids there and make
recovery impossible, so the cases that must commit run here.

**Needs approval:** PostgreSQL server programs of staging's major version (step 0 below).
The installed copy here has only the client tools. Either complete that installation or
unpack the official binaries into a temporary folder; nothing is installed as a service.

| Case | Expected |
|---|---|
| A1 page publish during the library publish that adds its game | waits, then succeeds |
| A2 the same, library publish undone | page refused (PT422), nothing live |
| A3 library publish during a page publish | waits, both succeed |
| A4 page without references during a library publish | doesn't wait |
| A5, A6 two publishes, two saves of one draft | one succeeds, one PT409 |
| A7 homepage and library publish the same new images | both succeed |
| A8 24 writers, 240 reads | each write succeeds or PT409; no read lacks a record or shows a hidden one |
| Afterwards | every live reference resolves; no id lost; one live version each; server's deadlock count 0; recovery refuses |

Cleanup: it stops the server and deletes the folder itself, and prints `(cluster removed)`.

## Part B: staging, two sessions, nothing committed

On the real Supabase, after 0016 is applied there and `verify_0016.sql` is all true, and
**before anything is saved for the library or the Games page**. Run by the user in two
SQL Editor tabs of **`rambkiswuigtjfgdxexk`** (check the address), with nobody editing.

Every block is one statement that always ends in an error, so the database undoes all of
it: it can't commit, even by mistake. The result is the text after `RESULT`. A block
refuses if the library or Games page has versions. Tab 1 holds for 25 seconds; run tab 2
about 5 seconds after it.

**Needs approval:** inside these undone transactions the blocks set the request claims to
an existing administrator's id, in the project owner's own SQL Editor. No session, token or
password is used or shown. Staging's version ids will skip some numbers.

| Case | Tab 1 | Tab 2 | Expected in tab 2 |
|---|---|---|---|
| B1 | block L | block P | waited ≥ 10 s; PT422 `isn't in the Game Library` |
| B2 | block L | block H | waited < 2 s; accepted |
| B3 | block S | block W | waited ≥ 10 s; accepted |
| B4 | block S | block P | waited < 2 s; PT422 `isn't in the Game Library` |
| B5 | block L | block W | waited ≥ 10 s; accepted |

Tab 1 always ends with `RESULT held, undone`. **Stop** and report if a result differs, if
anything mentions `deadlock` or `40P01`, or if a tab runs past 60 seconds.

Step 0, for the record: `show server_version;` and keep `verify_0016.sql`'s result.

Afterwards: run `verify_0016.sql` again. Every check true, and its record rows (live
version, fingerprints, stored versions) exactly as before. There is nothing else to clean
up: closing both tabs ends any transaction still open.

### L: a library save and publish, held

```sql
do $t$
declare d jsonb;
begin
  if exists (select 1 from public.site_content_versions where page in ('games', 'library')) then raise exception 'RESULT stop: the library or Games page has versions'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'admin' order by id limit 1))::text, true);
  d := public.save_draft('library', '{"schema":1,"components":{"library.games":{"order":["snake"]},"library.games.snake":{"name":"Snake","category":"Arcade","destination":"/games/snake/","availability":"available"}}}', null);
  perform public.publish('library', (d ->> 'draft_id')::bigint, null);
  perform pg_sleep(25);
  raise exception 'RESULT held, undone';
end $t$;
```

### S: what a page write holds (the library's lock, shared)

```sql
do $t$
begin
  if exists (select 1 from public.site_content_versions where page in ('games', 'library')) then raise exception 'RESULT stop: the library or Games page has versions'; end if;
  perform public.cms_lock_page('home');
  perform pg_advisory_xact_lock_shared(hashtext('pergamon.site_content:library'));
  perform pg_sleep(25);
  raise exception 'RESULT held, undone';
end $t$;
```

### P: a Games page draft that refers to Snake

```sql
do $t$
declare t timestamptz := clock_timestamp(); r text := 'accepted';
begin
  if exists (select 1 from public.site_content_versions where page in ('games', 'library')) then raise exception 'RESULT stop: the library or Games page has versions'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'admin' order by id limit 1))::text, true);
  begin
    perform public.save_draft('games', '{"schema":2,"regions":[{"id":"main","widgets":[{"id":"grid","type":"card-grid","col":1,"row":1,"cols":20,"rows":7}]}],"components":{"games.grid":{"order":["snake"]},"games.grid.snake":{"game":"snake"}}}', null);
  exception when others then r := sqlstate || ' ' || sqlerrm;
  end;
  raise exception 'RESULT waited % s: %', round(extract(epoch from clock_timestamp() - t)::numeric, 1), r;
end $t$;
```

### H: a homepage draft without references (its live content)

```sql
do $t$
declare t timestamptz := clock_timestamp(); r text := 'accepted';
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'admin' order by id limit 1))::text, true);
  begin
    perform public.save_draft('home', (select content from public.site_content_versions where page = 'home' and status = 'published'), (select id from public.site_content_versions where page = 'home' and status = 'draft'));
  exception when others then r := sqlstate || ' ' || sqlerrm;
  end;
  raise exception 'RESULT waited % s: %', round(extract(epoch from clock_timestamp() - t)::numeric, 1), r;
end $t$;
```

### W: a library save

```sql
do $t$
declare t timestamptz := clock_timestamp(); r text := 'accepted';
begin
  if exists (select 1 from public.site_content_versions where page in ('games', 'library')) then raise exception 'RESULT stop: the library or Games page has versions'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'admin' order by id limit 1))::text, true);
  begin
    perform public.save_draft('library', '{"schema":1,"components":{"library.games":{"order":[]}}}', null);
  exception when others then r := sqlstate || ' ' || sqlerrm;
  end;
  raise exception 'RESULT waited % s: %', round(extract(epoch from clock_timestamp() - t)::numeric, 1), r;
end $t$;
```
