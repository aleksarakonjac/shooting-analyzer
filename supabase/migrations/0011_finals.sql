-- Finals (spec 6a): a recorded final belongs to a training; ordered decimal shots in stages, optional
-- timestamps, the placement and the shot after which the shooter was eliminated.
create function final_max_shots(d text) returns int language sql immutable as $$
  select case d when 'air_rifle' then 24 when 'air_pistol' then 24 when 'smallbore_3p' then 35 end
$$;

create table finals (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  discipline text not null check (discipline in ('air_rifle', 'air_pistol', 'smallbore_3p')),
  placement int check (placement between 1 and 8),
  eliminated_after_shot int check (eliminated_after_shot >= 1),
  created_at timestamptz not null default now(),
  -- The top two shooters fire everything, so an elimination point is always below the maximum.
  check (eliminated_after_shot is null or eliminated_after_shot < final_max_shots(discipline))
);
create index finals_training on finals (training_id);

create table final_shots (
  id uuid primary key default gen_random_uuid(),
  final_id uuid not null references finals (id) on delete cascade,
  stage_idx int not null check (stage_idx >= 0),
  idx int not null check (idx >= 1),
  value numeric(3, 1) not null check (value between 0 and 10.9),
  t_ms bigint,
  unique (final_id, idx)
);

-- A shot number above the format's maximum is rejected.
create function final_shots_guard() returns trigger language plpgsql as $$
begin
  if new.idx > final_max_shots((select discipline from finals where id = new.final_id)) then
    raise exception 'shot index above the maximum for this final' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger final_shots_guard before insert or update of idx, final_id on final_shots
  for each row execute function final_shots_guard();

alter table finals enable row level security;
alter table final_shots enable row level security;

create function can_see_final(fid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from finals f where f.id = fid and can_see_training(f.training_id)) $$;

grant select, insert, update, delete on finals, final_shots to authenticated;
revoke execute on function can_see_final(uuid) from public, anon;
grant execute on function can_see_final(uuid) to authenticated;

-- Same visibility as the training itself (owner, linked coach, admin).
create policy finals_all on finals for all to authenticated
  using (can_see_training(training_id)) with check (can_see_training(training_id));
create policy final_shots_all on final_shots for all to authenticated
  using (can_see_final(final_id)) with check (can_see_final(final_id));

-- Saves a final and its shots in one transaction, as the caller (row-level security decides who may).
-- payload: {training_id, placement, eliminated_after_shot, shots:[{idx, stage_idx, value, t_ms}]}
create function save_final(payload jsonb) returns uuid
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
  select discipline into disc from trainings where id = tid;
  if disc is null then
    raise exception 'training not found' using errcode = '42501';
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
