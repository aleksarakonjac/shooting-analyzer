# Google Health pulse import: design

Date: 2026-11-15. Status: approved by owner 2026-11-15 (including browser-supplied shot times for coach pulls in
the new-training form; no stricter rule wanted).

## Intent

Today a shooter gets heart rate into a training by exporting a TCX from the watch app and uploading it (directly or
through the phone inbox). That is the step people skip. With this feature a shooter connects Google Health once, and
from then on the pulse for any training is pulled with one click, by the shooter or by their coach. The owner wants to
see pulse over the whole match, including pauses (how it dropped between series), and optionally a while before and
after the match.

## What the spike established (2026-11-15, owner's Fitbit Air)

- Legacy Fitbit Web API is shut down; Google Health API v4 (`https://health.googleapis.com/v4`) is the only route.
- `GET /v4/users/me/dataTypes/heart-rate/dataPoints` returns passive heart rate all day at 1–3 s spacing
  (median 2 s), no workout needed. Filter:
  `heart_rate.sample_time.physical_time >= "<RFC3339>" AND heart_rate.sample_time.physical_time < "<RFC3339>"`,
  `pageSize` up to 10000, `nextPageToken` paging. Each point: `heartRate.sampleTime.physicalTime` (UTC),
  `heartRate.sampleTime.utcOffset`, `heartRate.beatsPerMinute` (string).
- `GET /v4/users/me/dataTypes/exercise/dataPoints` lists workouts; the owner's training shows up as
  `exerciseType: "SHOOTING"` with `interval.startTime` / `interval.endTime`. Filter only by civil date:
  `exercise.interval.civil_start_time >= "YYYY-MM-DD" AND exercise.interval.civil_start_time < "YYYY-MM-DD"`, max 25/page.
- `exportExerciseTcx` returned exactly the same 2232 points as the heart-rate list, so it adds nothing; the `location`
  scope it needs is dropped.
- All Google Health scopes are **restricted**. Unverified app: max 100 users and an "unverified app" warning on
  consent. More than 100 users needs verification with a third-party security review. The owner will apply for
  verification in parallel.
- The OAuth client is the same Google Cloud project/client already used for Supabase Google login. The Google Health
  API is enabled there.

## Goals

1. A user connects / disconnects their Google Health account from the account page (`/nalog`).
2. In the training form (new and edit), the heart-rate slot gets a "Povuci puls sa Google Health" action next to the
   file upload. It works for the shooter and for the shooter's coach, using the **shooter's** connection.
3. The pulled pulse becomes a generated TCX file that the form treats exactly like an uploaded TCX: same storage
   (`source-files`, kind `tcx`), same offset/alignment UI, same average, same report.
4. The report shows the match window by default (shots ±1 min, as today) and gets an optional "Pre i posle meča"
   view that widens the chart to everything stored (works for manual TCX files too).

## Non-goals

- Automatically creating a training from a Google Health `SHOOTING` workout (inbox-style "new training waiting").
  Recorded as a later idea.
- Webhooks / background sync.
- Storing heart-rate samples in database tables or a new file format.
- Garmin, Polar, Apple Health (not reachable through this API; manual TCX upload stays).

## Anti-goals (failure even if it works)

- Pulling more health data than the training needs (e.g. whole days).
- Refresh tokens reachable from the browser or readable by other users, coaches included.
- A coach pulling pulse for a shooter they are not the coach of.
- Breaking the existing manual TCX path or existing trainings.

## Approaches considered

1. **Generated TCX (chosen).** Server pulls heart rate, builds a TCX, client hands it to the existing `addHr` path.
   Nothing downstream changes; the stored file is a standard format the user can download. Cost: building XML only to
   parse it again; ~150–300 KB per training, irrelevant.
2. **Compact JSON samples as a new source kind.** Cleaner and smaller, but every loader (form, edit, report) would
   branch on two formats for no user-visible gain. Can still be added later without losing data.
3. **Fetch live on every report view.** Rejected: breaks when the shooter disconnects, needs the shooter's token for
   every coach view, spends quota. Pulse is always stored as a snapshot.

Owner picked 1.

## Decided by the owner

- Coach pulls with the shooter's token when they are that shooter's coach. **No share is required**, but a coach may
  only pull for the frame of a training/match defined by shots (SCATT, shot timestamps) or by a Google Health
  `SHOOTING` workout, never for a free time range. This is a deliberate exception to "coaches see only what was
  shared"; the privacy policy and the `0002_rls.sql:79` comment must say so.
- Generated TCX format.
- Fetch window priority: **shot timestamps first** (SCATT, or SIUS shot times when copied), then the Google Health
  `SHOOTING` workout, then the training's `started_at`/`ended_at`.
- Pulse before and after the match should be viewable, as an optional view.
- `activity_and_fitness.readonly` is used (to find the `SHOOTING` workout); `location.readonly` is dropped.

