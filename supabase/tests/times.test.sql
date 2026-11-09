begin;
select plan(5);

insert into auth.users (id, email) values (u(1), 'u1@example.test');
insert into profiles (id, display_name, role, status) values (u(1), 'S1', 'shooter', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;

create function times_payload(st text, en text) returns jsonb language sql as $$
  select jsonb_build_object('training', jsonb_build_object('shooter_id', u(1), 'discipline', 'air_rifle',
    'trained_on', '2026-11-09', 'name', 'x', 'started_at', st, 'ended_at', en), 'match', null, 'loose_shots', '[]'::jsonb);
$$;

select is(tap(u(1), format($$select save_training(%L::jsonb)$$, times_payload('2026-11-09T16:00:00Z', '2026-11-09T17:30:00Z'))), 1::bigint,
  'a training saves with a start and an end time');
select is((select started_at from trainings), '2026-11-09T16:00:00Z'::timestamptz, 'start time stored');
select is((select ended_at from trainings), '2026-11-09T17:30:00Z'::timestamptz, 'end time stored');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, times_payload(null, null))), 1::bigint, 'times are optional');
select is(tap(u(1), format($$select save_training(%L::jsonb)$$, times_payload('2026-11-09T18:00:00Z', '2026-11-09T17:00:00Z'))), -1::bigint,
  'an end before the start is rejected');

select * from finish();
rollback;
