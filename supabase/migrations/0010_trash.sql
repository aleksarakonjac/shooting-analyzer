-- "Delete forever" from the trash. Trainings have no DELETE grant, so removing one for good goes
-- through this function, which only touches trainings that are already in the trash and that the
-- caller may see (owner, linked coach, admin). Child rows go with it (on delete cascade).
create function delete_training_forever(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from trainings where id = tid and deleted_at is not null and can_see_shooter(shooter_id)
  ) then
    raise exception 'not in your trash' using errcode = '42501';
  end if;
  delete from trainings where id = tid;
end $$;

revoke execute on function delete_training_forever(uuid) from public, anon;
grant execute on function delete_training_forever(uuid) to authenticated;