## Design

### Scopes

`https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` and
`https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`. Remove `location.readonly` from the
consent screen's Data Access list and from `PrivacyPolicy.tsx`.

### Connection storage (migration `0029_google_health.sql`, next free number)

Table `google_health_links`:

| column | type | notes |
|---|---|---|
| `user_id` | uuid PK → profiles, on delete cascade | one connection per user |
| `refresh_token_enc` | text not null | AES-256-GCM, `iv:tag:ciphertext` base64; key in env `GOOGLE_HEALTH_TOKEN_KEY` (32 bytes, base64) |
| `health_user_id` | text | from `GET /v4/users/me/identity` (`healthUserId`) |
| `scopes` | text not null | as granted |
| `connected_at` | timestamptz default now() | |
| `last_used_at` | timestamptz | |
| `broken_at` | timestamptz | set when Google answers `invalid_grant`; UI asks to reconnect |

RLS on, all privileges revoked from `anon`/`authenticated`. Reads and writes happen only in server routes with the
service-role client (`src/lib/supabase/admin.ts`). For UI status, a `security definer` function
`health_link_status(sid uuid) returns text` (`'none' | 'ok' | 'broken'`) answers for `sid = auth.uid()` or when
`coach_of(sid)` is true, otherwise `'none'`. It never returns the token.

### OAuth routes (`src/app/api/google-health/`)

- `GET connect`: requires a signed-in active user. Builds the Google auth URL (`access_type=offline`,
  `prompt=consent`, the two scopes, `include_granted_scopes=false`) with a `state` that is an HMAC-signed
  `{userId, nonce, exp}`, the nonce also set in an httpOnly cookie. Redirect URI
  `${origin}/api/google-health/callback` (add the production and `http://localhost:3000` variants to the OAuth client).
- `GET callback`: verifies state + cookie + that the signed-in user matches, exchanges the code, checks that both
  scopes were granted (otherwise back to `/nalog?gh=scopes`), calls `users/me/identity` (400 `ACCOUNT_NOT_LINKED` →
  `/nalog?gh=not_linked` with instructions to sign in to the Google Health app first), encrypts and upserts the
  refresh token, redirects to `/nalog?gh=ok`.
- `POST disconnect`: revokes at `https://oauth2.googleapis.com/revoke`, deletes the row (delete even if revoke fails).

Client ID/secret come from env (`GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`). Same values as the Supabase
Google provider, but kept as separate env vars.

### Pull route: `POST /api/google-health/pulse`

Input: either `{ trainingId }` (saved training: edit mode, or a later pull on an existing training) or
`{ shooterId, date: 'YYYY-MM-DD', shotTimesMs?: [first, last], startedAt?, endedAt? }` (new-training form, nothing
saved yet).

