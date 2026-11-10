-- The person registering says whether they want a shooter or a coach account. It is only a request:
-- `role` stays 'shooter' and `status` 'pending' until an admin approves (admin_set_profile or the
-- signed e-mail link), so nothing in user-supplied metadata can grant access.
alter table profiles
  add column requested_role user_role not null default 'shooter'
  check (requested_role in ('shooter', 'coach'));

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role, status, requested_role)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), new.email, ''),
          'shooter', 'pending',
          case when new.raw_user_meta_data ->> 'requested_role' = 'coach' then 'coach'::user_role else 'shooter'::user_role end);
  return new;
end $$;
