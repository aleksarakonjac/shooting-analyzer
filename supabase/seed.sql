-- Promotes the existing auth user whose email equals the database setting
-- app.admin_email to an active admin. The email is never committed:
--   psql -c "alter database postgres set app.admin_email = 'you@example.com'"
-- or: PGOPTIONS="-c app.admin_email=you@example.com" before running the seed.
-- Only a user with a confirmed email is promoted (no pre-registration hijack).
-- Without the setting this file does nothing.
insert into profiles (id, display_name, role, status)
select u.id, coalesce(u.email, ''), 'admin', 'active'
from auth.users u
where nullif(current_setting('app.admin_email', true), '') is not null
  and u.email_confirmed_at is not null
  and lower(u.email) = lower(current_setting('app.admin_email', true))
on conflict (id) do update set role = 'admin', status = 'active';
