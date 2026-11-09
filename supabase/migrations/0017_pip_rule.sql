-- Display setting: the score from which a shot pip is drawn filled, per discipline ({"air_rifle": 10.5}).
-- Missing keys use the default (10.5 decimal, 10 whole rings); the app checks the values.
alter table profiles add column pip_top jsonb not null default '{}'::jsonb
  check (jsonb_typeof(pip_top) = 'object');
grant update (pip_top) on profiles to authenticated;
