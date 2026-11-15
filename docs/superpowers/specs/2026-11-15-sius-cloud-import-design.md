# SIUS Cloud import: design

Date: 2026-11-15. Status: draft for owner review.
Research: `docs/research/sius-cloud-api.md`. Reference login: `scripts/sius-spike/login-test.mjs` (verified end to end
with the owner's account: tokens, refresh, 121 trainings, shots with sighters).

## Intent

The owner shoots on new SIUS targets that save every exercise to SIUS Shooting Sports Cloud, and competes at events
whose results are public on the SIUS Result Service. Today SIUS data reaches ZeroIn only as files (CSV, PDF, prnx)
moved by hand, and those files lack per-shot decimals, coordinates or times. SIUS Cloud has all of it: per shot
x/y in mm, a millisecond timestamp, decimal score, inner ten, sighters, and 3x20 positions.

Goal: pick a SIUS Cloud exercise (private training) or the owner's own competition performance directly in the new
training form, the same way a file is attached today, without moving files and without re-entering credentials.

## Goals

- New tab **SIUS Cloud** in the SIUS results section of the new training form, next to file / manual / paste.
- Two sub-tabs:
  - **Trening**: the owner's recent private SIUS exercises; pick one.
  - **Takmičenje**: public Result Service: competition, then discipline (event), then part (eliminations,
    qualification, final); ZeroIn finds the owner's own row.
- Session type picks the sub-tab. On Takmičenje the owner picks competition, then event (discipline), then part
  from the lists SIUS returns, all by hand (owner decision 2026-11-15: more reliable than guessing); the session
  name becomes "<competition> <discipline> <part>".
- Account page panel: connect with SIUS email + password; status; disconnect.
- Password stored encrypted and used automatically to log in again when the refresh token stops working.
- The picked data becomes an ordinary `ParsedSiusResult` (with `tMs`, `x`, `y`), so SCATT, pulse, alignment, report
  and stats work unchanged.

## Non-goals

- Other shooters' competition results (owner: "samo moj nastup").
- Background sync, notifications about new SIUS exercises (approach B, maybe later on the same layer).
- Writing anything to SIUS (comments, notes, deletes).
- Importing the whole SIUS history in one go (one exercise per training, as now).

## Anti-goals (failure even if it works)

- The password or a token reaches the browser, a log line, an error message or the client bundle.
- ZeroIn hammers SIUS logins (repeated failed password logins could lock the owner's SIUS account or get the
  server's IP blocked).
- Duplicate trainings from importing the same SIUS exercise twice without noticing.
- The competition tab silently picks another shooter's row.

## Constraints (from the research)

- SIUS auth is FusionAuth OIDC on `:8597`, public PKCE client `0b659819-…` (SIUS's own; gray area, can break
  without notice). Password grant is disabled; login works by submitting the hosted login form server-side, then
  following same-origin redirects (`/oauth2/complete-registration`, `/oauth2/consent`) until `login-callback?code=…`,
  then exchanging the code with the PKCE verifier. Wrong password: HTTP 200 page "Invalid login credentials."
- Access token lives 30 min; refresh token is not rotated on refresh; its lifetime is unknown.
- SIUS APIs send no CORS headers for other origins: every call goes through the ZeroIn server.
- Training Center API (`:8598`): list via `GET /api/user-results?loadOptions=…` (exact field set required, see
  research doc; `totalCount` is -1, page until a short page), shots via `GET /api/user-results/{exerciseId}/shots`.
- Result Service API (`:8594/api/v1`): anonymous; competitions, events, subevents, series (ranking + athlete ids),
  `POST /Athletes/shotgroups` for one athlete's shots. Public results have no sighters.
- Shot format: `coordinates "x/y"` mm, +x right, +y up; `timeStamp` UTC; `score` / `scores[]`
  (`["10x","10.6"]` on 50 m: whole with inner flag, then decimal); `SingleStage` or `MultiStage` (`stageResults` with
  `stageName` Kneeling/Prone/Standing).
- ZeroIn disciplines: `air_rifle`, `smallbore_3p`, `air_pistol` (`src/lib/domain/types.ts`). Session `kind`
  (`trening|kontrolni|takmicenje`) and `stage` (`slobodno|eliminacije|kvalifikacije|finale`) live on `trainings`
  (migration 0016).
- Google Health design (`2026-11-15-google-health-pulse-design.md`) claims migration 0029; this uses the next free
  number at build time.

## Approaches considered

- **A. On demand, server side (picked by owner).** When the tab opens, a server action refreshes the token (or logs
  in again with the stored password) and returns the list or the competition data. Fewest moving parts, always fresh,
  SIUS is contacted only when the owner acts. Cost: 1 to 2 s load; nothing when SIUS is down.
- **B. Background sync** (cron pulls new exercises into a local cache table). Instant list and offline history, but
  more parts, unattended logins that look like a bot, and competitions still need on-demand calls. Rejected for now;
  it can be added on top of A's client module.
- **C. From the browser.** Ruled out: SIUS blocks cross-origin calls and the tokens would sit in the browser.

## Decided by the owner

- Login limits as proposed (3 per user per hour, 30 global); privacy text for all users.
- 3x20 keeps the whole value as official and also stores the decimal for secondary display.
- Sighters are stored when the source has them and shown as their own "Proba" rows in the series list: one for
  air, one before each position's two series for 3x20.
- Credentials entered on the account page; **password is stored** (encrypted) and used as fallback for automatic
  re-login.
- Waiting-list style: SIUS exercises are picked inside the new training form, not auto-created as trainings.
- Placement: a SIUS Cloud tab with Trening / Takmičenje sub-tabs; competition flow is competition, discipline, part;
  session type picks the sub-tab; competition, discipline and part are picked by hand (updated 2026-11-15).
- Competitions: only the owner's own performance.
- Approach A.
- **"50m Rifle Prone" exercises are free 3x20 trainings**: the owner shoots all three positions in the prone
  program because it allows 60 shots without a break and shows decimals. Import them as `smallbore_3p` with an
  option to mark which shots belong to which position.
- **Users:** for now only the owner, but built so every shooter can connect their own SIUS account. A linked coach
  may use the shooter's SIUS connection to list and import the shooter's exercises. Competitions are public for
  everyone.

## Design

### Credentials and connection storage (new migration)

Table `sius_links`:

| column | type | notes |
|---|---|---|
| `user_id` | uuid PK → profiles, on delete cascade | one SIUS account per ZeroIn user |
| `email` | text not null | SIUS login id (shown on the account page) |
| `password_enc` | text | AES-256-GCM `v1:iv:tag:ciphertext` (base64); null after the password is rejected |
| `refresh_token_enc` | text | same format |
| `access_token_enc` | text | cached; reused until `access_expires_at - 60 s` |
| `access_expires_at` | timestamptz | |
| `sius_user_id` | uuid | `userId` from the token response |
| `connected_at` | timestamptz default now() | |
| `last_ok_at` | timestamptz | last successful SIUS call |
| `broken_at` | timestamptz | set when re-login fails with "Invalid login credentials" or an unknown page |
| `broken_reason` | text | `bad_password` / `blocked` (CAPTCHA, unexpected page) / `unknown` |

RLS on, all privileges revoked from `anon` and `authenticated`. Reads and writes only in server code with the
service-role client (`src/lib/supabase/admin.ts`), always keyed by the signed-in user's id taken from the session,
never from input. UI status comes from a `security definer` function `sius_link_status(sid uuid)` returning
`{state: 'none'|'ok'|'broken', email, reason}` for `sid = auth.uid()` only.

Encryption: `src/lib/crypto/secretBox.ts` (shared with Google Health if that lands first): AES-256-GCM via
`node:crypto`, random 12-byte IV, version prefix for future key rotation. Key in env `SIUS_CRED_KEY` (32 bytes,
base64), set in Vercel for production and preview; missing key means the feature reports "not configured" instead
of storing plaintext.

Profile column `profiles.sius_athlete_id text` (the Result Service `AthleteIdentifier.Identifier`, e.g.
`SHCHNM0412200401`). Not secret; owner-writable. Lets the competition tab work without a SIUS login.

### SIUS client (`src/lib/sius/`, server only, `import 'server-only'`)

- `auth.ts`: `loginWithPassword(email, password)` (port of the spike: PKCE, form fields, redirect hops, code
  exchange; returns tokens or a typed error `bad_password | blocked | unavailable`), `refresh(rt)`.
- `session.ts`: `getAccessToken(userId)`:
  1. cached access token still valid → use it;
  2. else refresh → store new access token (and refresh token if one is returned);
  3. refresh fails (`invalid_grant` or 400/401) → log in with the stored password → store all tokens;
  4. password rejected → clear `password_enc`, set `broken_at`, `broken_reason='bad_password'`, throw
     `SiusReconnectNeeded`. Never retry the password until the owner enters it again.
  At most one password login per request; concurrency: a second request during a re-login just retries the refresh
  once after the first finishes (row-level `updated_at` check is enough at this scale).
- `training.ts`: `listExercises(userId, {skip, take})`, `getExerciseShots(userId, exerciseId)`.
- `results.ts` (no auth): `listCompetitions({from, to})`, `listEvents(compId)`, `listSubEvents(compId, eventId)`,
  `getSeries(…)`, `getAthleteShots(…, athleteRunningId)`.
- `map.ts` (pure, tested): SIUS JSON to `ParsedSiusResult`:
  - shots in order; `value` from `scores`: decimal for `air_rifle` / `air_pistol`, finals and the prone program; for
    real 3x20 exercises (`50m Rifle 3x*`) the whole value (official) with `inner` from the `x` flag, matching how the
    PDF/prnx import stores 3x20, plus the decimal in the new `valueDecimal` for secondary display;
  - `x`, `y` from `coordinates`; `tMs` from `timeStamp`; `inner` from `innerTen`; `direction` left empty (the
    report derives it from x/y);
  - series: competition groups as series (10 shots per series for qualification exercises, group layout as given
    for others); `MultiStage` stage names map to `position` (Kneeling → kneeling, Prone → prone,
    Standing → standing);
  - `reportTime` = last shot time; `discipline` = SIUS exercise name; `disciplineId` from the name
    (`10m Air Rifle*` → air_rifle, `10m Air Pistol*` → air_pistol, `50m Rifle 3x*` → smallbore_3p,
    `50m Rifle Prone*` → smallbore_3p, see "Prone program as 3x20"); totals computed.
  - Sighters: returned separately as `sighters: ParsedSighterGroup[]` (`{position?, shots: ParsedShot[]}`, new
    optional field on `ParsedSiusResult`); see "Sighters".

### Prone program as 3x20

A `50m Rifle Prone*` exercise comes as one `SingleStage` block with no positions, often unfinished (any shot
count). In the preview the owner marks which shots belong to which position: control "Stavovi" with three text
fields (klečeći / ležeći / stojeći), each a list of shot-number ranges, e.g. klečeći `1-25, 41-60`, ležeći `26-40`
(a position may repeat). Default `1-20` / `21-40` / `41-60` for 60 shots; otherwise empty. Rules (owner decision
2026-11-15): every shot in at most one position; shots left out of all three are an error until assigned; all
three empty = no positions (plain series). Series are rebuilt in shooting order: each run of consecutive shots of
one position is cut into series of 10 from the run's start (a 25-shot run → 10, 10, 5), so stats per position work
as for real 3x20. The series list groups by position in shooting order and starts a new group each time the
position changes, e.g. klečeći (10, 10, 5), ležeći (10, 10), klečeći (10, 5). Values stay decimal. The split is applied before saving; it is not stored separately (the raw file
keeps the original). Real `50m Rifle 3x*` exercises already carry positions and skip this control.

### Who may use a connection

- A shooter connects and disconnects only their own SIUS account.
- Listing and importing private exercises is allowed for the shooter and for a coach with an active link to that
  shooter (same rule as Google Health: `coach_of(shooter_id)`). The form already knows which shooter the training
  is for; the actions take `shooterId` and check `shooterId = auth.uid() or coach_of(shooterId)` server side.
- `sius_link_status(sid)` answers for the shooter and their coaches (state and reason only; email only to the
  shooter).
- The competition sub-tab needs no connection; the shooter's `profiles.sius_athlete_id` is readable by their coach.

### Login limits (many users behind one server IP)

All SIUS logins come from the ZeroIn server's IPs, so one user's bad password must not get the server blocked for
everyone, nor lock that user's SIUS account.
- After SIUS rejects a stored password once, it is cleared and never retried until the user enters it again.
- Per user: at most 3 password logins per hour (refresh calls are not limited).
- Global: at most 30 password logins per hour across all users; above that, actions answer `unavailable` and the
  user sees "SIUS trenutno nedostupan, probaj kasnije".
- Counters live in a small table `sius_login_attempts (user_id, at)` (service role only), pruned on write.

### Server actions (`src/lib/sius/actions.ts`)

All require a signed-in active user. `connectSius`/`disconnectSius` act on that user only; the read actions take
the shooter id and apply "Who may use a connection".

- `connectSius(email, password)`: logs in once; on success encrypts and upserts email, password, tokens; on
  failure returns the typed error without storing anything.
- `disconnectSius()`: deletes the row (SIUS has no revoke we can call; tokens simply stop being used).
- `siusExercises(page)`: `{state, items: [{exerciseId, name, date, shots, total, imported: trainingId|null}], more}`.
  `imported` comes from `source_files.external_id` (below).
- `siusExerciseResult(exerciseId)`: `{parsed, raw}` where `raw` is the JSON string for the source file.
- `siusCompetitions()`, `siusEvents(compId)`, `siusParts(compId, eventId)`, `siusMyPerformance(compId, eventId,
  subEventId)`: the last finds the owner's row by `profiles.sius_athlete_id`, else by exact full name; if neither
  matches it never guesses: it says so ("Nisi pronađen u rezultatima ovog nastupa") and returns the ranking list
  (name, nation, total, searchable) so the owner picks. Picking a row first shows what was pulled for that athlete
  as a double check (name, nation, total, series totals, shot count); only "Da, to sam ja" saves the identifier to
  the profile and applies the result.

Error mapping: `SiusReconnectNeeded` → `{state:'broken'}`; network/5xx → `{state:'unavailable'}` (one retry, then
give up); not connected → `{state:'none'}`.

### Saving and duplicates

Cross-source check: the same match may show up both in the private list and on the Result Service. Each
`sius_cloud` source file also stores `first_shot_at` (timestamptz) and `shot_count`; before applying, the form asks
"already imported?" when another `sius_cloud` file of the same shooter has the same first-shot time (± 2 s) and
shot count, whatever its `external_id`.

- New `source_kind` value `sius_cloud`. On pick, the client builds a `File` from `raw`
  (`sius-<exerciseId|subEventId-athlete>.json`, `application/json`) and calls the existing
  `applySius(parsed, file, sha)` path, so upload, SHA dedupe and `source_files` rows work as for other files.
- New column `source_files.external_id text` (SIUS exercise id, or `comp:<subEventId>:<athleteRunningId>`), filled
  for `sius_cloud`; a partial index on `(external_id) where external_id is not null`. The exercise list marks
  already-imported exercises with a link to that training; picking one again asks for confirmation.

### Decimal next to whole value (owner decision)

New nullable column `shots.value_decimal numeric(4,1)` and `ParsedShot.valueDecimal`. Filled when the source gives
both (SIUS Cloud 3x20: `scores = ["10x","10.6"]`); `value` stays the official whole value used for totals and stats.
The report and series list show the decimal as a secondary figure (smaller, muted) where present. `save_training`
(and the replace-training function from 0018) store it. Other sources leave it null.

### Sighters (owner decision)

Private exercises carry sighters (e.g. 16 before a 60-shot air match, 73 across a 3x20); public results don't.
Stored whenever the source has them, shown as their own rows in the series list, never counted in totals or stats.

- New table `sighter_shots` (`id`, `match_id` → matches on delete cascade, `before_series` (idx of the match
  series the sighters precede), `position` (null or kneeling/prone/standing, for display), `idx` (order within the
  match), `value`, `value_decimal`, `inner`, `x`, `y`, `t_ms`; unique `(match_id, idx)`), same RLS as `shots` (through the match's training). A separate table instead of a flag on `series`, so
  no existing total, stat or alignment query can pick sighters up by accident.
- `save_training` payload: `match.sighters: [{before_series, position, shots: [...]}]`.
- Series list and report: a row "Proba" before the match series: one row for air (before series 1); for 3x20 one
  "Proba" row per position, placed before that position's two match series (kneeling sighters, K1, K2, prone
  sighters, P1, P2, standing sighters, S1, S2). For the prone-program split, shot time decides: a sighter goes
  before the first series whose first shot comes after it (sighters after the last shot go before the last
  series). A Proba row sits before the series named by `before_series`.
- Sighter row shows count and values (and decimal where present); the target plot can toggle them.
- SCATT warm-up (`loose_shots`) is unchanged; when SCATT is attached, SIUS sighters may serve as time anchors for
  alignment (builder's call).

### Training form (`NewTrainingForm.tsx`)

- SIUS `SegTabs` gains `{id: 'cloud', label: 'SIUS Cloud'}` with a `SiusCloudTab` component.
- Inside, `SegTabs` Trening / Takmičenje. Default: `takmicenje` session → Takmičenje; `trening` / `kontrolni` →
  Trening. The owner can switch.
- **Trening:** list of exercises, newest first, 20 per page with "more"; exercises on the session date first and
  highlighted; each row: date and time, name, number of match shots (so short, interrupted exercises are easy to
  skip), total, "uvezeno" badge. Pick → preview (series totals, shot
  count, sighter count) → apply. Applying sets discipline and date like any SIUS file (existing `applySius`
  behaviour).
- **Takmičenje:** three steps, all picked by the owner, nothing preselected (owner decision 2026-11-15):
  competition from the SIUS list (newest first, name search, "more"), then the competition's events (all of them,
  as SIUS names them, e.g. `10m AIR RIFLE MEN`), then the event's parts (Qualification, Final, …). Then the owner's
  row is found, or the "not found" message with the searchable ranking list and the double-check preview.
  The picked event and part also feed the session: discipline from the event name (like any SIUS import), stage
  from the part name (Qualification → `kvalifikacije`, Final → `finale`, Elimination/Pre-event → `eliminacije`;
  unknown → unchanged).
  On apply the session name is set to "<competition name> <ZeroIn discipline label> <ZeroIn stage label>" (SIUS
  event/part name when there is no ZeroIn label) (e.g.
  "ISSF World Championship Doha Vazdušna puška Kvalifikacije") unless the owner already typed a name; the event
  field gets the competition name and place gets "city, country" when empty (designer's call); the date comes from
  the part's start in the competition's own time zone, so a Doha start at 21:00 UTC is still 1 Nov. Shot times
  are UTC from SIUS and are stored as instants, so they show in local time like every other source.
- **Final:** stage `finale` today replaces the whole results area with `FinalEntry` (no tabs) and saves through
  `save_final` without a `source_files` row. The SIUS Cloud picker (both sub-tabs) is added above `FinalEntry` in
  the finale view and fills it with shot values and timestamps. Saving a final picked from SIUS also uploads the
  raw JSON as a `sius_cloud` source file with `external_id`, so "uvezeno" and the duplicate checks work for finals
  too (the final save path gains a source-file step). Private exercises named `*Final*` are offered the same way.
- States: not connected → note with a link to `/nalog` (the competition sub-tab still works); broken → "Ponovo
  poveži SIUS" link; unavailable → retry button. Loading states for each call.

### Account page (`/nalog`)

Panel "SIUS Cloud" next to `InboxTokenPanel`: not connected → email + password form ("Poveži"); connected → email,
connected since, last success, "Prekini vezu"; broken → reason and the form again. Text: password is stored
encrypted and used only to log in to SIUS when needed; Google sign-in users must set a SIUS password first
("Forgot password" on SIUS). Field for `sius_athlete_id` with a hint that it fills in automatically after the first
competition pick.

### Privacy policy

`PrivacyPolicy.tsx`, written for every user: ZeroIn stores the user's SIUS email, an encrypted SIUS password and
tokens at the user's request, uses them only to read that user's SIUS exercises, and deletes them on disconnect or
account deletion. Exception to "coach sees only what you shared": once a shooter connects SIUS, their linked coach
can list and import the shooter's SIUS exercises. Imported exercises are stored as source files on the training.

### Errors and limits

- SIUS 5xx / network: one retry with short backoff, then `unavailable`.
- Login page without the expected form, or a redirect chain that ends without a code → `blocked`, stored password
  kept but not retried automatically; the owner can retry from the account page.
- Timeouts: 10 s per SIUS call.
- No SIUS response bodies, tokens or passwords in logs; log only status codes and the error kind.

## Tests

- `map.ts`: fixtures from the research (public final + qualification, private 10 m with sighters, private 3x20
  MultiStage) → series, positions, values (decimal vs whole), x/y, tMs, sighters, totals.
- Discipline mapping from exercise and event names.
- `secretBox` round trip; tampered ciphertext and wrong key fail.
- `auth.ts` with mocked fetch: success chain with hops, bad password page, unknown page, missing code.
- `session.ts`: cached token, refresh ok, refresh fails then password ok, password rejected → broken and no second
  attempt.
- Actions: unauthenticated rejected; connect/disconnect only for self; read actions: self ok, linked coach ok,
  unrelated user 403.
- Login limits: per-user and global caps; rejected password is never retried.
- Prone ranges: parsing (`1-25, 41-60`), overlaps and unassigned shots rejected, repeated position, unfinished
  counts, runs cut into 10s from the run start; values stay decimal; sighters placed by time.
- Cross-source duplicate detection (same first-shot time ± 2 s and count).
- `value_decimal` saved and shown; totals use `value` only.
- Sighters: saved per position, rendered as "Proba" rows in the right places (air: one; 3x20: before each
  position's two series), excluded from totals and stats.
- Competition helpers (pure): part name → stage, session name, part date in the competition's time zone,
  own-row match never partial.
- Series list: a repeated position starts a new group (K 10/10/5, P 10/10, K 10/5).
- Form: tab defaults by session type (component test).

## Left to the builder

- Exact UI layout and copy within `DESIGN.md`; Serbian strings in `src/lib/i18n/sr.ts`.
- Module split under `src/lib/sius/`, server actions vs route handlers.
- Exact look of the "Proba" rows and the decimal secondary figure; whether alignment uses sighters in v1.
- Whether the SIUS exercise list is fetched in the page server component or by the client tab.

## Calls made by the designer (owner to check)

- Finals from SIUS save the raw JSON as a source file and get duplicate checks; the picker sits above `FinalEntry`.
- Cross-source duplicate check by first-shot time and shot count.
- Sighters in a separate table rather than a flag on `series` (stats safety).
- Login limits: 3 per user per hour, 30 global per hour.
- `profiles.sius_athlete_id` remembered after the first competition pick.
- Competition pick also fills event name and place when empty; a typed session name is never overwritten.
- Prone ranges with all three fields empty import plain series without positions.

## Owner to-dos outside code

- Set `SIUS_CRED_KEY` in Vercel (production + preview) and `.env.local`.
- Run the migration in Supabase (migrations are manual).
