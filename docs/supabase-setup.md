# Supabase project setup (development)

Use a separate project for development, never one holding real data. Nothing below is committed.

1. Create a project at supabase.com (free tier is fine). Save the database password in your password manager.
2. Authentication → Providers → Email: keep "Confirm email" on, or turn it off in a development project to sign in at once.
3. Apply the schema (from this repo, once):
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
4. Copy `.env.example` to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (Project settings → API). Never put the service-role key in the repo.
5. Create the admin: Authentication → Users → Add user (email + password, auto-confirm), then in the SQL editor:
   ```sql
   update profiles set role = 'admin', status = 'active'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   Expect `UPDATE 1`. Do not use `admin_set_profile` here: it is for the app and fails in the SQL editor
   ("admin only"), because the editor has no signed-in user (`auth.uid()` is null).
