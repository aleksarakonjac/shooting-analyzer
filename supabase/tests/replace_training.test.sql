begin;
select plan(10);

-- 1 S1 shooter, 2 S2 shooter, 3 C1 coach linked to S1
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from unnest(array[1,2,3]) n;
insert into profiles (id, display_name, role, status, tz) values
  (u(1), 'S1', 'shooter', 'active', 'Europe/Belgrade'), (u(2), 'S2', 'shooter', 'active', 'Europe/Belgrade'),
  (u(3), 'C1', 'coach', 'active', 'Europe/Belgrade')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status, tz = excluded.tz;
insert into links (shooter_id, coach_id, requested_by, status) values (u(1), u(3), u(1), 'active');

create function payload(total int, shots int, hr jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'training', jsonb_build_object('shooter_id', u(1), 'discipline', 'air_rifle', 'trained_on', '2026-11-09', 'name', 'S', 'stage', 'kvalifikacije'),
    'match', jsonb_build_object('label', '', 'align_state', 'proposed', 'selection', null, 'series', jsonb_build_array(
      jsonb_build_object('idx', 1, 'total', total, 'total_decimal', total, 'shots',
        (select coalesce(jsonb_agg(jsonb_build_object('idx', i, 'value', 10.0, 't_ms', i * 1000, 'scatt_shot_id', i)), '[]'::jsonb) from generate_series(1, shots) i)))),
    'loose_shots', jsonb_build_array(jsonb_build_object('kind', 'warmup', 't_ms', 1, 'scatt_shot_id', 99)),
    'hr_offset_ms', hr, 'hr_avg_bpm', 80);
$$;

select is(tap(u(1), format($$select save_training(%L::jsonb)$$, payload(100, 10, '0'::jsonb))), 1::bigint, 'a session saves');
create temp table tid as select id from trainings where name = 'S';
grant select on tid to authenticated;

select is(tap(u(1), format($$select replace_training_data(%L, %L::jsonb)$$, (select id from tid),
  payload(101, 3, '5000'::jsonb) || jsonb_build_object('match', payload(101, 3, '5000'::jsonb) -> 'match' || '{"align_state": "confirmed"}'))), 1::bigint,
  'the owner replaces the session''s data');
select is((select count(*) from trainings), 1::bigint, 'no second session is created');
select is((select count(*) from shots), 3::bigint, 'the old shots are gone and the new ones are in');
select is((select align_state::text from matches), 'confirmed', 'the new alignment state is stored');
select is((select offset_ms from hr_samples_ref), 5000::bigint, 'the heart-rate offset is replaced');
select is((select count(*) from loose_shots), 1::bigint, 'warm-up shots are replaced, not added');

select is(tap(u(3), format($$select replace_training_data(%L, %L::jsonb)$$, (select id from tid), payload(99, 2, 'null'::jsonb))), 1::bigint,
  'the linked coach may replace it too');
select is((select count(*) from hr_samples_ref), 0::bigint, 'without heart rate the reference is removed');
select is(tap(u(2), format($$select replace_training_data(%L, %L::jsonb)$$, (select id from tid), payload(1, 1, 'null'::jsonb))), -1::bigint,
  'another shooter cannot');

select * from finish();
rollback;
