-- Every new auth user gets a pending shooter profile. Role and status are never
-- read from user-supplied metadata; the admin sets them via admin_set_profile().
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role, status)
  values (new.id,
          coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), new.email, ''),
          'shooter', 'pending');
  return new;
end $$;

revoke execute on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
