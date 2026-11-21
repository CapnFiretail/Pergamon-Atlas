// A Supabase-shaped Postgres in-process (PGlite = real Postgres 17 in WASM).
//
// Emulates what the migrations rely on: the anon/authenticated/service_role
// roles (service_role bypasses RLS), Supabase's default grants on new public
// tables and functions, auth.uid()/auth.role()/auth.jwt() read from the
// request claims, auth.users, and a minimal storage schema with RLS on
// storage.objects. Then applies the real migration files unchanged.
//
// Limits (verified on the staging project instead): the Storage API's own
// size/MIME enforcement, PostgREST's HTTP mapping, and real JWT signing.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
`;

// 0001–0006 plus the CMS migrations. `extra` adds optional proposals (e.g.
// 0010); `without: ['0012']` leaves out 0012 (the schema before saved cards).
export async function createEnv({ extra = [], without = [] } = {}) {
  const db = new PGlite();
  await db.exec(BOOTSTRAP);
  for (const f of ['0001_pergamon_profiles', '0002_atlas_visibility_overrides', '0003_homepage_settings',
                   '0004_homepage_storage', '0005_homepage_display_controls', '0006_homepage_featured_trio']) {
    await db.exec(sql(`supabase/migrations/${f}.sql`));
  }
  await db.exec(sql('supabase/proposed/0008_site_content.sql'));
  await db.exec(sql('supabase/proposed/0009_site_media.sql'));
  await db.exec(sql('supabase/proposed/0011_shared_public_media.sql'));
  if (!without.includes('0012')) await db.exec(sql('supabase/proposed/0012_saved_cards.sql'));
  for (const f of extra) await db.exec(sql(`supabase/proposed/${f}.sql`));

  // Run fn as a request: role + JWT claims, in a transaction that commits on
  // success. Errors come back as { error: { code, message } } like PostgREST.
  async function as(who, fn) {
    try {
      const data = await db.transaction(async tx => {
        if (who.role !== 'postgres') {
          await tx.exec(`set local role ${who.role}`);
          const claims = who.claims || { role: who.role, ...(who.id ? { sub: who.id } : {}) };
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        }
        return fn(tx);
      });
      return { data, error: null };
    } catch (e) {
      return { data: null, error: { code: e.code, message: e.message } };
    }
  }

  // RPC helper: select public.fn($1, $2, ...) and return its single value.
  const rpc = (who, fn, ...args) => as(who, async tx => {
    const params = args.map((_, i) => `$${i + 1}`).join(', ');
    const r = await tx.query(`select public.${fn}(${params}) as v`, args);
    return r.rows[0].v;
  });

  async function createUser(email, { admin = false } = {}) {
    const id = crypto.randomUUID();
    await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email]);
    if (admin) await db.query(`update public.profiles set role = 'admin' where id = $1`, [id]);
    return { role: 'authenticated', id, email };
  }

  return {
    db, as, rpc, createUser,
    anon: { role: 'anon' },
    service: { role: 'service_role' },
    superuser: { role: 'postgres' }
  };
}

// A valid home document mirroring today's data/home-content.js.
export function homeDoc(overrides = {}) {
  const doc = {
    schema: 1,
    components: {
      'home.featured': {
        title: 'Chess Forge', cta: 'Play Now', href: '/games/chess-forge/',
        art: { source: { static: '/images/featured/chess-forge.webp' }, alt: '', focus: { x: 78, y: 5 }, focusNarrow: { x: 88, y: 12 } },
        style: { rules: true }
      },
      'home.spotlight': {
        title: 'Connect Four', cta: 'Play Now', href: '/games/connect-four/',
        art: { source: { static: '/images/featured/connect-four.webp' }, alt: '', fit: 'height', scale: 1.3, scaleNarrow: 1,
               anchor: { x: 50, offset: -60, y: 50 }, anchorNarrow: { x: 100, offset: -139, y: 50 }, base: '#030916' },
        style: { rules: true }
      },
      'home.carousel': { order: ['battleship', 'breakout', 'pong', 'blackjack', 'connect-four', 'snake'] },
      'home.carousel.battleship': { title: 'Battleship', category: 'Strategy', href: '/games/battleship/' },
      'home.carousel.breakout': { title: 'Breakout', category: 'Arcade', href: '/games/breakout/' },
      'home.carousel.pong': { title: 'Pong', category: 'Arcade', href: '/games/pong/' },
      'home.carousel.blackjack': { title: 'Blackjack', category: 'Card', href: '/games/blackjack/' },
      'home.carousel.connect-four': { title: 'Connect Four', category: 'Strategy', href: '/games/connect-four/' },
      'home.carousel.snake': { title: 'Snake', category: 'Arcade', href: '/games/snake/' }
    }
  };
  return structuredClone({ ...doc, ...overrides });
}
