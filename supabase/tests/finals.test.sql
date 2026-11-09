begin;
select plan(15);

-- 1 S1 shooter, 2 S2 shooter, 3 C1 coach linked to S1, 4 C2 coach whose link to S1 ended
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 4) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active'),
  (u(3), 'C1', 'coach', 'active'), (u(4), 'C2', 'coach', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into links (shooter_id, coach_id, requested_by, status) values (u(1), u(3), u(1), 'active'), (u(1), u(4), u(1), 'ended');

insert into trainings (id, shooter_id, created_by, discipline, trained_on, stage) values
  (u(101), u(1), u(1), 'air_rifle', '2026-11-01', 'finale'),
  (u(102), u(1), u(1), 'smallbore_3p', '2026-11-02', 'finale'),
  (u(103), u(1), u(1), 'smallbore_pistol', '2026-11-03', 'finale');

create function final_payload(tid uuid, n int, elim int default null) returns jsonb language sql as $$
  select jsonb_build_object('training_id', tid, 'placement', 3, 'eliminated_after_shot', elim,
    'shots', (select jsonb_agg(jsonb_build_object('idx', i, 'stage_idx', case when i <= 5 then 0 when i <= 10 then 1 else 2 end,
      'value', 10.1, 't_ms', 1792596598000 + i * 1000)) from generate_series(1, n) i));
$$;

-- the shooter saves a final of 24 shots in one call
select is(tap(u(1), format($$select save_final(%L::jsonb)$$, final_payload(u(101), 24))), 1::bigint, 'the shooter saves a 24-shot final');
select is((select count(*)::int from final_shots), 24, 'all 24 shots are stored');
select is((select discipline from finals where training_id = u(101)), 'air_rifle', 'the discipline is taken from the training');

-- elimination point is stored
select is(tap(u(1), format($$select save_final(%L::jsonb)$$, final_payload(u(101), 18, 18))), 1::bigint, 'a final with an elimination saves');
select is((select eliminated_after_shot from finals where eliminated_after_shot is not null), 18, 'eliminated_after_shot 18 is stored');

-- limits
select throws_ok(
  format($$select save_final(%L::jsonb)$$, final_payload(u(101), 25)), '23514', null, 'a 25th shot is rejected for air rifle');
select lives_ok(
  format($$select save_final(%L::jsonb)$$, final_payload(u(102), 35)), 'small-bore 3 positions takes 35 shots');
select throws_ok(
  format($$select save_final(%L::jsonb)$$, final_payload(u(102), 36)), '23514', null, 'a 36th shot is rejected for small-bore');
select throws_ok(
  format($$select save_final(%L::jsonb)$$, final_payload(u(103), 5)), '23514', null, 'no finals for small-bore pistol yet');
select throws_ok(
  $$insert into final_shots (final_id, stage_idx, idx, value)
    select id, 0, 99, 10.1 from finals limit 1$$, '23514', null, 'a shot index above the maximum is rejected');
select throws_ok(
  $$insert into final_shots (final_id, stage_idx, idx, value)
    select id, 0, 30, 11.0 from finals where discipline = 'smallbore_3p' limit 1$$,
  '23514', null, 'a value above 10.9 is rejected');

-- row-level security follows the training
select is((select count(*)::int from finals), 3, 'the table holds three finals in total');
select is(tap(u(3), 'select * from finals'), 3::bigint, 'a linked coach reads the finals');
select is(tap(u(4), 'select * from finals'), 0::bigint, 'a coach with an ended link reads zero finals');
select is(tap(u(2), format($$select save_final(%L::jsonb)$$, final_payload(u(101), 5))), -1::bigint, 'another shooter cannot add a final');

select * from finish();
rollback;
