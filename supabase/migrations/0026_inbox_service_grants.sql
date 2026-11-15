-- The upload route (/api/inbox) runs with the service role. This project does not grant table privileges
-- to service_role by default, so give it exactly what the route uses: find the token and its owner,
-- count and add waiting files, and stamp the token's last use.
grant select (id, role, status) on profiles to service_role;
grant select (id, user_id, token_hash), update (last_used_at) on inbox_tokens to service_role;
grant select (id, user_id), insert on inbox_files to service_role;
