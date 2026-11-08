begin;
select plan(21);

select has_table('public', t, t || ' exists') from unnest(array[
  'profiles','links','trainings','matches','series','shots',
  'loose_shots','source_files','hr_samples_ref','shares','audit_log']) as t;

select col_is_null('public', 'shots', 'trace_ref', 'shots.trace_ref is nullable');
select col_is_null('public', 'shots', 'scatt_metrics', 'shots.scatt_metrics is nullable');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'a@example.test');
insert into profiles (id, display_name, role, status)
  values ('00000000-0000-0000-0000-0000000000a1', 'Test', 'shooter', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;

select throws_ok(
  $$insert into trainings (shooter_id, created_by, discipline, trained_on)
    values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','air_rifle_80','2026-11-01')$$,
  '23514', null, 'discipline check rejects air_rifle_80');
select lives_ok(
  $$insert into trainings (id, shooter_id, created_by, discipline, trained_on)
    values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','air_rifle','2026-11-01')$$,
  'discipline check accepts air_rifle');

select is((select count(*)::int from audit_log where table_name='trainings' and action='insert'), 1,
  'insert writes one audit row');

update trainings set deleted_at = now() where id = '00000000-0000-0000-0000-0000000000b1';
select is((select count(*)::int from audit_log where table_name='trainings' and action='soft_delete'), 1,
  'soft delete writes one audit row');

insert into trainings (id, shooter_id, created_by, discipline, trained_on, deleted_at) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','air_rifle','2026-10-01', now() - interval '31 days'),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','air_rifle','2026-10-01', now() - interval '29 days');
select purge_trash();
select is((select count(*)::int from trainings where id='00000000-0000-0000-0000-0000000000c1'), 0, 'purge removes 31-day-old');
select is((select count(*)::int from trainings where id='00000000-0000-0000-0000-0000000000c2'), 1, 'purge keeps 29-day-old');
select is((select count(*)::int from trainings where id='00000000-0000-0000-0000-0000000000b1'), 1, 'purge keeps fresh soft delete');

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 0,
  'every public table has RLS enabled (deny by default)');

select * from finish();
rollback;
