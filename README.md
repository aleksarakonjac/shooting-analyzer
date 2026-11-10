# Dnevnik streljaštva (Shooting Analyzer)

Training diary for shooters and their coaches: import SIUS results, SCATT shot timing and heart rate,
see a report per training and period dashboards. UI is Serbian; code and identifiers are English.

Stack: Next.js (App Router), Supabase (Postgres with row-level security, Auth, Storage), Vercel.

## Local setup

1. `npm install`
2. Create a Supabase project and follow `docs/supabase-setup.md` (apply the migrations, create the first admin).
3. Copy `.env.example` to `.env.local` and fill the two public values.
4. `npm run dev`

Checks: `npm test` (unit), `npm run lint`, `npx tsc --noEmit`, `npm run build`,
`scripts/db/test.sh` (pgTAP against a throwaway local Postgres).

## Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | app | project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | publishable (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | deployment only | used by the daily purge job only; never commit, never expose to the browser |
| `CRON_SECRET` | deployment only | long random string; Vercel Cron sends it as `Authorization: Bearer ...` |

## First admin

Sign up normally, then promote that account in the Supabase SQL editor:

```sql
update profiles set role = 'admin', status = 'active'
where id = (select id from auth.users where email = 'you@example.com');
```

All later accounts wait on the approval page until the admin approves them (shooter or coach).

## Production checklist

- Authentication → Providers → Email: **Confirm email ON**.
- Apply all migrations with `supabase db push`.
- Set the four environment variables above in the Vercel project.
- `vercel.json` schedules `/api/cron/purge` daily at 03:00 UTC. It deletes trainings that have been in the trash
  for more than 30 days and the stored source files that belong to them.

## Trash and audit log

Deleting a training moves it to the trash (`/korpa`): restore, or delete forever. Items are purged after 30 days.
`/dnevnik` lists who created, changed, deleted and restored trainings, limited to what the viewer may see
(the admin sees everything).
