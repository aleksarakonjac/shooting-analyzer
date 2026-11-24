-- Clubs and the club upload link (owner, 2026-11-24). A person writes their own club into their account; every club
-- has one secret link, opened on the range laptops without signing in, that lists the club's shooters and takes files
-- for them into the existing inbox. A club opens nobody's data: files stay with the shooter and their coach.

-- ---------- clubs ----------
-- One spelling per club: Serbian Cyrillic, diacritics, case and spaces do not make a different name. Both cases are
-- listed so the result does not depend on the database locale.
create function club_key(p_name text) returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(lower(translate(
    replace(replace(replace(replace(replace(replace(p_name, 'Љ', 'lj'), 'љ', 'lj'), 'Њ', 'nj'), 'њ', 'nj'), 'Џ', 'dz'), 'џ', 'dz'),
    'АБВГДЂЕЖЗИЈКЛМНОПРСТЋУФХЦЧШабвгдђежзијклмнопрстћуфхцчшČĆŠŽĐčćšžđ',
    'abvgddezzijklmnoprstcufhccsabvgddezzijklmnoprstcufhccsccszdccszd')), '\s+', ' ', 'g'))
$$;

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80 and name = btrim(name)),
  name_key text not null unique,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Set by the daily job when nobody is in the club; a week later the club is deleted.
  empty_since timestamptz
);
create index clubs_created_by on clubs (created_by);

