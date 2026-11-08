begin;
select plan(36);

-- 1 S1, 2 S2, 3 C1 (coach), 4 C2 (coach), 5 P (pending shooter), 6 C3 (pending coach)
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 6) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active'),
  (u(3), 'C1', 'coach', 'active'), (u(4), 'C2', 'coach', 'active'),
  (u(5), 'P', 'shooter', 'pending'), (u(6), 'C3', 'coach', 'pending')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into trainings (id, shooter_id, created_by, discipline, trained_on)
  values (u(101), u(1), u(1), 'air_rifle', '2026-10-15');

-- Requests
select is(tap(u(3), $$select request_link('u1@example.test')$$), 1::bigint, 'coach requests link by email');
select is((select status::text || requested_by::text from links where shooter_id = u(1) and coach_id = u(3)),
          'pending' || u(3)::text, 'link is pending and requested by the coach');
select is(tap(u(3), $$select request_link(' U1@Example.Test ')$$), 1::bigint, 'second request is accepted silently');
select is((select count(*)::int from links where shooter_id = u(1) and coach_id = u(3)), 1, 'no duplicate open link');
select is(tap(u(3), $$select request_link('nobody@example.test')$$), 1::bigint, 'unknown email gives no error (no enumeration)');
select is(tap(u(3), $$select request_link('u4@example.test')$$), 1::bigint, 'coach to coach is a silent no-op');
select is(tap(u(3), $$select request_link('u5@example.test')$$), 1::bigint, 'pending target is a silent no-op');
select is((select count(*)::int from links), 1, 'only the valid request created a link');
select is(tap(u(6), $$select request_link('u1@example.test')$$), 1::bigint, 'pending coach request is a silent no-op');
select is((select count(*)::int from links), 1, 'pending coach created nothing');
select is(tap(u(2), $$select request_link('u4@example.test')$$), 1::bigint, 'shooter requests a coach too');
select is((select requested_by from links where shooter_id = u(2) and coach_id = u(4)), u(2), 'shooter-initiated link records the shooter');

-- Listing
select is(tap(u(1), 'select 1 from my_links()'), 1::bigint, 'shooter sees the incoming request');
select is((select other_name from my_links_for(u(1))), 'C1', 'request shows the requester name');
select is(tap(u(3), 'select 1 from my_links()'), 1::bigint, 'coach sees own request');
select is(tap(u(4), 'select 1 from my_links()'), 1::bigint, 'second coach sees only own link');
select is(tap(u(5), 'select 1 from my_links()'), 0::bigint, 'unrelated user sees none');

-- Confirm and effect
select is(tap(u(3), 'select 1 from trainings'), 0::bigint, 'coach sees no trainings before confirmation');
select is(tap(u(3), format($$update links set status = 'active' where shooter_id = %L and coach_id = %L$$, u(1), u(3))), -1::bigint, 'requester cannot confirm');
select is(tap(u(1), format($$update links set status = 'active' where shooter_id = %L and coach_id = %L$$, u(1), u(3))), 1::bigint, 'shooter confirms');
select is(tap(u(3), 'select 1 from trainings'), 1::bigint, 'coach sees the shooter training after confirmation');
select is(tap(u(1), format($$update links set status = 'ended' where shooter_id = %L and coach_id = %L$$, u(1), u(3))), 1::bigint, 'shooter ends the link');
select is(tap(u(3), 'select 1 from trainings'), 0::bigint, 'coach sees nothing after the link ended');
select is(tap(u(3), 'select 1 from my_links()'), 0::bigint, 'ended links are not listed');
select is(tap(u(3), $$select request_link('u1@example.test')$$), 1::bigint, 're-request after ending');
select is((select count(*)::int from links where shooter_id = u(1) and coach_id = u(3)), 2, 'ended row kept, new pending row added');

-- Shares
select is(tap(u(1), $$insert into shares (shooter_id, scope, from_date, to_date) values ('$$ || u(1) || $$', 'period', '2026-10-01', '2026-10-31')$$), 1::bigint, 'period share is created');
select is(tap(u(1), $$insert into shares (shooter_id, scope) values ('$$ || u(1) || $$', 'all')$$), 1::bigint, 'all-trainings share is created');
select is(tap(u(1), $$insert into shares (shooter_id, scope, training_id) values ('$$ || u(1) || $$', 'training', '$$ || u(101) || $$')$$), 1::bigint, 'single-training share is created');
select is(tap(u(1), $$insert into shares (shooter_id, scope) values ('$$ || u(1) || $$', 'training')$$), -1::bigint, 'training share needs a training');
select is(tap(u(1), $$insert into shares (shooter_id, scope, from_date, to_date) values ('$$ || u(1) || $$', 'period', '2026-11-01', '2026-10-01')$$), -1::bigint, 'period must not be reversed');
select is(tap(u(1), $$insert into shares (shooter_id, scope, from_date) values ('$$ || u(1) || $$', 'period', '2026-11-01')$$), -1::bigint, 'period needs both dates');
select is(tap(u(1), $$insert into shares (shooter_id, scope, from_date, to_date) values ('$$ || u(1) || $$', 'all', '2026-10-01', '2026-10-31')$$), -1::bigint, 'all-share carries no dates');
select is(tap(u(1), 'select 1 from shares'), 3::bigint, 'shooter sees own shares');
select is(tap(u(3), 'select 1 from shares'), 0::bigint, 'coach cannot read shares');
select is(tap(u(1), 'delete from shares'), 3::bigint, 'shooter revokes shares');

select * from finish();
rollback;
