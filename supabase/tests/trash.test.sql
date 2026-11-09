begin;
select plan(9);

-- 1 S1 shooter, 2 S2 shooter, 3 C1 coach linked to S1
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 3) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active'), (u(3), 'C1', 'coach', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into links (shooter_id, coach_id, requested_by, status) values (u(1), u(3), u(1), 'active');

insert into trainings (id, shooter_id, created_by, discipline, trained_on, deleted_at) values
  (u(101), u(1), u(1), 'air_rifle', '2026-11-01', now()),
  (u(102), u(1), u(1), 'air_rifle', '2026-11-02', null),
  (u(103), u(1), u(1), 'air_rifle', '2026-11-03', now());
insert into matches (id, training_id, align_state) values (u(201), u(101), 'confirmed');

select is(tap(u(2), format($$select delete_training_forever(%L)$$, u(101))), -1::bigint, 'another shooter cannot delete it forever');
select is(tap(u(1), format($$select delete_training_forever(%L)$$, u(102))), -1::bigint, 'a training outside the trash cannot be deleted forever');
select is((select count(*)::int from trainings where id in (u(101), u(102))), 2, 'both are still there');

select is(tap(u(1), format($$select delete_training_forever(%L)$$, u(101))), 1::bigint, 'the owner deletes a trashed training forever');
select is((select count(*)::int from trainings where id = u(101)), 0, 'the training is gone');
select is((select count(*)::int from matches where training_id = u(101)), 0, 'its match went with it');
select is((select actor_id from audit_log where table_name = 'trainings' and action = 'delete' and row_id = u(101)), u(1),
  'the audit log records who deleted it');

select is(tap(u(3), format($$select delete_training_forever(%L)$$, u(103))), 1::bigint, 'a linked coach may delete a trashed training forever');
select is(has_function_privilege('anon', 'delete_training_forever(uuid)', 'execute'), false, 'anonymous callers cannot run it');

select * from finish();
rollback;
