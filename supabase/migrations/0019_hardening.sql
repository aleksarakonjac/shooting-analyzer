-- Deferred review findings (2026-11-10).

-- Link functions created after 0002 kept PostgreSQL's default EXECUTE for PUBLIC, so anon could call
-- them (they did nothing without a user, but they should not be reachable at all).
revoke execute on function request_link(text), my_links(), confirm_link(uuid), end_link(uuid) from public, anon;
grant execute on function request_link(text), my_links(), confirm_link(uuid), end_link(uuid) to authenticated;

-- Tables created after 0002 got Supabase's default grants for anon; row-level security already
-- turned anon away, but the grants should not be there.
revoke all on finals, final_shots, events from anon;

-- A stored final keeps its training and discipline (the shot limit depends on it), and a shot keeps
-- its final; only the placement, the elimination point and the shots' own fields can change.
revoke update on finals, final_shots from authenticated;
grant update (placement, eliminated_after_shot) on finals to authenticated;
grant update (stage_idx, idx, value, t_ms) on final_shots to authenticated;

-- The trash purge job removes the stored files of a training first and then calls this with the
-- trainings whose files are gone, using the same cutoff it selected them with. A training restored
-- in between, or one whose files could not be removed, stays. Returns the ids purged.
create function purge_trainings(ids uuid[], cutoff timestamptz) returns uuid[]
language sql security definer set search_path = public as $$
  with gone as (
    delete from trainings where id = any (ids) and deleted_at is not null and deleted_at < cutoff returning id
  )
  select coalesce(array_agg(id order by id), '{}') from gone
$$;
revoke execute on function purge_trainings(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function purge_trainings(uuid[], timestamptz) to service_role;
