begin;
select plan(4);

insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from unnest(array[1,2]) n;
insert into profiles (id, display_name, role, status) values (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;

select is((select pip_top from profiles where id = u(1)), '{}'::jsonb, 'no setting means the defaults');
select is(tap(u(1), format($$update profiles set pip_top = '{"air_rifle": 10.3}' where id = %L$$, u(1))), 1::bigint,
  'a user sets the filled-pip threshold on their own profile');
select is(tap(u(2), format($$update profiles set pip_top = '{"air_rifle": 10.0}' where id = %L$$, u(1))), 0::bigint,
  'nobody else can change it');
select is(tap(u(1), format($$update profiles set pip_top = '[1]' where id = %L$$, u(1))), -1::bigint,
  'the setting must be an object keyed by discipline');

select * from finish();
rollback;
