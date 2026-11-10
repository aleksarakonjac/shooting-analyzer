begin;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000f1', 'new@example.test',
        '{"display_name":"Mika","role":"admin","status":"active"}');

select is((select count(*)::int from profiles where id = '00000000-0000-0000-0000-0000000000f1'), 1,
  'signup creates a profile');
select is((select status::text from profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'pending',
  'new profile is pending');
select is((select role::text from profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'shooter',
  'role from user metadata is ignored');
select is((select display_name from profiles where id = '00000000-0000-0000-0000-0000000000f1'), 'Mika',
  'display name is taken from metadata');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f2', 'plain@example.test');
select is((select display_name from profiles where id = '00000000-0000-0000-0000-0000000000f2'), 'plain@example.test',
  'display name falls back to the email');

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000f3', 'coach@example.test', '{"requested_role":"coach"}'),
       ('00000000-0000-0000-0000-0000000000f4', 'evil@example.test', '{"requested_role":"admin"}');
select is((select requested_role::text from profiles where id = '00000000-0000-0000-0000-0000000000f3'), 'coach',
  'a coach request is recorded');
select is((select requested_role::text from profiles where id = '00000000-0000-0000-0000-0000000000f4'), 'shooter',
  'an unknown requested role falls back to shooter');
select is((select role::text || '/' || status::text from profiles where id = '00000000-0000-0000-0000-0000000000f3'), 'shooter/pending',
  'a coach request grants nothing until approved');

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000f5', 'g@example.test', '{"full_name":"Petar Petrovic"}');
select is((select display_name from profiles where id = '00000000-0000-0000-0000-0000000000f5'), 'Petar Petrovic',
  'a Google name is used when no display name is given');

select * from finish();
rollback;
