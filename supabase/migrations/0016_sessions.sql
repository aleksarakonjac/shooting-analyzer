-- Sessions (owner, 2026-11-09): a training row is a session with a type, a part, the venue time zone
-- and an optional event that groups the sessions of one competition or control match.

create table events (
  id uuid primary key default gen_random_uuid(),
  shooter_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('kontrolni', 'takmicenje')),
  name text not null check (length(trim(name)) > 0),
  place text not null default '',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index events_shooter on events (shooter_id, starts_on desc);
alter table events enable row level security;
grant select, insert, update, delete on events to authenticated;
create policy events_all on events for all to authenticated
  using (can_see_shooter(shooter_id)) with check (can_see_shooter(shooter_id));

alter table trainings
  add column kind text not null default 'trening' check (kind in ('trening', 'kontrolni', 'takmicenje')),
  add column stage text not null default 'slobodno' check (stage in ('slobodno', 'eliminacije', 'kvalifikacije', 'finale')),
  add column tz text,
  add column event_id uuid references events (id) on delete set null;
create index trainings_event on trainings (event_id) where event_id is not null;

-- Existing sessions happened in their owner's zone.
update trainings t set tz = p.tz from profiles p where p.id = t.shooter_id and t.tz is null;

-- New sessions default to the owner's zone; any zone must be a real IANA name (same check as profiles);
-- an event must belong to the session's shooter.
create function trainings_session_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.tz is null then
    select tz into new.tz from profiles where id = new.shooter_id;
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.tz) then
    raise exception 'unknown time zone %', new.tz using errcode = '22023';
  end if;
  if new.event_id is not null and not exists (select 1 from events e where e.id = new.event_id and e.shooter_id = new.shooter_id) then
    raise exception 'event belongs to another shooter' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trainings_session_guard before insert or update of tz, event_id, shooter_id on trainings
  for each row execute function trainings_session_guard();
alter table trainings alter column tz set not null;

grant insert (kind, stage, tz, event_id), update (kind, stage, tz, event_id) on trainings to authenticated;

-- The zone the heart-rate file's clock is read in (applied per sample when the report loads).
alter table hr_samples_ref add column zone text;
grant insert (zone), update (zone, offset_ms, avg_bpm) on hr_samples_ref to authenticated;

-- save_training as in 0012, now also storing kind, stage, tz, event_id and the heart-rate zone.
create or replace function save_training(payload jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  t jsonb;
  m jsonb;
  tid uuid;
  mid uuid;
  sid uuid;
  s jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or payload -> 'training' is null then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  t := payload -> 'training';
  m := payload -> 'match';

  insert into trainings (shooter_id, created_by, discipline, trained_on, name, place, notes, started_at, ended_at,
                         kind, stage, tz, event_id)
  values ((t ->> 'shooter_id')::uuid, auth.uid(), t ->> 'discipline', (t ->> 'trained_on')::date,
          coalesce(t ->> 'name', ''), coalesce(t ->> 'place', ''), coalesce(t ->> 'notes', ''),
          (t ->> 'started_at')::timestamptz, (t ->> 'ended_at')::timestamptz,
          coalesce(t ->> 'kind', 'trening'), coalesce(t ->> 'stage', 'slobodno'), t ->> 'tz', (t ->> 'event_id')::uuid)
  returning id into tid;

  if m is not null and jsonb_typeof(m) = 'object' then
    insert into matches (training_id, label, selection, align_state)
    values (tid, coalesce(m ->> 'label', ''), m -> 'selection', (m ->> 'align_state')::align_state)
    returning id into mid;

    for s in select * from jsonb_array_elements(coalesce(m -> 'series', '[]'::jsonb)) loop
      insert into series (match_id, idx, position, total, total_decimal, mpi_x, mpi_y, group_mm)
      values (mid, (s ->> 'idx')::int, s ->> 'position', (s ->> 'total')::int, (s ->> 'total_decimal')::numeric,
              (s ->> 'mpi_x')::numeric, (s ->> 'mpi_y')::numeric, (s ->> 'group_mm')::numeric)
      returning id into sid;

      insert into shots (series_id, idx, value, "inner", direction, x, y, t_ms, scatt_shot_id)
      select sid, (sh ->> 'idx')::int, (sh ->> 'value')::numeric, coalesce((sh ->> 'inner')::boolean, false),
             sh ->> 'direction', (sh ->> 'x')::numeric, (sh ->> 'y')::numeric,
             (sh ->> 't_ms')::bigint, (sh ->> 'scatt_shot_id')::int
      from jsonb_array_elements(coalesce(s -> 'shots', '[]'::jsonb)) sh;
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

  return tid;
end $$;

revoke execute on function save_training(jsonb) from public, anon;
grant execute on function save_training(jsonb) to authenticated;

-- save_final as in 0011, now only on a finale session that is not in the trash.
create or replace function save_final(payload jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  tid uuid;
  disc text;
  fid uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  tid := (payload ->> 'training_id')::uuid;
  -- A final belongs to a finale session that is not in the trash.
  select discipline into disc from trainings where id = tid and stage = 'finale' and deleted_at is null;
  if disc is null then
    raise exception 'not a finale session' using errcode = '42501';
  end if;

  insert into finals (training_id, discipline, placement, eliminated_after_shot)
  values (tid, disc, (payload ->> 'placement')::int, (payload ->> 'eliminated_after_shot')::int)
  returning id into fid;

  insert into final_shots (final_id, stage_idx, idx, value, t_ms)
  select fid, (s ->> 'stage_idx')::int, (s ->> 'idx')::int, (s ->> 'value')::numeric, (s ->> 't_ms')::bigint
  from jsonb_array_elements(coalesce(payload -> 'shots', '[]'::jsonb)) s;

  return fid;
end $$;

revoke execute on function save_final(jsonb) from public, anon;
grant execute on function save_final(jsonb) to authenticated;
