-- SIUS Shooting Sports Cloud import (owner, 2026-11-15). A shooter connects their SIUS account once on the
-- account page; the server signs in to SIUS for them and reads private trainings, and anyone can read public
-- competition results. Spec: docs/superpowers/specs/2026-11-15-sius-cloud-import-design.md.
--
-- Owner decisions:
-- - The SIUS password is stored (AES-256-GCM, key outside the database, `SIUS_CRED_KEY`) and used only to sign in
--   again when the refresh token stops working. After SIUS rejects it once it is cleared and never retried.
-- - A linked coach may list and import the shooter's private SIUS trainings through the shooter's connection,
--   without a separate share (exception to 0002_rls.sql "coach sees only what you shared").
-- - Sighters live in their own table instead of a flag on series/shots, so no existing total, stat or alignment
--   query can pick them up by accident.
-- - Whole 3x20 values keep the decimal next to them (`shots.value_decimal`) for a secondary display.
--
-- Rows of sius_links and sius_login_attempts are read and written only by server code with the service role.

create table sius_links (
  user_id uuid primary key references profiles (id) on delete cascade,
  email text not null,
  password_enc text,
  refresh_token_enc text,
  access_token_enc text,
  access_expires_at timestamptz,
  sius_user_id uuid,
  connected_at timestamptz not null default now(),
  last_ok_at timestamptz,
  broken_at timestamptz,
  broken_reason text check (broken_reason in ('bad_password', 'blocked', 'unknown')),
  updated_at timestamptz not null default now()
);

alter table sius_links enable row level security;
revoke all on sius_links from anon, authenticated;
-- This project does not grant service_role table privileges by default (see 0026).
grant select, insert, update, delete on sius_links to service_role;

-- Password logins to SIUS, for the per-user and global hourly limits (pruned on write).
create table sius_login_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index sius_login_attempts_at on sius_login_attempts (at);

alter table sius_login_attempts enable row level security;
revoke all on sius_login_attempts from anon, authenticated;
grant select, insert, update, delete on sius_login_attempts to service_role;

-- Connection state for the account page and the training form, never a secret: the shooter for themselves (with
-- the SIUS email), a coach for a linked shooter (state only), 'none' for everyone else.
create function sius_link_status(sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when not (is_active() and (sid = auth.uid() or coach_of(sid))) then
      jsonb_build_object('state', 'none', 'reason', null, 'email', null)
    when l.user_id is null then
      jsonb_build_object('state', 'none', 'reason', null, 'email', null)
    else
      jsonb_build_object(
        'state', case when l.broken_at is not null then 'broken' else 'ok' end,
        'reason', l.broken_reason,
        'email', case when sid = auth.uid() then l.email end)
  end
  from (select 1) one
  left join sius_links l on l.user_id = sid
$$;
revoke all on function sius_link_status(uuid) from public, anon;
grant execute on function sius_link_status(uuid) to authenticated;

-- The shooter's Result Service athlete identifier (e.g. SHCHNM0412200401), remembered after the first pick.
alter table profiles add column sius_athlete_id text;
grant update (sius_athlete_id) on profiles to authenticated;

-- SIUS Cloud JSON kept as a source file. Nothing in this file uses the new value (it cannot be used in the
-- transaction that adds it).
alter type source_kind add value if not exists 'sius_cloud';

alter table source_files
  add column external_id text,
  add column first_shot_at timestamptz,
  add column shot_count int;
create index source_files_external_id on source_files (external_id) where external_id is not null;

alter table shots add column value_decimal numeric(4, 1);

create table sighter_shots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  before_series int not null,
  position text check (position in ('kneeling', 'prone', 'standing')),
  idx int not null,
  value numeric not null,
  value_decimal numeric(4, 1),
  "inner" boolean not null default false,
  x numeric,
  y numeric,
  t_ms bigint,
  unique (match_id, idx)
);

alter table sighter_shots enable row level security;
create policy sighter_shots_all on sighter_shots for all to authenticated
  using (can_see_match(match_id)) with check (can_see_match(match_id));

-- insert_training_parts as in 0018, plus shots.value_decimal and match.sighters
-- ([{before_series, position, shots: [{idx, value, value_decimal, inner, x, y, t_ms}]}], idx across the match).
create or replace function insert_training_parts(tid uuid, payload jsonb) returns void
language plpgsql set search_path = public as $$
declare
  m jsonb := payload -> 'match';
  mid uuid;
  sid uuid;
  s jsonb;
  g jsonb;
begin
  if m is not null and jsonb_typeof(m) = 'object' then
    insert into matches (training_id, label, selection, align_state)
    values (tid, coalesce(m ->> 'label', ''), m -> 'selection', (m ->> 'align_state')::align_state)
    returning id into mid;

    for s in select * from jsonb_array_elements(coalesce(m -> 'series', '[]'::jsonb)) loop
      insert into series (match_id, idx, position, total, total_decimal, mpi_x, mpi_y, group_mm)
      values (mid, (s ->> 'idx')::int, s ->> 'position', (s ->> 'total')::int, (s ->> 'total_decimal')::numeric,
              (s ->> 'mpi_x')::numeric, (s ->> 'mpi_y')::numeric, (s ->> 'group_mm')::numeric)
      returning id into sid;

      insert into shots (series_id, idx, value, value_decimal, "inner", direction, x, y, t_ms, scatt_shot_id)
      select sid, (sh ->> 'idx')::int, (sh ->> 'value')::numeric, (sh ->> 'value_decimal')::numeric,
             coalesce((sh ->> 'inner')::boolean, false),
             sh ->> 'direction', (sh ->> 'x')::numeric, (sh ->> 'y')::numeric,
             (sh ->> 't_ms')::bigint, (sh ->> 'scatt_shot_id')::int
      from jsonb_array_elements(coalesce(s -> 'shots', '[]'::jsonb)) sh;
    end loop;

    for g in select * from jsonb_array_elements(coalesce(m -> 'sighters', '[]'::jsonb)) loop
      insert into sighter_shots (match_id, before_series, position, idx, value, value_decimal, "inner", x, y, t_ms)
      select mid, (g ->> 'before_series')::int, g ->> 'position', (sh ->> 'idx')::int, (sh ->> 'value')::numeric,
             (sh ->> 'value_decimal')::numeric, coalesce((sh ->> 'inner')::boolean, false),
             (sh ->> 'x')::numeric, (sh ->> 'y')::numeric, (sh ->> 't_ms')::bigint
      from jsonb_array_elements(coalesce(g -> 'shots', '[]'::jsonb)) sh;
    end loop;
  end if;

  insert into loose_shots (training_id, kind, t_ms, scatt_shot_id)
  select tid, (l ->> 'kind')::loose_kind, (l ->> 't_ms')::bigint, (l ->> 'scatt_shot_id')::int
  from jsonb_array_elements(coalesce(payload -> 'loose_shots', '[]'::jsonb)) l;

  if payload -> 'hr_offset_ms' is not null and jsonb_typeof(payload -> 'hr_offset_ms') = 'number' then
    insert into hr_samples_ref (training_id, offset_ms, avg_bpm, zone)
    values (tid, (payload ->> 'hr_offset_ms')::bigint,
            case when jsonb_typeof(payload -> 'hr_avg_bpm') = 'number' then (payload ->> 'hr_avg_bpm')::int end,
            payload ->> 'hr_zone');
  end if;
end $$;

revoke execute on function insert_training_parts(uuid, jsonb) from public, anon;
grant execute on function insert_training_parts(uuid, jsonb) to authenticated;
