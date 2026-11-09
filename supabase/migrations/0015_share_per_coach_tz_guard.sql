-- Sharing belongs to a coach link (owner, 2026-11-09): a share names the coach it is for.
-- Older rows without a coach keep applying to every linked coach.
alter table shares add column coach_id uuid references profiles (id) on delete cascade;
create index shares_coach on shares (shooter_id, coach_id);

create or replace function has_context_share(sid uuid, tid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select is_active() and (
     sid = auth.uid() or is_admin()
     or (coach_of(sid) and exists (
           select 1 from shares s where s.shooter_id = sid
             and (s.coach_id is null or s.coach_id = auth.uid())
             and (
               s.scope = 'all'
               or (s.scope = 'training' and s.training_id = tid)
               or (s.scope = 'period' and exists (
                     select 1 from trainings t where t.id = tid and t.trained_on between s.from_date and s.to_date)))))) $$;

-- A share can only name a coach the shooter is actively linked with.
drop policy shares_write on shares;
create policy shares_write on shares for all to authenticated
  using (is_active() and shooter_id = auth.uid())
  with check (is_active() and shooter_id = auth.uid() and (coach_id is null or linked_with(coach_id)));

-- profiles.tz must be a real IANA zone: a bad value would break every date on every page for that user.
create function profiles_tz_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.tz) then
    raise exception 'unknown time zone %', new.tz using errcode = '22023';
  end if;
  return new;
end $$;
create trigger profiles_tz_guard before insert or update of tz on profiles
  for each row execute function profiles_tz_guard();
