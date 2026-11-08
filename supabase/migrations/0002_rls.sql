-- Row-level security (Phase 1, Task 9). Roles are enforced here, not in the UI.
-- Rule of thumb: an account must be `active` for anything to work; a coach sees a
-- shooter only through an `active` link; clients never hard-delete trainings.

-- ---------- audit_log: remember whose data a row belongs to ----------
alter table audit_log add column shooter_id uuid;
create index audit_log_shooter on audit_log (shooter_id, at desc);

create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  act text;
  rec jsonb;
  old_rec jsonb;
  sid uuid;
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

  -- Owner of the data. Null when a parent was already removed (cascade from purge_trash):
  -- such rows are visible to the admin only.
  sid := case tg_table_name
    when 'trainings' then (rec ->> 'shooter_id')::uuid
    when 'matches' then (select shooter_id from trainings where id = (rec ->> 'training_id')::uuid)
    when 'source_files' then (select shooter_id from trainings where id = (rec ->> 'training_id')::uuid)
    when 'series' then (select t.shooter_id from matches m join trainings t on t.id = m.training_id
                         where m.id = (rec ->> 'match_id')::uuid)
    when 'shots' then (select t.shooter_id from series s join matches m on m.id = s.match_id
                         join trainings t on t.id = m.training_id where s.id = (rec ->> 'series_id')::uuid)
  end;

  insert into audit_log (actor_id, action, table_name, row_id, shooter_id, diff)
  values (auth.uid(), act, tg_table_name, (rec ->> 'id')::uuid, sid,
          case when old_rec is null then rec else jsonb_build_object('old', old_rec, 'new', rec) end);
  return null;
end $$;

-- ---------- helpers (security definer so policies never recurse) ----------
create function is_active() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and status = 'active') $$;

create function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'admin') $$;

create function coach_of(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from profiles p join links l on l.coach_id = p.id
     where p.id = auth.uid() and p.status = 'active' and p.role = 'coach'
       and l.shooter_id = sid and l.status = 'active') $$;

create function linked_with(other uuid) returns boolean language sql stable security definer set search_path = public as
$$ select is_active() and exists (
     select 1 from links l where l.status = 'active'
       and ((l.shooter_id = auth.uid() and l.coach_id = other) or (l.coach_id = auth.uid() and l.shooter_id = other))) $$;

