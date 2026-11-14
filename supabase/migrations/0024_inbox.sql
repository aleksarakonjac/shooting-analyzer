-- Phone inbox: an iOS Shortcut in the share sheet posts an exported SCATT file to /api/inbox with a personal
-- token, the file waits here, and the next session entry picks it up. Nothing is parsed on the server.

-- A personal upload token. Only its SHA-256 is stored; the plain token is shown once when it is made.
create table inbox_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default '' check (char_length(label) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index inbox_tokens_user on inbox_tokens (user_id);

-- A file waiting to be entered. Rows are written only by the upload route (service role).
create table inbox_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  bytes int not null check (bytes > 0),
  created_at timestamptz not null default now()
);
create index inbox_files_user on inbox_files (user_id, created_at desc);

alter table inbox_tokens enable row level security;
alter table inbox_files enable row level security;
revoke all on inbox_tokens, inbox_files from anon, authenticated;

-- The owner sees and removes their own tokens; a token is created through make_inbox_token only.
grant select (id, label, created_at, last_used_at), delete on inbox_tokens to authenticated;
create policy inbox_tokens_select on inbox_tokens for select to authenticated using (user_id = auth.uid() and is_active());
create policy inbox_tokens_delete on inbox_tokens for delete to authenticated using (user_id = auth.uid());

-- The owner lists waiting files and removes them once entered (or unwanted).
grant select, delete on inbox_files to authenticated;
create policy inbox_files_select on inbox_files for select to authenticated using (user_id = auth.uid() and is_active());
create policy inbox_files_delete on inbox_files for delete to authenticated using (user_id = auth.uid());

-- Stores the hash of a token the server generated. At most 5 tokens per account.
create function make_inbox_token(hash text, token_label text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not is_active() then raise exception 'inactive account'; end if;
  if (select count(*) from inbox_tokens where user_id = auth.uid()) >= 5 then raise exception 'too many tokens'; end if;
  insert into inbox_tokens (user_id, token_hash, label) values (auth.uid(), hash, left(coalesce(token_label, ''), 60))
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function make_inbox_token(text, text) from public, anon;
grant execute on function make_inbox_token(text, text) to authenticated;

-- ---------- storage: private bucket inbox, path <user_id>/<file> ----------
insert into storage.buckets (id, name, public, file_size_limit) values ('inbox', 'inbox', false, 26214400)
  on conflict (id) do nothing;

create policy inbox_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'inbox' and (storage.foldername(name))[1] = auth.uid()::text and is_active());
create policy inbox_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'inbox' and (storage.foldername(name))[1] = auth.uid()::text);
