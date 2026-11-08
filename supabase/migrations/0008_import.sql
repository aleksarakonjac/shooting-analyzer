-- Import pipeline (Task 13): atomic training save and one-file-once-per-training.

-- The same file (by SHA-256) can exist once per training; a second upload is a duplicate.
create unique index source_files_training_sha on source_files (training_id, sha256);

-- Saves a whole training in ONE transaction (a function call is atomic): training, optional
-- match with series and shots, loose shots (warm-up / failed attempts) and the heart-rate offset.
-- Runs as the caller (security invoker), so row-level security decides who may save for whom.
-- payload: {training:{shooter_id,discipline,trained_on,name,place,notes},
--           match:{label,selection,align_state,series:[{idx,position,total,total_decimal,mpi_x,mpi_y,
--                  group_mm,shots:[{idx,value,inner,direction,x,y,t_ms,scatt_shot_id}]}]} | null,
--           loose_shots:[{kind,t_ms,scatt_shot_id}], hr_offset_ms: number | null}
create function save_training(payload jsonb) returns uuid
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

  insert into trainings (shooter_id, created_by, discipline, trained_on, name, place, notes)
  values ((t ->> 'shooter_id')::uuid, auth.uid(), t ->> 'discipline', (t ->> 'trained_on')::date,
          coalesce(t ->> 'name', ''), coalesce(t ->> 'place', ''), coalesce(t ->> 'notes', ''))
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
    insert into hr_samples_ref (training_id, offset_ms) values (tid, (payload ->> 'hr_offset_ms')::bigint);
  end if;

  return tid;
end $$;

revoke execute on function save_training(jsonb) from public, anon;
grant execute on function save_training(jsonb) to authenticated;
