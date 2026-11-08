begin;
select plan(92);

-- users: 1 S1, 2 S2, 3 C1, 4 C2, 5 C3 (pending link), 6 C4 (ended link), 7 A, 8 P pending, 9 D disabled
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 9) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active'),
  (u(3), 'C1', 'coach', 'active'), (u(4), 'C2', 'coach', 'active'),
  (u(5), 'C3', 'coach', 'active'), (u(6), 'C4', 'coach', 'active'),
  (u(7), 'A', 'admin', 'active'),
  (u(8), 'P', 'shooter', 'pending'), (u(9), 'D', 'shooter', 'disabled')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into links (shooter_id, coach_id, requested_by, status) values
  (u(1), u(3), u(1), 'active'), (u(1), u(4), u(4), 'active'),
  (u(1), u(5), u(1), 'pending'), (u(1), u(6), u(1), 'ended');
-- trainings: T1 (S1), T2 (S2), T3 (S1 by C1), T4 (P), T5 (D)
insert into trainings (id, shooter_id, created_by, discipline, trained_on) values
  (u(101), u(1), u(1), 'air_rifle', '2026-11-01'), (u(102), u(2), u(2), 'air_rifle', '2026-11-01'),
  (u(103), u(1), u(3), 'air_rifle', '2026-11-02'), (u(104), u(8), u(8), 'air_rifle', '2026-11-01'),
  (u(105), u(9), u(9), 'air_rifle', '2026-11-01');
insert into matches (id, training_id) values (u(201), u(101)), (u(202), u(102));
insert into series (id, match_id, idx) values (u(301), u(201), 1), (u(302), u(202), 1);
insert into shots (id, series_id, idx, value) values (u(401), u(301), 1, 10.4), (u(402), u(302), 1, 9.9);
insert into source_files (training_id, kind, storage_path, sha256, bytes) values
  (u(101), 'scatt', u(101) || '/a.scatt-expert', 'x', 1), (u(102), 'scatt', u(102) || '/b.scatt-expert', 'x', 1);
insert into storage.buckets values ('other', 'other', false);
insert into storage.objects (bucket_id, name) values
  ('source-files', u(101) || '/a.scatt-expert'), ('source-files', u(102) || '/b.scatt-expert');

-- Read matrix: rows visible per user per table.
select is(tap(m.uid, 'select 1 from ' || t.tbl), e.n::bigint, m.who || ' sees ' || e.n || ' in ' || t.tbl)
from (values
  ('S1', u(1), array[2,1,1,1,1,1]), ('S2', u(2), array[1,1,1,1,1,1]),
  ('C1', u(3), array[2,1,1,1,1,1]), ('C2', u(4), array[2,1,1,1,1,1]),
  ('C3 pending link', u(5), array[0,0,0,0,0,0]), ('C4 ended link', u(6), array[0,0,0,0,0,0]),
  ('P pending', u(8), array[0,0,0,0,0,0]), ('D disabled', u(9), array[0,0,0,0,0,0]),
  ('A admin', u(7), array[5,2,2,2,2,2])
) as m(who, uid, expect)
cross join lateral unnest(array['trainings','matches','series','shots','source_files','storage.objects'])
  with ordinality as t(tbl, i)
cross join lateral (select m.expect[t.i] as n) e;

-- Writes
select is(tap(u(3), format($$insert into trainings (shooter_id, created_by, discipline, trained_on) values (%L, %L, 'air_rifle', '2026-11-03')$$, u(1), u(3))), 1::bigint, 'coach inserts training for linked shooter');
select is(tap(u(3), format($$insert into trainings (shooter_id, created_by, discipline, trained_on) values (%L, %L, 'air_rifle', '2026-11-03')$$, u(2), u(3))), -1::bigint, 'coach cannot insert for unlinked shooter');
select is(tap(u(5), format($$insert into trainings (shooter_id, created_by, discipline, trained_on) values (%L, %L, 'air_rifle', '2026-11-03')$$, u(1), u(5))), -1::bigint, 'coach with pending link cannot insert');
select is(tap(u(8), format($$insert into trainings (shooter_id, created_by, discipline, trained_on) values (%L, %L, 'air_rifle', '2026-11-03')$$, u(8), u(8))), -1::bigint, 'pending profile cannot insert');
select is(tap(u(3), format($$update trainings set name = 'x' where id = %L$$, u(101))), 1::bigint, 'coach edits linked shooter training');
select is(tap(u(3), format($$update trainings set deleted_at = now() where id = %L$$, u(101))), 1::bigint, 'coach soft-deletes linked shooter training');
select is(tap(u(1), format($$update trainings set deleted_at = now() where id = %L$$, u(103))), 1::bigint, 'shooter soft-deletes coach-created training');
select is(tap(u(3), format($$delete from trainings where id = %L$$, u(101))), -1::bigint, 'no client hard delete of trainings');
select is(tap(u(3), format($$update trainings set shooter_id = %L where id = %L$$, u(2), u(101))), -1::bigint, 'coach cannot reassign training to another shooter');
select is(tap(u(1), format($$update profiles set role = 'admin' where id = %L$$, u(1))), -1::bigint, 'user cannot promote own role');
select is(tap(u(1), format($$update profiles set status = 'active' where id = %L$$, u(8))), -1::bigint, 'user cannot change status');
select is(tap(u(1), format($$insert into audit_log (action, table_name) values ('x','y')$$)), -1::bigint, 'client cannot write audit_log');
select is(tap(u(1), format($$insert into links (shooter_id, coach_id, requested_by) values (%L, %L, %L)$$, u(1), u(7), u(7))), -1::bigint, 'link request must be made by a party');

