begin;
select plan(14);

-- 1 S1 shooter (Belgrade), 2 S2 shooter, 3 C1 coach linked to S1, 5 C3 coach not linked
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from unnest(array[1,2,3,5]) n;
insert into profiles (id, display_name, role, status, tz) values
  (u(1), 'S1', 'shooter', 'active', 'Europe/Belgrade'), (u(2), 'S2', 'shooter', 'active', 'Europe/Belgrade'),
  (u(3), 'C1', 'coach', 'active', 'Europe/Belgrade'), (u(5), 'C3', 'coach', 'active', 'Europe/Belgrade')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status, tz = excluded.tz;
insert into links (shooter_id, coach_id, requested_by, status) values (u(1), u(3), u(1), 'active');

create function session_payload(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('training', jsonb_build_object('shooter_id', u(1), 'discipline', 'air_rifle', 'trained_on', '2026-11-09', 'name', 'x') || extra,
    'match', null, 'loose_shots', '[]'::jsonb, 'hr_offset_ms', 0, 'hr_zone', 'Asia/Tokyo');
$$;

-- events
select is(tap(u(1), format($$insert into events (id, shooter_id, kind, name, place, starts_on, ends_on) values (%L, %L, 'takmicenje', 'Grand Prix', 'Beograd', '2026-11-13', '2026-11-14')$$, u(701), u(1))), 1::bigint,
  'the shooter creates an event');
select is(tap(u(3), 'select 1 from events'), 1::bigint, 'the linked coach sees it');
select is(tap(u(5), 'select 1 from events'), 0::bigint, 'an unlinked coach does not');
select is(tap(u(2), format($$insert into events (shooter_id, kind, name) values (%L, 'takmicenje', 'tudje')$$, u(1))), -1::bigint,
  'another shooter cannot create an event for S1');

-- sessions: kind, stage, zone, event
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, session_payload(jsonb_build_object('kind', 'takmicenje', 'stage', 'kvalifikacije', 'tz', 'Asia/Tokyo', 'event_id', u(701))))), 1::bigint,
  'a qualification session of the event saves');
select is((select kind || '/' || stage || '/' || tz from trainings where event_id = u(701)), 'takmicenje/kvalifikacije/Asia/Tokyo', 'type, part and venue zone are stored');
select is((select zone from hr_samples_ref r join trainings t on t.id = r.training_id where t.event_id = u(701)), 'Asia/Tokyo', 'the heart-rate clock zone is stored');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, session_payload('{}'::jsonb))), 1::bigint, 'a plain session saves');
select is((select kind || '/' || stage || '/' || tz from trainings where event_id is null), 'trening/slobodno/Europe/Belgrade',
  'defaults: training, free, the owner''s zone');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, session_payload('{"tz": "Mars/Olympus"}'::jsonb))), -1::bigint, 'an unknown venue zone is refused');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, session_payload('{"stage": "polufinale"}'::jsonb))), -1::bigint, 'an unknown part is refused');

insert into events (id, shooter_id, kind, name) values (u(702), u(2), 'kontrolni', 'S2 event');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, session_payload(jsonb_build_object('event_id', u(702))))), -1::bigint,
  'a session cannot join another shooter''s event');

-- finals only on a finale session that is not in the trash
select is(tap(u(1), format($$select save_final(%L::jsonb)$$, jsonb_build_object('training_id', (select id from trainings where event_id = u(701)), 'shots', '[]'::jsonb))), -1::bigint,
  'no final on a qualification session');
update trainings set stage = 'finale' where event_id = u(701);
select is(tap(u(1), format($$select save_final(%L::jsonb)$$, jsonb_build_object('training_id', (select id from trainings where event_id = u(701)), 'shots', '[]'::jsonb))), 1::bigint,
  'a final saves on a finale session');

select * from finish();
rollback;
