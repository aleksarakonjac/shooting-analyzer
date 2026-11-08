-- The links table is reachable only through functions, so the masking in my_links()
-- cannot be bypassed by reading the table directly (security review of 0006).

create function confirm_link(link_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update links set status = 'active'
  where id = link_id and status = 'pending' and requested_by <> auth.uid()
    and auth.uid() in (shooter_id, coach_id) and is_active();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- Ends an active link, or withdraws/declines a pending one.
create function end_link(link_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update links set status = 'ended'
  where id = link_id and status in ('pending', 'active')
    and auth.uid() in (shooter_id, coach_id) and is_active();
  get diagnostics n = row_count;
  return n = 1;
end $$;

grant execute on function confirm_link(uuid), end_link(uuid) to authenticated;

drop policy links_select on links;
drop policy links_update on links;
revoke select, update on links from authenticated;
