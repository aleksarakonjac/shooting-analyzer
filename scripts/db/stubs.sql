-- Minimal stand-ins for the Supabase objects the schema touches.
-- Only used by scripts/db/test.sh on plain Postgres; real Supabase provides these.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create extension if not exists pgtap;

-- Roles and storage objects that Supabase provides.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
$$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
grant usage on schema auth, storage, public to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
