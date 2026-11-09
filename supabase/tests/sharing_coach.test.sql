begin;
select plan(8);

-- 1 S1 shooter, 3 C1 and 4 C2 coaches both actively linked to S1, 5 C3 coach not linked
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from unnest(array[1,3,4,5]) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(3), 'C1', 'coach', 'active'), (u(4), 'C2', 'coach', 'active'), (u(5), 'C3', 'coach', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into links (shooter_id, coach_id, requested_by, status) values (u(1), u(3), u(1), 'active'), (u(1), u(4), u(1), 'active');
insert into trainings (id, shooter_id, created_by, discipline, trained_on) values (u(101), u(1), u(1), 'air_rifle', '2026-11-01');

create function share_for(viewer uuid) returns bigint language plpgsql as $$
begin
  return tap(viewer, format($q$select 1 where has_context_share(%L, %L)$q$, u(1), u(101)));
end $$;

select is(tap(u(1), format($$insert into shares (shooter_id, coach_id, scope) values (%L, %L, 'all')$$, u(1), u(3))), 1::bigint,
  'the shooter shares everything with coach C1');
select is(share_for(u(3)), 1::bigint, 'C1 gets the share');
select is(share_for(u(4)), 0::bigint, 'C2, also linked, does not');
select is(tap(u(1), format($$insert into shares (shooter_id, coach_id, scope) values (%L, %L, 'all')$$, u(1), u(5))), -1::bigint,
  'a share cannot name a coach who is not linked');

delete from shares;
insert into shares (shooter_id, scope) values (u(1), 'all');
select is(share_for(u(4)), 1::bigint, 'an older share without a coach still applies to every linked coach');

select is(tap(u(1), format($$update profiles set tz = 'Mars/Olympus' where id = %L$$, u(1))), -1::bigint, 'an unknown time zone is refused');
select is(tap(u(1), format($$update profiles set tz = 'America/New_York' where id = %L$$, u(1))), 1::bigint, 'a real time zone is accepted');
select is((select tz from profiles where id = u(1)), 'America/New_York', 'the zone is stored');

select * from finish();
rollback;
