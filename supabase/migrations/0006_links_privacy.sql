-- Privacy hardening of linking (security review of 0005).

-- Links are created only through request_link(), which validates the target and stays silent.
-- (No direct INSERT: a raw insert would turn foreign-key errors into an existence oracle.)
revoke insert on links from authenticated;
drop policy links_insert on links;

-- An outgoing pending request shows no identity of the other side; the requester already
-- knows whom they asked. Names appear for incoming requests and for active links.
create or replace function my_links() returns table (
  id uuid, status link_status, other_id uuid, other_name text, other_role user_role, i_requested boolean
) language sql stable security definer set search_path = public as $$
  select l.id, l.status,
         case when hide then null else o.id end,
         case when hide then null else o.display_name end,
         case when hide then null else o.role end,
         l.requested_by = auth.uid()
  from links l
  join profiles o on o.id = case when l.shooter_id = auth.uid() then l.coach_id else l.shooter_id end
  cross join lateral (select l.status = 'pending' and l.requested_by = auth.uid() as hide) h(hide)
  where is_active() and auth.uid() in (l.shooter_id, l.coach_id) and l.status <> 'ended'
  order by l.created_at
$$;
