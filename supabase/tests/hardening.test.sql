begin;
select plan(14);

insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 2) n;
insert into profiles (id, display_name, role, status) values (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;

-- Link functions: signed-in users only (they were executable by anon through PUBLIC).
select ok(not has_function_privilege('anon', 'request_link(text)', 'execute'), 'anon cannot request a link');
select ok(not has_function_privilege('anon', 'my_links()', 'execute'), 'anon cannot list links');
select ok(not has_function_privilege('anon', 'confirm_link(uuid)', 'execute'), 'anon cannot confirm a link');
select ok(not has_function_privilege('anon', 'end_link(uuid)', 'execute'), 'anon cannot end a link');
select ok(has_function_privilege('authenticated', 'request_link(text)', 'execute'), 'a signed-in user still can');

-- A stored final keeps its discipline and training; only placement and elimination change.
insert into trainings (id, shooter_id, created_by, discipline, trained_on, stage) values
  (u(101), u(1), u(1), 'air_rifle', '2026-11-01', 'finale');
insert into finals (id, training_id, discipline, placement) values (u(201), u(101), 'air_rifle', 3);
insert into final_shots (final_id, stage_idx, idx, value) values (u(201), 0, 1, 10.1);
select is(tap(u(1), format($$update finals set discipline = 'air_pistol' where id = %L$$, u(201))), -1::bigint,
  'the discipline of a final cannot be changed');
select is(tap(u(1), format($$update finals set placement = 2 where id = %L$$, u(201))), 1::bigint,
  'the placement can');
select is(tap(u(1), format($$update final_shots set final_id = %L where final_id = %L$$, u(201), u(201))), -1::bigint,
  'a shot cannot be moved to another final');
select is(tap(u(1), format($$update final_shots set value = 10.2 where final_id = %L$$, u(201))), 1::bigint,
  'a shot value can be corrected');

-- purge_trainings: the purge job removes only the given trainings that are past the cutoff.
insert into trainings (id, shooter_id, created_by, discipline, trained_on, deleted_at) values
  (u(301), u(1), u(1), 'air_rifle', '2026-09-01', now() - interval '31 days'),
  (u(302), u(1), u(1), 'air_rifle', '2026-09-02', now() - interval '29 days'),
  (u(303), u(1), u(1), 'air_rifle', '2026-09-03', now() - interval '40 days'),
  (u(304), u(1), u(1), 'air_rifle', '2026-09-04', null);
select ok(not has_function_privilege('authenticated', 'purge_trainings(uuid[], timestamptz)', 'execute'), 'users cannot purge');
select ok(has_function_privilege('service_role', 'purge_trainings(uuid[], timestamptz)', 'execute'), 'the purge job can');
select is(purge_trainings(array[u(301), u(302), u(304)], now() - interval '30 days'), array[u(301)],
  'only a listed training past the cutoff is purged');
select is((select count(*)::int from trainings where id in (u(302), u(303), u(304))), 3,
  'a recent one, an unlisted one and a live one stay');
select is(purge_trainings(array[]::uuid[], now()), array[]::uuid[], 'an empty list purges nothing');

select * from finish();
rollback;
