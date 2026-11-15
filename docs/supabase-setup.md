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

## Google sign-in

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: enable, paste the client ID and secret.
3. Supabase → Authentication → URL Configuration: add the site URL and `https://<your-domain>/auth/callback` (plus `http://localhost:3000/auth/callback` for development) to the redirect allow-list.
4. A new Google account is a pending account like any other: the admin is mailed once with the approval link (same `RESEND_API_KEY`, `ADMIN_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Google Health (pulse import)

Pulse is read from the Google Health API v4 with the shooter's consent. The Google Cloud project and OAuth client
are the ones already used for Google sign-in.

1. **Environment** (Vercel → Project → Settings → Environment Variables, and `.env.local` for development):
   - `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`: the OAuth client (same values as the Supabase Google provider).
   - `GOOGLE_HEALTH_TOKEN_KEY`: 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts stored refresh tokens;
     changing it disconnects everyone (they reconnect on the account page).
   - `GOOGLE_HEALTH_STATE_SECRET`: any long random string (`openssl rand -base64 32`). Signs the OAuth `state`.
   Without all four the feature stays off (no button, connect returns an error).
2. **OAuth client** (Google Auth Platform → Clients → the web client) → Authorized redirect URIs, add:
   - `https://<production domain>/api/google-health/callback`
   - `http://localhost:3000/api/google-health/callback`
3. **Data Access** (consent screen): keep only
   `googlehealth.health_metrics_and_measurements.readonly` and `googlehealth.activity_and_fitness.readonly`;
   remove `googlehealth.location.readonly`.
4. **Migration**: apply `supabase/migrations/0029_google_health.sql` (SQL editor), as with the other migrations.
5. Until the app is verified, Google allows at most 100 users and shows an "unverified app" warning on consent.
