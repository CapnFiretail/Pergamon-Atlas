-- 0015: Atlas Studio documents (Connections, Ideas), shared by administrators.
--
-- Requires 0001 (profiles.role) and 0008 (is_admin, cms_require_admin).
-- Additive only: no existing table, function, policy, grant or data changes.
--
-- Model
--   studio_document_kinds  which documents exist: one row per Studio section
--                          that saves one, with the format its JSON names and
--                          the lists that JSON holds. Only migrations change it.
--   studio_documents       the saved copy of each, at most one per kind, with a
--                          revision that goes up by one with every save. No row:
--                          nothing has been saved yet. An empty document is a
--                          row like any other. No history is kept.
--
-- The server checks who, which document, its envelope (format, version), its
-- lists and ids, and its size. What each field may hold is the document's own
-- rule (scripts/studio/<section>/document.js), checked completely by every
-- browser when it reads, imports or changes one; so adding a service, a
-- category or a field needs no migration.
--
-- Adding a kind: a migration with one insert into studio_document_kinds.
--
-- Access
--   As in 0008: browsers never touch the tables (no privileges; RLS on, no
--   policies). The two functions are SECURITY DEFINER, check the administrator
--   themselves and are not executable by anon. Errors: PT403 not an
--   administrator, PT404 unknown kind, PT409 saved by someone else since,
--   PT422 not a document of that kind.
--
-- Rollout: staging, then production, each before the Studio code that uses it.
-- Without it that code says the database isn't set up and stores nothing.
-- Read-only checks: verify_0015.sql.
--
-- Rollback (reference only; DELETES every saved Studio document):
--   drop function public.save_studio_document(text, jsonb, bigint);
--   drop function public.get_studio_document(text);
--   drop function public.studio_check_document(text, jsonb);
--   drop table public.studio_documents, public.studio_document_kinds;

begin;

do $$
begin
  if to_regprocedure('public.cms_require_admin()') is null then
    raise exception '0015 needs 0008_site_content.sql (cms_require_admin)';
  end if;
end;
$$;

-- ── Kinds ──────────────────────────────────────────────────────────────────

create table public.studio_document_kinds (
  kind    text primary key check (kind ~ '^[a-z][a-z0-9-]{0,31}$'),
  format  text not null unique check (format ~ '^pergamon-atlas\.[a-z][a-z0-9-]{0,31}$'),
  lists   text[] not null check (cardinality(lists) between 1 and 8)
);

alter table public.studio_document_kinds enable row level security;
revoke all on public.studio_document_kinds from anon, authenticated;

insert into public.studio_document_kinds (kind, format, lists) values
  ('connections', 'pergamon-atlas.connections', array['nodes', 'connections']),
  ('ideas', 'pergamon-atlas.ideas', array['ideas']);

-- ── Documents ──────────────────────────────────────────────────────────────

create table public.studio_documents (
  kind      text primary key references public.studio_document_kinds (kind),
  revision  bigint not null check (revision > 0),
  document  jsonb not null,
  saved_by  uuid references auth.users (id) on delete set null,
  saved_at  timestamptz not null default now()
);

alter table public.studio_documents enable row level security;
revoke all on public.studio_documents from anon, authenticated;

-- ── Validation ─────────────────────────────────────────────────────────────
-- Raises PT404 for an unknown kind, PT422 on the first problem.

create or replace function public.studio_check_document(p_kind text, p_document jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  k public.studio_document_kinds;
  list text;
  item jsonb;
  ids text[] := array[]::text[];
begin
  select * into k from public.studio_document_kinds where kind = p_kind;
  if k.kind is null then
    raise exception 'unknown Studio document "%"', left(coalesce(p_kind, ''), 40) using errcode = 'PT404';
  end if;
  perform public.cms_check_keys(p_document, array['format', 'version'] || k.lists, array['format', 'version'] || k.lists, 'document');
  if octet_length(p_document::text) > 2097152 then
    raise exception 'document: larger than 2 MB' using errcode = 'PT422';
  end if;
  if (p_document -> 'format') is distinct from to_jsonb(k.format) then
    raise exception 'document.format: must be %', k.format using errcode = 'PT422';
  end if;
  if jsonb_typeof(p_document -> 'version') <> 'number' or (p_document ->> 'version') !~ '^[1-9][0-9]{0,3}$' then
    raise exception 'document.version: must be a whole number from 1' using errcode = 'PT422';
  end if;
  foreach list in array k.lists loop
    if jsonb_typeof(p_document -> list) <> 'array' then
      raise exception 'document.%: must be a list', list using errcode = 'PT422';
    end if;
    for item in select value from jsonb_array_elements(p_document -> list) loop
      if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'id') is distinct from 'string'
         or (item ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
        raise exception 'document.%: an entry has no usable id', list using errcode = 'PT422';
      end if;
      ids := array_append(ids, item ->> 'id');
    end loop;
  end loop;
  if cardinality(ids) <> (select count(distinct x) from unnest(ids) x) then
    raise exception 'document: an id is used twice' using errcode = 'PT422';
  end if;
end;
$$;

-- ── Functions ──────────────────────────────────────────────────────────────

-- Admin: the saved copy. revision is null when nothing has been saved yet.
create or replace function public.get_studio_document(p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare d public.studio_documents;
begin
  perform public.cms_require_admin();
  if not exists (select 1 from public.studio_document_kinds where kind = p_kind) then
    raise exception 'unknown Studio document "%"', left(coalesce(p_kind, ''), 40) using errcode = 'PT404';
  end if;
  select * into d from public.studio_documents where kind = p_kind;
  return jsonb_build_object('kind', p_kind, 'revision', d.revision, 'document', d.document, 'saved_at', d.saved_at);
end;
$$;

-- Admin: save the whole document. p_expected_revision is the revision the
-- changes are based on (null: nothing saved yet); if another was saved since,
-- PT409 and nothing is written. Saves of one kind take turns.
create or replace function public.save_studio_document(p_kind text, p_document jsonb, p_expected_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.cms_require_admin();
  cur bigint;
  d public.studio_documents;
begin
  perform public.studio_check_document(p_kind, p_document);
  perform pg_advisory_xact_lock(hashtext('pergamon.studio_documents:' || p_kind));
  select revision into cur from public.studio_documents where kind = p_kind;
  if cur is distinct from p_expected_revision then
    raise exception 'the document was saved by someone else (current %, expected %)', cur, p_expected_revision
      using errcode = 'PT409';
  end if;
  insert into public.studio_documents as s (kind, revision, document, saved_by, saved_at)
  values (p_kind, 1, p_document, me, now())
  on conflict (kind) do update
    set revision = s.revision + 1, document = excluded.document, saved_by = excluded.saved_by, saved_at = excluded.saved_at
  returning * into d;
  return jsonb_build_object('kind', p_kind, 'revision', d.revision, 'saved_at', d.saved_at);
end;
$$;

-- ── Function permissions ───────────────────────────────────────────────────

revoke all on function public.studio_check_document(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_studio_document(text) from public, anon, authenticated;
revoke all on function public.save_studio_document(text, jsonb, bigint) from public, anon, authenticated;

grant execute on function public.get_studio_document(text) to authenticated;
grant execute on function public.save_studio_document(text, jsonb, bigint) to authenticated;

commit;

notify pgrst, 'reload schema';
