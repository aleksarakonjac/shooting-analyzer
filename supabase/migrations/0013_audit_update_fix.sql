-- Fix: audit_row() read old.deleted_at / new.deleted_at directly, which raises
-- 'record "old" has no field "deleted_at"' on every UPDATE of matches, series, shots and source_files.
-- Same function as 0002, with deleted_at read from the jsonb copies of the row.
create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  act text;
  rec jsonb;
  old_rec jsonb;
  sid uuid;
begin
  if tg_op = 'INSERT' then
    act := 'insert'; rec := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    act := 'delete'; rec := to_jsonb(old);
  else
    rec := to_jsonb(new); old_rec := to_jsonb(old);
    -- Read deleted_at from the jsonb copies: old.deleted_at fails on tables without that column
    -- (plpgsql resolves the field even when the table-name test is false).
    if tg_table_name = 'trainings' and old_rec ->> 'deleted_at' is null and rec ->> 'deleted_at' is not null then
      act := 'soft_delete';
    elsif tg_table_name = 'trainings' and old_rec ->> 'deleted_at' is not null and rec ->> 'deleted_at' is null then
      act := 'restore';
    else
      act := 'update';
    end if;
  end if;

  -- Owner of the data. Null when a parent was already removed (cascade from purge_trash):
  -- such rows are visible to the admin only.
  sid := case tg_table_name
    when 'trainings' then (rec ->> 'shooter_id')::uuid
    when 'matches' then (select shooter_id from trainings where id = (rec ->> 'training_id')::uuid)
    when 'source_files' then (select shooter_id from trainings where id = (rec ->> 'training_id')::uuid)
    when 'series' then (select t.shooter_id from matches m join trainings t on t.id = m.training_id
                         where m.id = (rec ->> 'match_id')::uuid)
    when 'shots' then (select t.shooter_id from series s join matches m on m.id = s.match_id
                         join trainings t on t.id = m.training_id where s.id = (rec ->> 'series_id')::uuid)
  end;

  insert into audit_log (actor_id, action, table_name, row_id, shooter_id, diff)
  values (auth.uid(), act, tg_table_name, (rec ->> 'id')::uuid, sid,
          case when old_rec is null then rec else jsonb_build_object('old', old_rec, 'new', rec) end);
  return null;
end $$;
