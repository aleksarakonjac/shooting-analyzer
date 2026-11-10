-- A first-time Google sign-in has not said what kind of account it wants, so it goes through an
-- onboarding screen first. onboarded_at marks that the request is complete; the e-mail form sets it
-- at signup because it already asks. Accounts that exist today count as done.
alter table profiles add column onboarded_at timestamptz;
update profiles set onboarded_at = created_at;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role, status, requested_role, onboarded_at)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                   nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                   nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                   new.email, ''),
          'shooter', 'pending',
          case when new.raw_user_meta_data ->> 'requested_role' = 'coach' then 'coach'::user_role else 'shooter'::user_role end,
          case when new.raw_user_meta_data ->> 'requested_role' is not null then now() end);
  return new;
end $$;

-- The signed-in, still-pending user finishes their own request: optional new name and the account type.
-- Role and status stay untouched. Returns true exactly once per account, so the caller mails the admin once.
create function complete_onboarding(p_name text, p_role user_role) returns boolean
language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_role not in ('shooter', 'coach') then raise exception 'bad role' using errcode = '22023'; end if;
  update profiles
     set requested_role = p_role,
         display_name = coalesce(nullif(btrim(p_name), ''), display_name),
         onboarded_at = now()
   where id = auth.uid() and status = 'pending' and onboarded_at is null;
  if not found then return false; end if;
  update profiles set admin_notified_at = now()
   where id = auth.uid() and admin_notified_at is null;
  get diagnostics claimed = row_count;
  return claimed;
end $$;

revoke execute on function complete_onboarding(text, user_role) from public, anon;
grant execute on function complete_onboarding(text, user_role) to authenticated;
