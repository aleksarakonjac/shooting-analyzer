-- Core schema (Phase 1, Task 8). RLS comes in Task 9.

create type user_role as enum ('shooter', 'coach', 'admin');
create type account_status as enum ('pending', 'active', 'disabled');
create type link_status as enum ('pending', 'active', 'ended');
create type align_state as enum ('proposed', 'confirmed');
create type loose_kind as enum ('warmup', 'attempt');
create type source_kind as enum ('sius_csv', 'sius_pdf', 'scatt', 'tcx');
create type share_scope as enum ('all', 'training', 'period');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role user_role not null default 'shooter',
  status account_status not null default 'pending',
  tz text not null default 'Europe/Belgrade',
  created_at timestamptz not null default now()
);

create table links (
  id uuid primary key default gen_random_uuid(),
  shooter_id uuid not null references profiles (id) on delete cascade,
  coach_id uuid not null references profiles (id) on delete cascade,
  requested_by uuid not null references profiles (id),
  status link_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (shooter_id, coach_id)
);

create table trainings (
  id uuid primary key default gen_random_uuid(),
  shooter_id uuid not null references profiles (id) on delete cascade,
  created_by uuid not null references profiles (id),
  discipline text not null
    check (discipline in ('air_rifle', 'smallbore_3p', 'air_pistol', 'smallbore_pistol')),
  trained_on date not null,
  name text not null default '',
  place text not null default '',
  notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index trainings_shooter_day on trainings (shooter_id, trained_on desc) where deleted_at is null;
create index trainings_trash on trainings (deleted_at) where deleted_at is not null;

create table matches (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  label text not null default '',
  selection jsonb,
  align_state align_state not null default 'proposed'
);
create index matches_training on matches (training_id);

create table series (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  idx int not null,
  position text check (position in ('kneeling', 'prone', 'standing')),
  total int,
  total_decimal numeric(5, 1),
  mpi_x numeric,
  mpi_y numeric,
  group_mm numeric,
  unique (match_id, idx)
);

create table shots (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series (id) on delete cascade,
  idx int not null,
  value numeric(4, 1) not null,
  "inner" boolean not null default false,
  direction text,
  x numeric,
  y numeric,
  t_ms bigint,
  scatt_shot_id int,
  ignored boolean not null default false,
  -- Phase 4 reservations: decoded aim trace and per-shot SCATT metrics.
  trace_ref text,
  scatt_metrics jsonb,
  unique (series_id, idx)
);

create table loose_shots (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  kind loose_kind not null,
  t_ms bigint not null,
  scatt_shot_id int
);
create index loose_shots_training on loose_shots (training_id);

create table source_files (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings (id) on delete cascade,
  kind source_kind not null,
  storage_path text not null,
  sha256 text not null,
  bytes bigint not null
);
create index source_files_training on source_files (training_id);

create table hr_samples_ref (
  training_id uuid primary key references trainings (id) on delete cascade,
  offset_ms bigint not null default 0
);

create table shares (
  id uuid primary key default gen_random_uuid(),
  shooter_id uuid not null references profiles (id) on delete cascade,
  scope share_scope not null,
  training_id uuid references trainings (id) on delete cascade,
  from_date date,
  to_date date
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  row_id uuid,
  at timestamptz not null default now(),
  diff jsonb
);
create index audit_log_row on audit_log (table_name, row_id);

create function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  act text;
  rec jsonb;
  old_rec jsonb;
begin
  if tg_op = 'INSERT' then
    act := 'insert'; rec := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    act := 'delete'; rec := to_jsonb(old);
  else
    rec := to_jsonb(new); old_rec := to_jsonb(old);
    if tg_table_name = 'trainings' and old.deleted_at is null and new.deleted_at is not null then
      act := 'soft_delete';
    elsif tg_table_name = 'trainings' and old.deleted_at is not null and new.deleted_at is null then
      act := 'restore';
    else
      act := 'update';
    end if;
  end if;
  insert into audit_log (actor_id, action, table_name, row_id, diff)
  values (auth.uid(), act, tg_table_name, (rec ->> 'id')::uuid,
          case when old_rec is null then rec else jsonb_build_object('old', old_rec, 'new', rec) end);
  return null;
end $$;

create trigger audit_trainings after insert or update or delete on trainings
  for each row execute function audit_row();
create trigger audit_matches after insert or update or delete on matches
  for each row execute function audit_row();
create trigger audit_series after insert or update or delete on series
  for each row execute function audit_row();
create trigger audit_shots after insert or update or delete on shots
  for each row execute function audit_row();
create trigger audit_source_files after insert or update or delete on source_files
  for each row execute function audit_row();

-- Permanently removes trainings that sat in the trash for more than 30 days.
-- Child rows go with them (on delete cascade). Returns the number purged.
create function purge_trash() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from trainings where deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
