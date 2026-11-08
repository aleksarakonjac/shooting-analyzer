-- Coach-shooter linking by email and sharing-setting integrity (Task 11).

-- Request a link by the other person's email. Deliberately silent when nothing can be
-- created (unknown email, inactive account, same role, open link exists): the caller must
-- not be able to probe which emails are registered.
create function request_link(target_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  other profiles;
  s uuid;
  c uuid;
begin
  select * into me from profiles where id = auth.uid() and status = 'active';
  if not found then return; end if;

  select p.* into other from auth.users u join profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(target_email)) and p.status = 'active'
  limit 1;
  if not found or other.id = me.id then return; end if;

  if me.role = 'coach' and other.role = 'shooter' then
    s := other.id; c := me.id;
  elsif me.role = 'shooter' and other.role = 'coach' then
    s := me.id; c := other.id;
  else
    return;
  end if;

  if exists (select 1 from links where shooter_id = s and coach_id = c and status <> 'ended') then return; end if;
  insert into links (shooter_id, coach_id, requested_by, status) values (s, c, auth.uid(), 'pending');
end $$;

-- My open links with the other side's name (a pending counterpart is not otherwise readable).
create function my_links() returns table (
  id uuid, status link_status, other_id uuid, other_name text, other_role user_role, i_requested boolean
) language sql stable security definer set search_path = public as $$
  select l.id, l.status, o.id, o.display_name, o.role, l.requested_by = auth.uid()
  from links l
  join profiles o on o.id = case when l.shooter_id = auth.uid() then l.coach_id else l.shooter_id end
  where is_active() and auth.uid() in (l.shooter_id, l.coach_id) and l.status <> 'ended'
  order by l.created_at
$$;

grant execute on function request_link(text), my_links() to authenticated;

alter table shares add constraint shares_shape check (
  (scope = 'all' and training_id is null and from_date is null and to_date is null)
  or (scope = 'training' and training_id is not null and from_date is null and to_date is null)
  or (scope = 'period' and training_id is null and from_date is not null and to_date is not null
      and from_date <= to_date));