1. Auth: caller is signed in and active, and `caller = shooterId` or `coach_of(shooterId)` (checked with the
   caller's own Supabase client, so RLS-side functions decide). Else 403. With `trainingId`, the shooter, date, shot
   times and training times are read from the database (caller must pass `can_see_training`), and client-sent
   times are ignored.
   **Coach rule (owner's decision):** when the caller is the coach, not the shooter, `startedAt`/`endedAt` are
   ignored as a window source; the match window must come from shot times or a `SHOOTING` workout, else 422
   `no_window`. In the new-training form shot times come from the browser (not yet saved); accepted, bounded by
   the 6 h cap. *(Builder-check call, can be corrected.)*
2. Load and decrypt the shooter's refresh token; none → 409 `not_connected`; `broken_at` set → 409 `reconnect`.
3. Refresh the access token. `invalid_grant` → set `broken_at`, 409 `reconnect`.
4. List exercises for `date - 1 .. date + 1` (civil), keep `exerciseType == "SHOOTING"`.
5. **Match window** (what defines "the match"):
   - shots present → `[firstShot, lastShot]`;
   - else a `SHOOTING` workout on that date (if several, the one overlapping `startedAt..endedAt`, else the longest);
   - else `[startedAt, endedAt]` (shooter only, see coach rule);
   - else 422 `no_window` (UI: "Učitaj SCATT ili upiši vreme treninga").
6. **Fetch range** = union of the match window ±20 min, the overlapping `SHOOTING` workout, and (shooter only)
   `startedAt..endedAt`, capped at 6 h total (centered on the match window). The ±20 min is part of the training
   frame for the coach too, so "Pre i posle meča" works for coach pulls.
7. List heart rate for the fetch range (paging; 429/504 backoff). Zero points → 404 `no_data`
   ("Google Health nema puls za ovo vreme — da li je sat sinhronizovan?").
8. Build TCX (below), update `last_used_at`, respond `{ tcx, fileName, workout?: {startMs, endMs}, range }`.

Raw samples are not logged or kept on the server.

### TCX builder: `src/lib/googleHealth/tcx.ts`

Pure function `buildTcx(samples: {tMs, bpm}[], meta) → string`: one `Activity Sport="Other"`, one `Lap` with
`StartTime`, one `Track` with `Trackpoint{Time, HeartRateBpm/Value}`. Times are written in UTC with `Z`, so
`parseTcx` gets explicit offsets (`missingOffset` false) and the zone reinterpretation UI does not apply.
File name: `google-health-YYYY-MM-DD-HHmm.tcx`. Test: round trip through `parseTcx` gives the same samples.

### Training form (`NewTrainingForm.tsx`)

- In the heart-rate slot, next to "choose file": button **"Povuci puls sa Google Health"**, shown when
  `health_link_status(shooter)` is `ok`. For `broken` show "Veza sa Google Health je istekla — strelac treba ponovo
  da je poveže" (for the shooter, with a link to `/nalog`).
- Enabled once there is a date. Sends first/last shot time from whatever shots are loaded (SCATT or SIUS times),
  the date and the training times.
- On success: `new File([tcx], fileName, {type: 'application/xml'})` → existing `addHr(file)`. Show
  "Puls povučen: 16:13–17:31 (Google Health)" and, if a `SHOOTING` workout was found, its time.
- If `started_at`/`ended_at` are empty and a workout was found, prefill them from the workout (editable, not forced).
- In edit mode it replaces the existing TCX the same way an upload does.
- Pulling again after adding SCATT later is allowed (replaces).

### Report: "Pre i posle meča"

- `trening/[id]/page.tsx` passes two windows: the match window (shots ±1 min, as today) and the full range of the
  stored TCX (first..last sample, offset applied).
- `useHrSamples` keeps the whole parsed file and windows it by whichever is active.
- A toggle near the heart-rate panel, **"Pre i posle meča"**, off by default, switches the chart's x-range to the
  full range; shots and series stay marked, the part outside the match is visually muted. Hidden when the full range
  adds less than 1 min on either side.
- Average heart rate stays the match-only average when shots have times.
- **No shot times** *(my call, can be corrected)*: the match window falls back to `started_at..ended_at`, then to the
  whole stored file, for both the chart and `hr_avg_bpm` (touches `trening/[id]/page.tsx:101` and `hrAverage` in
  `saveTraining.ts`). Without this, pulse pulled via a workout would be stored but shown nowhere.
- Works for manual TCX uploads as well.

### Account page (`/nalog`)

New panel "Google Health" next to `InboxTokenPanel`: status (not connected / connected since … / needs reconnect),
connect and disconnect buttons, a one-line note that the Google Health mobile app must be signed in first, and that
Google will show an "unverified app" warning until verification is done.

### Privacy policy

Update `PrivacyPolicy.tsx`: remove the location scope paragraph; state the exception to the "coach sees only what
you shared" rule (line ~48): once the shooter connects Google Health, their coach can pull pulse for a training's
frame (shots or a Shooting workout, ±20 min) without a separate share; update the `0002_rls.sql:79` comment in the
new migration's notes; say only the training's time range (up to 6 h) is read and stored as a file on the
training; disconnecting stops future pulls but keeps pulse already saved on trainings (deleting the training deletes
it).

### Errors and limits

- Google 429/5xx: up to 3 retries with backoff, then 503 `google_unavailable`.
- Token refresh on every pull (no access-token caching), fine at this scale.
- 100-user cap: nothing in code. Documented in the account panel text until verification is done.

## Tests

- `buildTcx` round trip through `parseTcx`; UTC handling.
- Window selection (pure function): shots only, workout only, times only, nothing; the ±20 min union and the 6 h cap;
  several workouts on one day.
- Token encryption round trip; tampered ciphertext fails.
- State signing/verification (expired, wrong user, wrong nonce).
- Pull route auth: self ok, coach ok, unrelated user 403, inactive 403 (Google calls mocked).
- Coach rule: coach with only `startedAt/endedAt` → 422; coach with shots or workout → ok; `trainingId` path ignores
  client-sent times.
- No-shot-times fallback in report window and `hrAverage`.
- Report toggle: muted area and range switch (component test).

## Left to the builder

- Exact UI placement and copy in the form and report, within the existing design system (`DESIGN.md`).
- Module layout under `src/lib/googleHealth/` (client, crypto, window, tcx).
- Whether `health_link_status` is read in the page server component or fetched by the form.

## Owner to-dos outside code

- Remove `location.readonly` from Data Access; add redirect URIs for production and `localhost:3000`.
- Set `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_TOKEN_KEY`, `GOOGLE_HEALTH_STATE_SECRET`
  in Vercel and `.env.local`.
- Run the migration manually (as usual).
- Start verification with the two scopes and the justification text.
