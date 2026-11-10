-- Session editor (owner, 2026-11-09): files and alignment of a saved session can be changed.
-- replace_training_data rewrites a session's match, warm-up/attempt shots and heart-rate reference in one
-- transaction and updates its fields; the session row, its finals and its id stay. Row-level security
-- decides who may (security invoker): the owner and a linked coach.

-- The rows of a session below the trainings row, shared by save_training and replace_training_data.
create or replace function insert_training_parts(tid uuid, payload jsonb) returns void
language plpgsql set search_path = public as $$
declare
  m jsonb := payload -> 'match';
  mid uuid;
  sid uuid;
  s jsonb;
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
end $$;

revoke execute on function insert_training_parts(uuid, jsonb) from public, anon;
grant execute on function insert_training_parts(uuid, jsonb) to authenticated;

-- save_training as in 0016, with the parts moved to insert_training_parts.
create or replace function save_training(payload jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  t jsonb;
  tid uuid;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or payload -> 'training' is null then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  t := payload -> 'training';

  insert into trainings (shooter_id, created_by, discipline, trained_on, name, place, notes, started_at, ended_at,
                         kind, stage, tz, event_id)
  values ((t ->> 'shooter_id')::uuid, auth.uid(), t ->> 'discipline', (t ->> 'trained_on')::date,
          coalesce(t ->> 'name', ''), coalesce(t ->> 'place', ''), coalesce(t ->> 'notes', ''),
          (t ->> 'started_at')::timestamptz, (t ->> 'ended_at')::timestamptz,
          coalesce(t ->> 'kind', 'trening'), coalesce(t ->> 'stage', 'slobodno'), t ->> 'tz', (t ->> 'event_id')::uuid)
  returning id into tid;

  perform insert_training_parts(tid, payload);
  return tid;
end $$;

create or replace function replace_training_data(tid uuid, payload jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  t jsonb;
  n int;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' or payload -> 'training' is null then
    raise exception 'invalid payload' using errcode = '22023';
  end if;
  t := payload -> 'training';

  update trainings set
    discipline = t ->> 'discipline',
    trained_on = (t ->> 'trained_on')::date,
    name = coalesce(t ->> 'name', ''),
    place = coalesce(t ->> 'place', ''),
    notes = coalesce(t ->> 'notes', ''),
    started_at = (t ->> 'started_at')::timestamptz,
    ended_at = (t ->> 'ended_at')::timestamptz,
    kind = coalesce(t ->> 'kind', 'trening'),
    stage = coalesce(t ->> 'stage', 'slobodno'),
    tz = coalesce(t ->> 'tz', tz),
    event_id = (t ->> 'event_id')::uuid
  where id = tid and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'session not found' using errcode = '42501';
  end if;

  delete from matches where training_id = tid;
  delete from loose_shots where training_id = tid;
  delete from hr_samples_ref where training_id = tid;
  perform insert_training_parts(tid, payload);
  return tid;
end $$;

revoke execute on function replace_training_data(uuid, jsonb) from public, anon;
grant execute on function replace_training_data(uuid, jsonb) to authenticated;
