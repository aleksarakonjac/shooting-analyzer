-- Minimal stand-ins for the Supabase objects the schema touches.
-- Only used by scripts/db/test.sh on plain Postgres; real Supabase provides these.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create extension if not exists pgtap;