-- The token is kept readable: the link is opened on many laptops. It only allows sending and reading the names.
create table club_links (
  club_id uuid primary key references clubs (id) on delete cascade,
  token text not null unique check (token ~ '^ub_[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table profiles add column club_id uuid references clubs (id) on delete restrict;
create index profiles_club on profiles (club_id) where club_id is not null;

alter table clubs enable row level security;
alter table club_links enable row level security;
revoke all on clubs, club_links from anon, authenticated;
grant select (id, name) on clubs to authenticated;
create policy clubs_select on clubs for select to authenticated using (is_active());

create function new_club_token() returns text language sql volatile set search_path = public as
$$ select 'ub_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

-- The caller's own club: an entered one by its name, or a new one; a blank name leaves.
create function choose_club(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  k text := club_key(nm);
  cid uuid;
begin
  if not is_active() then raise exception 'inactive account' using errcode = '42501'; end if;
  if nm = '' then
    update profiles set club_id = null where id = auth.uid();
    return null;
  end if;
  if char_length(k) < 2 or char_length(nm) > 80 then raise exception 'bad name' using errcode = '22023'; end if;
  loop
    -- The lock keeps the club from being deleted as empty before this person is in it.
    select id into cid from clubs where name_key = k for key share;
    exit when found;
    insert into clubs (name, name_key, created_by) values (nm, k, auth.uid())
    on conflict (name_key) do nothing returning id into cid;
    if cid is not null then
      insert into club_links (club_id, token) values (cid, new_club_token());
      exit;
    end if;
  end loop;
  update profiles set club_id = cid where id = auth.uid();
  return cid;
end $$;

create function can_manage_club(cid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select is_admin() or (is_active() and exists (
     select 1 from clubs c join profiles p on p.club_id = c.id
     where c.id = cid and c.created_by = auth.uid() and p.id = auth.uid())) $$;

create function my_club() returns table (id uuid, name text, token text, can_manage boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, l.token, can_manage_club(c.id)
  from profiles p join clubs c on c.id = p.club_id join club_links l on l.club_id = c.id
  where p.id = auth.uid() and is_active()
$$;

create function club_mates() returns table (id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.display_name
  from profiles me join profiles o on o.club_id = me.club_id
  where me.id = auth.uid() and is_active() and o.id <> me.id and o.role = 'shooter' and o.status = 'active'
  order by o.display_name
$$;

create function rename_club(cid uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not can_manage_club(cid) then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(club_key(nm)) < 2 or char_length(nm) > 80 then raise exception 'bad name' using errcode = '22023'; end if;
  update clubs set name = nm, name_key = club_key(nm) where id = cid;
end $$;

create function replace_club_link(cid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  t text := new_club_token();
begin
  if not can_manage_club(cid) then raise exception 'not allowed' using errcode = '42501'; end if;
  update club_links set token = t, created_at = now(), last_used_at = null where club_id = cid;
  return t;
end $$;

create function admin_clubs() returns table (id uuid, name text, members int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, (select count(*)::int from profiles p where p.club_id = c.id)
  from clubs c where is_admin() order by c.name
$$;

-- The upload page's list, for the server alone: null for a wrong token.
create function club_shooters(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  update club_links set last_used_at = now() where token = p_token returning club_id into cid;
  if cid is null then return null; end if;
  return (
    select jsonb_build_object('club_id', c.id, 'name', c.name, 'shooters', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name) order by p.display_name)
      from profiles p where p.club_id = c.id and p.role = 'shooter' and p.status = 'active'), '[]'::jsonb))
    from clubs c where c.id = cid);
end $$;

-- Daily: a club nobody is in is deleted with its link a week after it was first seen empty.
create function purge_clubs() returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
begin
  update clubs set empty_since = null
    where empty_since is not null and exists (select 1 from profiles p where p.club_id = clubs.id);
  update clubs set empty_since = now()
    where empty_since is null and not exists (select 1 from profiles p where p.club_id = clubs.id);
  for c in select id from clubs where empty_since <= now() - interval '7 days' loop
    begin
      delete from clubs where id = c.id and not exists (select 1 from profiles p where p.club_id = c.id);
      if found then n := n + 1; end if;
    exception when foreign_key_violation then
      null; -- someone joined at this very moment: the club stays
    end;
  end loop;
  return n;
end $$;

-- ---------- inbox ----------
alter table inbox_files drop constraint inbox_files_kind_check;
alter table inbox_files add constraint inbox_files_kind_check check (kind in ('scatt', 'tcx', 'sius_pdf', 'sius_prnx'));
-- What the sending page read from the file: for display and pairing only, never a result.
alter table inbox_files add column meta jsonb;
alter table inbox_files add column sha256 text check (sha256 ~ '^[0-9a-f]{64}$');
create unique index inbox_files_user_sha on inbox_files (user_id, sha256) where sha256 is not null;

-- Uploads that were started and not yet confirmed; server only. The browser writes to incoming/<id> with a token that
-- is good for 2 h; an accepted file moves to a path no token covers.
create table inbox_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  -- Who started it: a club link, or a signed-in person.
  club_id uuid references clubs (id) on delete cascade,
  started_by uuid references profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  meta jsonb,
  created_at timestamptz not null default now(),
  -- Confirmed or refused; the row stays until the daily job so that it counts towards the day's limit.
  claimed_at timestamptz,
  check ((club_id is null) <> (started_by is null))
);
create index inbox_uploads_user on inbox_uploads (user_id);
create index inbox_uploads_created on inbox_uploads (created_at);
create index inbox_uploads_club on inbox_uploads (club_id);
create index inbox_uploads_started_by on inbox_uploads (started_by);
alter table inbox_uploads enable row level security;
revoke all on inbox_uploads from anon, authenticated;

-- Both steps take the same lock per shooter, so parallel requests cannot pass the limit of 50 together.
create function lock_inbox(uid uuid) returns void language sql set search_path = public as
$$ select pg_advisory_xact_lock(hashtextextended('inbox:' || uid::text, 0)) $$;

-- Room for one more: waiting files, and what the same uploader started while its upload tokens are still good (2 h).
-- A club link that starts many uploads therefore does not block the shooter's own.
create function reserve_inbox_upload(p_id uuid, p_user uuid, p_club uuid, p_by uuid, p_name text, p_meta jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform lock_inbox(p_user);
  if (select count(*) from inbox_files where user_id = p_user)
     + (select count(*) from inbox_uploads where user_id = p_user and created_at > now() - interval '2 hours'
          and claimed_at is null and club_id is not distinct from p_club and started_by is not distinct from p_by) >= 50 then
    return false;
  end if;
  -- What one link or person may start in a day, whoever it is for: every start is a token that can write one file.
  perform pg_advisory_xact_lock(hashtextextended('uploader:' || coalesce(p_club, p_by)::text, 0));
  if (select count(*) from inbox_uploads u where u.club_id is not distinct from p_club and u.started_by is not distinct from p_by
        and u.created_at > greatest(now() - interval '24 hours',
          coalesce((select l.created_at from club_links l where l.club_id = p_club), '-infinity'))) >= 300 then
    return false;
  end if;
  insert into inbox_uploads (id, user_id, club_id, started_by, storage_path, file_name, meta)
  values (p_id, p_user, p_club, p_by, 'incoming/' || p_id, p_name, p_meta);
  return true;
end $$;

create function accept_inbox_file(p_id uuid, p_user uuid, p_kind text, p_path text, p_name text, p_bytes int, p_sha text, p_meta jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform lock_inbox(p_user);
  if exists (select 1 from inbox_files where user_id = p_user and sha256 = p_sha) then return 'duplicate'; end if;
  if (select count(*) from inbox_files where user_id = p_user) >= 50 then return 'full'; end if;
  insert into inbox_files (id, user_id, kind, storage_path, file_name, bytes, sha256, meta)
  values (p_id, p_user, p_kind, p_path, p_name, p_bytes, p_sha, p_meta);
  return 'ok';
end $$;

-- The shooter's coach sees and removes waiting files too. The object follows its row, so passing a file on also
-- moves who can read it (the folder in its path may name an earlier owner).
drop policy inbox_files_select on inbox_files;
drop policy inbox_files_delete on inbox_files;
create policy inbox_files_select on inbox_files for select to authenticated
  using ((user_id = auth.uid() and is_active()) or coach_of(user_id));
create policy inbox_files_delete on inbox_files for delete to authenticated
  using ((user_id = auth.uid() and is_active()) or coach_of(user_id));
drop policy inbox_objects_select on storage.objects;
drop policy inbox_objects_delete on storage.objects;
create policy inbox_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'inbox' and exists (select 1 from public.inbox_files f where f.storage_path = objects.name));
create policy inbox_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inbox' and exists (select 1 from public.inbox_files f where f.storage_path = objects.name));

-- A file that landed on the wrong name: its shooter gives it to a club mate, their coach also to another of their shooters.
create function pass_inbox_file(fid uuid, to_shooter uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  f inbox_files;
begin
  select * into f from inbox_files where id = fid for update;
  if not found or not ((f.user_id = auth.uid() and is_active()) or coach_of(f.user_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from profiles t where t.id = to_shooter and t.role = 'shooter' and t.status = 'active'
      and (coach_of(t.id) or t.club_id = (select club_id from profiles where id = f.user_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform lock_inbox(to_shooter);
  if (select count(*) from inbox_files where user_id = to_shooter) >= 50 then raise exception 'inbox full'; end if;
  update inbox_files set user_id = to_shooter where id = fid;
end $$;

-- ---------- who may run what ----------
revoke all on function club_key(text), new_club_token(), choose_club(text), can_manage_club(uuid), my_club(), club_mates(),
  rename_club(uuid, text), replace_club_link(uuid), admin_clubs(), club_shooters(text), purge_clubs(), pass_inbox_file(uuid, uuid),
  lock_inbox(uuid), reserve_inbox_upload(uuid, uuid, uuid, uuid, text, jsonb),
  accept_inbox_file(uuid, uuid, text, text, text, int, text, jsonb)
  from public, anon, authenticated;
grant execute on function choose_club(text), my_club(), club_mates(), rename_club(uuid, text), replace_club_link(uuid),
  admin_clubs(), pass_inbox_file(uuid, uuid) to authenticated;
grant execute on function club_shooters(text), purge_clubs(), reserve_inbox_upload(uuid, uuid, uuid, uuid, text, jsonb),
  accept_inbox_file(uuid, uuid, text, text, text, int, text, jsonb) to service_role;
-- This project does not grant service_role table privileges by default (see 0026).
grant select, update (claimed_at), delete on inbox_uploads to service_role;
