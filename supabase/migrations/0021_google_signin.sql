-- Google sign-in: the name comes from the provider profile, and the admin is mailed once per new account.
alter table profiles add column admin_notified_at timestamptz;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role, status, requested_role)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
                   nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                   nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                   new.email, ''),
          'shooter', 'pending',
          case when new.raw_user_meta_data ->> 'requested_role' = 'coach' then 'coach'::user_role else 'shooter'::user_role end);
  return new;
end $$;
