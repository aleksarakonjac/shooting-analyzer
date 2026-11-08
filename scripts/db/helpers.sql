-- Test-only helpers, loaded after the migrations by scripts/db/test.sh.
-- Acting-user helper: runs q as role authenticated with auth.uid() = uid.
-- Returns affected/returned row count, or -1 when the statement raised (permission/RLS).
create function tap(uid uuid, q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  begin
    perform set_config('role', 'authenticated', true);
    execute q;
    get diagnostics n = row_count;
  exception when others then
    n := -1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end $$;

-- Fixture ids
create function u(n int) returns uuid language sql immutable as
$$ select ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid $$;

-- my_links() as another user (for assertions on names)
create function my_links_for(uid uuid) returns table (other_name text) language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  return query select l.other_name from my_links() l;
end $$;
