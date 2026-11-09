-- Training clock time (owner, 2026-11-09): when the training started and ended, both optional.
alter table trainings add column started_at timestamptz;
alter table trainings add column ended_at timestamptz;
alter table trainings add constraint trainings_time_order check (ended_at is null or started_at is null or ended_at >= started_at);
grant insert (started_at, ended_at), update (started_at, ended_at) on trainings to authenticated;

-- Same function as 0009, now also storing started_at / ended_at from payload.training.
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

  insert into trainings (shooter_id, created_by, discipline, trained_on, name, place, notes, started_at, ended_at)
  values ((t ->> 'shooter_id')::uuid, auth.uid(), t ->> 'discipline', (t ->> 'trained_on')::date,
          coalesce(t ->> 'name', ''), coalesce(t ->> 'place', ''), coalesce(t ->> 'notes', ''),
          (t ->> 'started_at')::timestamptz, (t ->> 'ended_at')::timestamptz)
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
    insert into hr_samples_ref (training_id, offset_ms, avg_bpm)
    values (tid, (payload ->> 'hr_offset_ms')::bigint,
            case when jsonb_typeof(payload -> 'hr_avg_bpm') = 'number' then (payload ->> 'hr_avg_bpm')::int end);
  end if;

  return tid;
end $$;

revoke execute on function save_training(jsonb) from public, anon;
grant execute on function save_training(jsonb) to authenticated;
