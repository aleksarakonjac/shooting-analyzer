begin;
select plan(8);

-- 1: Google user, not onboarded. 2: e-mail signup that already chose. 3: active user.
insert into auth.users (id, email, raw_user_meta_data) values
  (u(1), 'g@example.test', '{"full_name":"Gus Google"}'),
  (u(2), 'e@example.test', '{"display_name":"Ema","requested_role":"coach"}');
insert into auth.users (id, email) values (u(3), 'a@example.test');
update profiles set status = 'active', onboarded_at = now() where id = u(3);

select is((select onboarded_at is null from profiles where id = u(1)), true, 'a Google signup is not onboarded');
select is((select onboarded_at is not null from profiles where id = u(2)), true, 'an e-mail signup that chose is onboarded');

select is(tap(u(1), $$select complete_onboarding('  Gustav  ', 'coach')$$), 1::bigint, 'onboarding runs');
select is((select display_name || '/' || requested_role::text from profiles where id = u(1)), 'Gustav/coach', 'name and requested role saved');
select is((select role::text || '/' || status::text from profiles where id = u(1)), 'shooter/pending', 'onboarding grants nothing');

select is((select admin_notified_at is not null from profiles where id = u(1)), true, 'the admin is marked notified once');
select is(tap(u(1), $$select complete_onboarding('Other', 'shooter')$$), 1::bigint, 'a second call does not fail');
select is((select display_name from profiles where id = u(1)), 'Gustav', 'a second call changes nothing');

select * from finish();
rollback;