-- Admin approval function
select is(tap(u(7), format($$select admin_set_profile(%L, 'shooter', 'active')$$, u(8))), 1::bigint, 'admin approves a profile');
select is(tap(u(1), format($$select admin_set_profile(%L, 'admin', 'active')$$, u(1))), -1::bigint, 'non-admin cannot call admin_set_profile');

-- Own profile stays readable for waiting page (ruling)
select is(tap(u(9), 'select 1 from profiles where id = ' || quote_literal(u(9))), 1::bigint, 'disabled user can read own profile row only');
select is(tap(u(9), 'select 1 from profiles'), 1::bigint, 'disabled user sees no other profiles');

-- Storage
select is(tap(u(3), format($$insert into storage.objects (bucket_id, name) values ('source-files', %L)$$, u(101) || '/c.csv')), 1::bigint, 'coach uploads to linked shooter training');
select is(tap(u(3), format($$insert into storage.objects (bucket_id, name) values ('source-files', %L)$$, u(102) || '/c.csv')), -1::bigint, 'coach cannot upload to unlinked training');
select is(tap(u(3), format($$insert into storage.objects (bucket_id, name) values ('other', %L)$$, u(101) || '/c.csv')), -1::bigint, 'no access to other buckets');

-- Audit visibility
select cmp_ok(tap(u(1), 'select 1 from audit_log'), '>', 0::bigint, 'shooter sees own audit history');
select is(tap(u(1), format($$select 1 from audit_log where shooter_id = %L$$, u(2))), 0::bigint, 'shooter sees nothing of another shooter');
select is(tap(u(3), format($$select 1 from audit_log where shooter_id = %L$$, u(2))), 0::bigint, 'coach sees nothing of unlinked shooter');
select cmp_ok(tap(u(3), format($$select 1 from audit_log where shooter_id = %L$$, u(1))), '>', 0::bigint, 'coach sees linked shooter history');
select is(tap(u(5), 'select 1 from audit_log'), 0::bigint, 'pending-link coach sees no audit');
select cmp_ok(tap(u(7), format($$select 1 from audit_log where shooter_id = %L$$, u(2))), '>', 0::bigint, 'admin sees all audit');

-- Helpers
select is(tap(u(3), format($$select 1 where can_see_training(%L)$$, u(101))), 1::bigint, 'can_see_training: active coach');
select is(tap(u(5), format($$select 1 where can_see_training(%L)$$, u(101))), 0::bigint, 'can_see_training: pending-link coach');
select is(tap(u(3), format($$select 1 where has_context_share(%L, %L)$$, u(1), u(101))), 0::bigint, 'context hidden from coach by default');
insert into shares (shooter_id, scope, from_date, to_date) values (u(1), 'period', '2026-10-30', '2026-11-01');
select is(tap(u(3), format($$select 1 where has_context_share(%L, %L)$$, u(1), u(101))), 1::bigint, 'period share reveals context');
select is(tap(u(3), format($$select 1 where has_context_share(%L, %L)$$, u(1), u(103))), 0::bigint, 'period share does not cover other date');
select is(tap(u(1), format($$select 1 where has_context_share(%L, %L)$$, u(1), u(103))), 1::bigint, 'shooter always has context');

-- Link state machine
select is(tap(u(6), format($$update links set status = 'active' where coach_id = %L$$, u(6))), -1::bigint, 'ended link cannot be reactivated');
select is(tap(u(1), format($$update links set status = 'active' where coach_id = %L$$, u(5))), -1::bigint, 'requester cannot confirm own request');
select is(tap(u(5), format($$update links set status = 'active' where coach_id = %L$$, u(5))), 1::bigint, 'other side confirms a pending request');
select is(tap(u(1), $$select request_link('u6@example.test')$$), 1::bigint, 're-link after ended is a new request');
select is((select count(*)::int from links where shooter_id = u(1) and coach_id = u(6) and status = 'pending'), 1, 're-link created a pending row');
select is(tap(u(1), format($$insert into trainings (id, shooter_id, created_by, discipline, trained_on) values (%L, %L, %L, 'air_rifle', '2026-11-04')$$, u(999), u(1), u(1))), -1::bigint, 'client cannot choose training id');

select * from finish();
rollback;
