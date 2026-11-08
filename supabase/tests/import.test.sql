begin;
select plan(18);

-- 1 S1 shooter, 2 S2 shooter, 3 C1 coach linked to S1 only
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 3) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active'), (u(3), 'C1', 'coach', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into links (shooter_id, coach_id, requested_by, status) values (u(1), u(3), u(1), 'active');

create function payload_for(shooter uuid, align text default 'proposed') returns jsonb language sql as $$
  select jsonb_build_object(
    'training', jsonb_build_object('shooter_id', shooter, 'discipline', 'air_rifle', 'trained_on', '2026-10-21', 'name', '21.10. Vazdušna puška'),
    'match', jsonb_build_object('label', '', 'align_state', align, 'selection', '{"kind":"last","n":3}'::jsonb,
      'series', jsonb_build_array(
        jsonb_build_object('idx', 1, 'total', 30, 'total_decimal', 31.7, 'mpi_x', -0.5, 'mpi_y', 0.2, 'group_mm', 8.0,
          'shots', jsonb_build_array(
            jsonb_build_object('idx', 1, 'value', 10.6, 'inner', true, 't_ms', 1792596598645, 'scatt_shot_id', 11),
            jsonb_build_object('idx', 2, 'value', 10.5, 'inner', false, 't_ms', 1792596610000, 'scatt_shot_id', 12))),
        jsonb_build_object('idx', 2, 'total', 10, 'total_decimal', 10.6,
          'shots', jsonb_build_array(jsonb_build_object('idx', 1, 'value', 10.6, 'scatt_shot_id', 13))))),
    'loose_shots', jsonb_build_array(
      jsonb_build_object('kind', 'warmup', 't_ms', 1792596500000, 'scatt_shot_id', 1),
      jsonb_build_object('kind', 'attempt', 't_ms', 1792596550000, 'scatt_shot_id', 2)),
    'hr_offset_ms', 1500, 'hr_avg_bpm', 92);
$$;

select is(tap(u(1), format($$select save_training(%L::jsonb)$$, payload_for(u(1)))), 1::bigint, 'shooter saves a training');
select is((select count(*)::int from matches), 1, 'one match');
select is((select align_state::text from matches), 'proposed', 'unconfirmed match is proposed');
select is((select count(*)::int from series), 2, 'two series');
select is((select count(*)::int from shots where scatt_shot_id is not null), 3, 'three shots carry a scatt id');
select is((select count(*)::int from loose_shots), 2, 'two loose shots');
select is((select offset_ms from hr_samples_ref), 1500::bigint, 'heart-rate offset stored');
select is((select avg_bpm from hr_samples_ref), 92, 'average heart rate over the shots is stored');
select is((select created_by from trainings), u(1), 'created_by is the caller');

select is(tap(u(3), format($$select save_training(%L::jsonb)$$, payload_for(u(1), 'confirmed'))), 1::bigint, 'coach saves for a linked shooter');
select is((select count(*)::int from trainings where created_by = u(3) and shooter_id = u(1)), 1, 'coach is created_by, shooter is owner');
select is((select count(*)::int from matches where align_state = 'confirmed'), 1, 'confirmed match stored as confirmed');

select is(tap(u(3), format($$select save_training(%L::jsonb)$$, payload_for(u(2)))), -1::bigint, 'coach cannot save for an unlinked shooter');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, payload_for(u(1), 'bogus'))), -1::bigint, 'bad payload fails');
select is((select count(*)::int from trainings), 2, 'failed save left nothing behind');

-- one unique file per training
insert into source_files (training_id, kind, storage_path, sha256, bytes)
  select id, 'scatt', id || '/abc', 'abc', 10 from trainings limit 1;
select throws_ok(
  $$insert into source_files (training_id, kind, storage_path, sha256, bytes)
    select training_id, 'scatt', storage_path || 'x', 'abc', 10 from source_files limit 1$$,
  '23505', null, 'same file twice in one training is rejected');
select lives_ok(
  $$insert into source_files (training_id, kind, storage_path, sha256, bytes)
    select id, 'scatt', id || '/abc', 'abc', 10 from trainings where id not in (select training_id from source_files) limit 1$$,
  'the same file in another training is fine');
select is(tap(u(1), 'select 1 where save_training(null) is null'), -1::bigint, 'null payload is rejected');

select * from finish();
rollback;
