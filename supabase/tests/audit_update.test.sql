begin;
select plan(4);

insert into auth.users (id, email) values (u(1), 'u1@example.test');
insert into profiles (id, display_name, role, status) values (u(1), 'S1', 'shooter', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into trainings (id, shooter_id, created_by, discipline, trained_on) values (u(101), u(1), u(1), 'air_rifle', '2026-11-01');
insert into matches (id, training_id, align_state) values (u(201), u(101), 'proposed');
insert into series (id, match_id, idx, total) values (u(301), u(201), 1, 100);

select is(tap(u(1), format($$update matches set align_state = 'confirmed' where id = %L$$, u(201))), 1::bigint,
  'the owner can confirm a match (an update on a table without deleted_at)');
select is((select align_state::text from matches where id = u(201)), 'confirmed', 'the match is confirmed');
select is((select count(*)::int from audit_log where table_name = 'matches' and action = 'update' and row_id = u(201)), 1,
  'the update is in the audit log');
select is(tap(u(1), format($$update series set total = 101 where id = %L$$, u(301))), 1::bigint, 'a series can be updated too');

select * from finish();
rollback;
