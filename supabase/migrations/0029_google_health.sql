-- Google Health pulse import (owner, 2026-11-15). A shooter connects Google Health once; the server keeps the
-- refresh token (AES-256-GCM, key outside the database) and reads the pulse for a training on request.
-- Rows are read and written only by server routes with the service role; nobody reads them through the API.
--
-- Coach exception (owner decision 2026-11-15): 0002_rls.sql says Fitbit/calendar-derived data is hidden from
-- coaches unless the shooter shared it. For Google Health pulse, a coach of the shooter may pull pulse for a
-- training's frame (shots or a SHOOTING workout, plus 20 minutes either side) without a separate share. The pulse
-- is stored as a TCX file on that training, which the coach can already see.

create table google_health_links (
  user_id uuid primary key references profiles (id) on delete cascade,
  refresh_token_enc text not null,
  health_user_id text,
  scopes text not null,
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  broken_at timestamptz
);

alter table google_health_links enable row level security;
revoke all on google_health_links from anon, authenticated;
-- This project does not grant service_role table privileges by default (see 0026).
grant select, insert, update, delete on google_health_links to service_role;

-- Connection state for the account page and the training form, never the token: the shooter for themselves,
-- a coach for a linked shooter, 'none' for everyone else.
create function health_link_status(sid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not (is_active() and (sid = auth.uid() or coach_of(sid))) then 'none'
    when not exists (select 1 from google_health_links where user_id = sid) then 'none'
    when exists (select 1 from google_health_links where user_id = sid and broken_at is not null) then 'broken'
    else 'ok'
  end
$$;
revoke all on function health_link_status(uuid) from public, anon;
grant execute on function health_link_status(uuid) to authenticated;
