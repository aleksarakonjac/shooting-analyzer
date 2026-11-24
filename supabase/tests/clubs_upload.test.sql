begin;
select plan(64);

-- Runs q as the user and returns its single value as text ('denied' when it raised).
create function val(uid uuid, q text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  begin
    perform set_config('role', 'authenticated', true);
    execute q into v;
  exception when others then
    v := 'denied';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;

-- 1 S1, 2 S2, 3 S3 shooters; 4 C coach linked to S1 and S3; 5 A admin; 6 P pending; 7 D disabled; 8 S4; 9 C2 coach
insert into auth.users (id, email) select u(n), 'u' || n || '@example.test' from generate_series(1, 9) n;
insert into profiles (id, display_name, role, status) values
  (u(1), 'S1', 'shooter', 'active'), (u(2), 'S2', 'shooter', 'active'), (u(3), 'S3', 'shooter', 'active'),
  (u(4), 'C', 'coach', 'active'), (u(5), 'A', 'admin', 'active'), (u(6), 'P', 'shooter', 'pending'),
  (u(7), 'D', 'shooter', 'disabled'), (u(8), 'S4', 'shooter', 'active'), (u(9), 'C2', 'coach', 'active')
  on conflict (id) do update set display_name = excluded.display_name, role = excluded.role, status = excluded.status;
insert into links (shooter_id, coach_id, requested_by, status) values
  (u(1), u(4), u(1), 'active'), (u(3), u(4), u(3), 'active');

-- names
select is(club_key('  ЧАЧАК '), club_key('cacak'), 'Cyrillic and plain Latin are one name');
select is(club_key('Čačak'), club_key('cacak'), 'diacritics do not matter');
select is(club_key('Đorđe  Љубић'), 'dorde ljubic', 'every letter is folded and spaces collapse');

-- choosing
select isnt(val(u(1), $$select choose_club('Čačak')$$), 'denied', 'a shooter makes a club');
select is(val(u(2), $$select choose_club('cacak')$$), (select club_id::text from profiles where id = u(1)), 'the same name is the same club');
select is((select count(*)::int from clubs), 1, 'and no second club is made');
select is((select name from clubs), 'Čačak', 'under its first spelling');
select is(val(u(6), $$select choose_club('Čačak')$$), 'denied', 'a pending account cannot choose');
select is(val(u(7), $$select choose_club('Čačak')$$), 'denied', 'a disabled account cannot choose');
select is(val(u(1), $$select choose_club('x')$$), 'denied', 'a one-letter name is refused');
select is(tap(u(1), format($$update profiles set club_id = null where id = %L$$, u(2))), -1::bigint, 'nobody sets another club');
select is(tap(u(1), format($$update profiles set club_id = null where id = %L$$, u(1))), -1::bigint, 'not even their own directly');
select is(tap(u(5), format($$update profiles set club_id = null where id = %L$$, u(2))), -1::bigint, 'nor does an admin');
select isnt(val(u(4), $$select choose_club('Čačak')$$), 'denied', 'a coach joins too');

-- the link
select ok(val(u(2), $$select token from my_club()$$) ~ '^ub_[0-9a-f]{64}$', 'a member reads the token');
select is(val(u(3), $$select token from my_club()$$), null, 'someone outside gets nothing');
select is(val(u(1), $$select can_manage from my_club()$$), 'true', 'the maker manages');
select is(val(u(2), $$select can_manage from my_club()$$), 'false', 'a member does not');
select is(tap(u(1), 'select * from club_links'), -1::bigint, 'links are not readable directly');
select is(tap(u(1), 'select * from inbox_uploads'), -1::bigint, 'started uploads are not readable');
select is(tap(u(1), $$select club_shooters('x')$$), -1::bigint, 'the list by token is for the server only');
select is(tap(u(3), 'select id, name from clubs'), 1::bigint, 'an active account sees the club names');
select is(tap(u(6), 'select id, name from clubs'), 0::bigint, 'a pending one does not');
select is(tap(u(1), $$insert into clubs (name, name_key) values ('X1', 'x1')$$), -1::bigint, 'clubs are made through choose_club only');

select is(tap(u(2), format($$select rename_club(%L, 'Novi')$$, (select id from clubs))), -1::bigint, 'a member cannot rename');
select is(tap(u(2), format($$select replace_club_link(%L)$$, (select id from clubs))), -1::bigint, 'nor replace the link');
create temp table old_token as select token from club_links;
select is(tap(u(1), format($$select replace_club_link(%L)$$, (select id from clubs))), 1::bigint, 'the maker replaces the link');
select isnt((select token from club_links), (select token from old_token), 'the token is new');
select is(club_shooters((select token from old_token)), null, 'the old one no longer works');
select is(tap(u(5), format($$select rename_club(%L, 'Čačak 1')$$, (select id from clubs))), 1::bigint, 'an admin renames');

-- the list
select is((select jsonb_agg(s ->> 'display_name' order by s ->> 'display_name')
  from jsonb_array_elements(club_shooters((select token from club_links)) -> 'shooters') s), '["S1", "S2"]'::jsonb,
  'only the active shooters of the club are listed');
update profiles set status = 'disabled' where id = u(2);
select is(jsonb_array_length(club_shooters((select token from club_links)) -> 'shooters'), 1, 'a disabled one is not');
update profiles set status = 'active' where id = u(2);
select is(val(u(1), $$select string_agg(display_name, ',') from club_mates()$$), 'S2', 'mates are the other active shooters');

-- files
insert into inbox_files (id, user_id, kind, storage_path, file_name, bytes, sha256) values
  (u(201), u(1), 'sius_prnx', u(1) || '/a', 'a.prnx', 10, repeat('a', 64)),
  (u(202), u(2), 'scatt', u(2) || '/b', 'b.scatt', 10, repeat('b', 64));
insert into storage.buckets (id, name, public) values ('inbox', 'inbox', false) on conflict do nothing;
insert into storage.objects (bucket_id, name) values ('inbox', u(1) || '/a'), ('inbox', u(2) || '/b');
select is(tap(u(4), 'select * from inbox_files'), 1::bigint, 'a coach sees the files of a linked shooter only');
select is(tap(u(2), format($$select * from inbox_files where user_id = %L$$, u(1))), 0::bigint, 'a club mate sees nothing of theirs');
select is(tap(u(4), $$select * from storage.objects where bucket_id = 'inbox'$$), 1::bigint, 'storage follows the row for a coach');
select is(tap(u(2), $$select * from storage.objects where bucket_id = 'inbox'$$), 1::bigint, 'and for a shooter');
select throws_ok(format($$insert into inbox_files (user_id, kind, storage_path, file_name, bytes, sha256)
  values (%L, 'scatt', 'z', 'z', 1, repeat('a', 64))$$, u(1)), '23505', null, 'the same content is kept once per shooter');

select is(tap(u(2), format($$select pass_inbox_file(%L, %L)$$, u(201), u(2))), -1::bigint, 'a mate cannot take a file');
select is(tap(u(1), format($$select pass_inbox_file(%L, %L)$$, u(201), u(8))), -1::bigint, 'a file cannot go to someone outside the club');
select is(tap(u(9), format($$select pass_inbox_file(%L, %L)$$, u(201), u(2))), -1::bigint, 'a coach who is not theirs cannot pass it');
select is(tap(u(1), format($$select pass_inbox_file(%L, %L)$$, u(201), u(2))), 1::bigint, 'the owner passes it to a club mate');
select is(tap(u(1), 'select * from inbox_files'), 0::bigint, 'and no longer sees it');
select is(tap(u(2), $$select * from storage.objects where bucket_id = 'inbox'$$), 2::bigint, 'the new owner reads the object');
update inbox_files set user_id = u(1) where id = u(201);
select is(tap(u(4), format($$select pass_inbox_file(%L, %L)$$, u(201), u(3))), 1::bigint, 'a coach passes between their shooters');

-- room for uploads, under one lock per shooter
select ok(not has_function_privilege('authenticated', 'reserve_inbox_upload(uuid, uuid, uuid, uuid, text, jsonb)', 'execute'), 'only the server reserves');
select ok(not has_function_privilege('authenticated', 'accept_inbox_file(uuid, uuid, text, text, text, int, text, jsonb)', 'execute'), 'and accepts');
select ok(reserve_inbox_upload(u(301), u(8), (select id from clubs), null, 'x', null), 'there is room');
insert into inbox_uploads (user_id, club_id, storage_path, file_name)
  select u(8), (select id from clubs), 'incoming/c' || n, 'x' from generate_series(1, 49) n;
select ok(not reserve_inbox_upload(u(302), u(8), (select id from clubs), null, 'x', null), 'fifty started by the club are the limit');
select ok(reserve_inbox_upload(u(303), u(8), null, u(8), 'x', null), 'which does not block the shooter''s own');
update inbox_uploads set created_at = now() - interval '3 hours' where user_id = u(8);
select ok(reserve_inbox_upload(u(304), u(8), (select id from clubs), null, 'x', null), 'old ones no longer count');
select is(accept_inbox_file(u(401), u(8), 'scatt', 'q/1', 'x', 1, repeat('c', 64), null), 'ok', 'a file is accepted');
select is(accept_inbox_file(u(402), u(8), 'scatt', 'q/2', 'x', 1, repeat('c', 64), null), 'duplicate', 'the same content is not');
insert into inbox_files (user_id, kind, storage_path, file_name, bytes) select u(8), 'scatt', 'q/f' || n, 'x', 1 from generate_series(1, 49) n;
select is(accept_inbox_file(u(403), u(8), 'scatt', 'q/3', 'x', 1, repeat('d', 64), null), 'full', 'nor a fifty-first');

-- one link can start 300 uploads a day, claimed or not; a new link starts afresh
delete from inbox_files where user_id = u(8);
delete from inbox_uploads;
update club_links set created_at = now() - interval '3 days';
insert into inbox_uploads (user_id, club_id, storage_path, file_name, created_at, claimed_at)
  select u(8), (select id from clubs), 'incoming/r' || n, 'x', now() - interval '5 hours', now() from generate_series(1, 300) n;
select ok(not reserve_inbox_upload(u(501), u(8), (select id from clubs), null, 'x', null), 'the 301st in a day is refused');
select ok(reserve_inbox_upload(u(502), u(8), null, u(8), 'x', null), 'but not the shooter''s own');
update club_links set created_at = now() - interval '1 hour';
select ok(reserve_inbox_upload(u(503), u(8), (select id from clubs), null, 'x', null), 'a replaced link starts afresh');
update club_links set created_at = now() - interval '3 days';
update inbox_uploads set created_at = now() - interval '25 hours';
select ok(reserve_inbox_upload(u(504), u(8), (select id from clubs), null, 'x', null), 'and a day later there is room again');

-- leaving and empty clubs
select is(val(u(1), $$select choose_club('  ')$$), null, 'a blank name leaves the club');
select is(tap(u(1), format($$select replace_club_link(%L)$$, (select id from clubs))), -1::bigint, 'a maker who left cannot manage');
update profiles set club_id = null;
select purge_clubs();
update clubs set empty_since = now() - interval '6 days';
select purge_clubs();
select is((select count(*)::int from clubs), 1, 'a club empty for 6 days stays');
select isnt(val(u(8), $$select choose_club('čačak 1')$$), 'denied', 'and can be joined again');
update clubs set empty_since = now() - interval '8 days';
select purge_clubs();
select is((select count(*)::int from clubs where empty_since is null), 1, 'joined again: kept and unmarked');
update profiles set club_id = null;
update clubs set empty_since = now() - interval '8 days';
select purge_clubs();
select is((select count(*)::int from clubs) + (select count(*)::int from club_links), 0, 'empty for 8 days: gone with its link');

select * from finish();
rollback;