create function can_see_shooter(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select is_active() and (sid = auth.uid() or is_admin() or coach_of(sid)) $$;

create function can_see_training(tid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from trainings t where t.id = tid and can_see_shooter(t.shooter_id)) $$;

create function can_see_match(mid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from matches m where m.id = mid and can_see_training(m.training_id)) $$;

create function can_see_series(sid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from series s where s.id = sid and can_see_match(s.match_id)) $$;

-- Fitbit/calendar-derived data (Phase 3) is hidden from coaches unless the shooter shared it.
create function has_context_share(sid uuid, tid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select is_active() and (
     sid = auth.uid() or is_admin()
     or (coach_of(sid) and exists (
           select 1 from shares s where s.shooter_id = sid and (
             s.scope = 'all'
             or (s.scope = 'training' and s.training_id = tid)
             or (s.scope = 'period' and exists (
                   select 1 from trainings t where t.id = tid and t.trained_on between s.from_date and s.to_date)))))) $$;

create function training_from_path(object_name text) returns uuid language plpgsql immutable as $$
begin
  return (string_to_array(object_name, '/'))[1]::uuid;
exception when others then
  return null;
end $$;

-- Admin approval / role changes: the only way role and status change.
create function admin_set_profile(pid uuid, new_role user_role, new_status account_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update profiles set role = new_role, status = new_status where id = pid;
end $$;

-- ---------- grants: nothing by default, then exactly what the policies gate ----------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on profiles, links, trainings, matches, series, shots, loose_shots,
  source_files, hr_samples_ref, shares, audit_log to authenticated;
grant update (display_name, tz) on profiles to authenticated;
grant insert (shooter_id, coach_id, requested_by) on links to authenticated;
grant update (status) on links to authenticated;
grant insert (id, shooter_id, created_by, discipline, trained_on, name, place, notes) on trainings to authenticated;
grant update (discipline, trained_on, name, place, notes, deleted_at) on trainings to authenticated;
grant insert, update, delete on matches, series, shots, loose_shots, source_files,
  hr_samples_ref, shares to authenticated;

grant execute on function is_active(), is_admin(), coach_of(uuid), linked_with(uuid),
  can_see_shooter(uuid), can_see_training(uuid), can_see_match(uuid), can_see_series(uuid),
  has_context_share(uuid, uuid), training_from_path(text), admin_set_profile(uuid, user_role, account_status)
  to authenticated;

-- ---------- policies ----------
-- A pending/disabled user may read only their own profile row (the waiting page needs it).
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_admin() or linked_with(id));
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid() and is_active()) with check (id = auth.uid());

create policy links_select on links for select to authenticated
  using (is_active() and (shooter_id = auth.uid() or coach_id = auth.uid() or is_admin()));
create policy links_insert on links for insert to authenticated
  with check (is_active() and requested_by = auth.uid() and auth.uid() in (shooter_id, coach_id)
              and status = 'pending');
-- Ending is open to both sides; only the side that did not request may confirm.
create policy links_update on links for update to authenticated
  using (is_active() and auth.uid() in (shooter_id, coach_id))
  with check (is_active() and auth.uid() in (shooter_id, coach_id)
              and (status = 'ended' or (status = 'active' and requested_by <> auth.uid())));

create policy trainings_select on trainings for select to authenticated
  using (can_see_shooter(shooter_id));
create policy trainings_insert on trainings for insert to authenticated
  with check (can_see_shooter(shooter_id) and created_by = auth.uid());
create policy trainings_update on trainings for update to authenticated
  using (can_see_shooter(shooter_id)) with check (can_see_shooter(shooter_id));

create policy matches_all on matches for all to authenticated
  using (can_see_training(training_id)) with check (can_see_training(training_id));
create policy series_all on series for all to authenticated
  using (can_see_match(match_id)) with check (can_see_match(match_id));
create policy shots_all on shots for all to authenticated
  using (can_see_series(series_id)) with check (can_see_series(series_id));
create policy loose_shots_all on loose_shots for all to authenticated
  using (can_see_training(training_id)) with check (can_see_training(training_id));
create policy source_files_all on source_files for all to authenticated
  using (can_see_training(training_id)) with check (can_see_training(training_id));
create policy hr_samples_ref_all on hr_samples_ref for all to authenticated
  using (can_see_training(training_id)) with check (can_see_training(training_id));

-- Sharing settings belong to the shooter alone (the admin may read).
create policy shares_select on shares for select to authenticated
  using (is_active() and (shooter_id = auth.uid() or is_admin()));
create policy shares_write on shares for all to authenticated
  using (is_active() and shooter_id = auth.uid()) with check (is_active() and shooter_id = auth.uid());

-- Audit history: each user sees their own shooter's rows, the admin sees everything.
create policy audit_select on audit_log for select to authenticated
  using (is_admin() or (shooter_id is not null and can_see_shooter(shooter_id)));

-- ---------- storage: bucket source-files, path <training_id>/<file> ----------
insert into storage.buckets (id, name, public) values ('source-files', 'source-files', false)
on conflict (id) do nothing;

create policy source_files_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'source-files' and can_see_training(training_from_path(name)));
create policy source_files_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'source-files' and can_see_training(training_from_path(name)));
create policy source_files_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'source-files' and can_see_training(training_from_path(name)))
  with check (bucket_id = 'source-files' and can_see_training(training_from_path(name)));
create policy source_files_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'source-files' and can_see_training(training_from_path(name)));
