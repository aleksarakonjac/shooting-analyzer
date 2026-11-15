# Google Health Pulse Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shooter connects Google Health once; the shooter or their coach then pulls the training's pulse with one click, stored as a generated TCX, and the report can show pulse before and after the match.

**Architecture:** Pure modules under `src/lib/googleHealth/` (window choice, TCX builder, token crypto, OAuth state, Google client, pull orchestration with injected deps, like `src/lib/inbox/upload.ts`). Thin Next route handlers under `src/app/api/google-health/` wire the deps to the service-role Supabase client. The form turns the returned TCX into a `File` and hands it to the existing `addHr`; nothing downstream of that changes. The report gets a second (full) window and a toggle.

**Tech Stack:** Next.js 16.4 App Router (read `node_modules/next/dist/docs/` for route handlers before writing them, per AGENTS.md), Supabase (Postgres + RLS, `@supabase/ssr`), Vitest + Testing Library, Node `crypto` (no new dependencies), `fast-xml-parser` already present (parse side only).

**Spec:** `docs/superpowers/specs/2026-11-15-google-health-pulse-design.md`

## Global Constraints

- Scopes, exactly these two: `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`, `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`. Never `location.readonly`.
- API base `https://health.googleapis.com/v4`; heart rate `GET /users/me/dataTypes/heart-rate/dataPoints`, filter `heart_rate.sample_time.physical_time >= "<RFC3339>" AND heart_rate.sample_time.physical_time < "<RFC3339>"`, `pageSize=10000`, page via `pageToken`/`nextPageToken`; bpm is a string in `heartRate.beatsPerMinute`, time in `heartRate.sampleTime.physicalTime`.
- Exercise `GET /users/me/dataTypes/exercise/dataPoints`, filter `exercise.interval.civil_start_time >= "YYYY-MM-DD" AND exercise.interval.civil_start_time < "YYYY-MM-DD"`, `pageSize=25`; keep `exercise.exerciseType === "SHOOTING"`; interval in `exercise.interval.startTime` / `endTime`.
- Identity: `GET /users/me/identity`; HTTP 400 with reason `ACCOUNT_NOT_LINKED` means the Google Health app was never signed in.
- Token endpoint `https://oauth2.googleapis.com/token`; revoke `https://oauth2.googleapis.com/revoke`; auth URL `https://accounts.google.com/o/oauth2/v2/auth` with `access_type=offline`, `prompt=consent`.
- Env vars: `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_TOKEN_KEY` (32 bytes, base64), `GOOGLE_HEALTH_STATE_SECRET`.
- Window numbers: fetch margin ±20 min around the match window; fetch range capped at 6 h centered on the match window; report match view = shots ±1 min (unchanged); "Pre i posle meča" toggle hidden when the full range adds < 1 min on both sides.
- Coach rule: a coach (caller ≠ shooter, `coach_of(shooter)` true) may use only shot times or a `SHOOTING` workout as the match window; `startedAt`/`endedAt` are ignored for coaches. With `trainingId`, all times come from the database and client-sent times are ignored.
- Raw samples and tokens are never logged. Refresh tokens are only ever read by server code using the service-role client.
- Migration file: `supabase/migrations/0029_google_health.sql` (0025–0028 are taken). Migrations are applied manually by the owner; the code must not assume it ran before deploy beyond the new feature (pages must still render if `health_link_status` is missing: treat an RPC error as `'none'`).
- UI copy is Serbian Latin, added to `src/lib/i18n/sr.ts` (new `sr.googleHealth` block); exact strings below where the spec fixes them.
- Work on branch `feature/google-health`; pushing `main` auto-deploys production, so do not push or merge without the owner.

## Review Focus

1. **Watch not synced yet / partial data** — Google returns fewer points than the window: pull still succeeds with what exists, form shows the existing coverage line; zero points → `no_data` message. Test: Task 5 `partial data still builds a TCX`.
2. **Civil date vs UTC date of the workout** — a training at 00:30 local is the previous UTC day; listing `date-1 .. date+1` must find it. Test: Task 5 `finds a workout whose UTC date differs from the training date`.
3. **Coach link ends between page load and click** — route re-checks `coach_of`, answers 403, form shows a plain error, not a crash. Test: Task 5 auth matrix + Task 7 `shows error on 403`.
4. **Connection revoked at Google** (user removed access in their Google account) — refresh returns `invalid_grant`: mark `broken_at`, respond `reconnect`, `/nalog` shows reconnect state. Test: Task 5 `invalid_grant marks link broken`.
5. **Pull after SCATT is added later / pulled twice** — second pull replaces the first TCX just like a new upload (existing sha-based replacement), never two TCX files on one training. Test: Task 7 `second pull replaces the loaded pulse`.

---

### Task 1: Window choice (pure)

**Files:**
- Create: `src/lib/googleHealth/window.ts`
- Test: `tests/googleHealth/window.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Span { fromMs: number; toMs: number }
  export interface Workout { id: string; startMs: number; endMs: number }
  export interface WindowInput {
    shots: Span | null;            // first..last shot time, any source
    workouts: Workout[];           // SHOOTING workouts near the date
    training: Span | null;         // started_at..ended_at
    isCoach: boolean;
  }
  export type WindowResult =
    | { ok: true; match: Span; fetch: Span; workout: Workout | null; source: 'shots' | 'workout' | 'training' }
    | { ok: false; error: 'no_window' };
  export const MARGIN_MS = 20 * 60_000;
  export const MAX_FETCH_MS = 6 * 3_600_000;
  export function chooseWindows(input: WindowInput): WindowResult;
  ```

Rules (from spec): match = shots → else workout (several: the one overlapping `training`, else the longest) → else training (only when `!isCoach`) → else `no_window`. The chosen-or-overlapping workout is the one overlapping `match` (or the match-defining one). fetch = union(match ± MARGIN, overlapping workout, training if `!isCoach`); if longer than MAX_FETCH_MS, clamp to MAX_FETCH_MS centered on the match midpoint.

- [ ] **Step 1: Write failing tests** — cases with exact expectations:
  - `shots win over workout and training`: shots 10:00–11:00, workout 09:30–11:30, training 09:00–12:00, shooter → `source:'shots'`, match 10:00–11:00, fetch 09:00–12:00.
  - `workout when no shots`: → `source:'workout'`, match = workout, fetch = workout ±20 min ∪ training.
  - `two workouts: picks the one overlapping training, else the longest`.
  - `training only for shooter`: → `source:'training'`.
  - `coach cannot use training times`: same input with `isCoach:true` → `{ok:false,error:'no_window'}`; and coach fetch never includes training span when shots exist (shots 10:00–11:00, training 06:00–12:00 → fetch 09:40–11:20).
  - `nothing → no_window`.
  - `caps at 6 h centered on match`: shots 12:00–12:10, training 00:00–23:59 → fetch length exactly 6 h, centered on 12:05.
- [ ] **Step 2: Run** `npx vitest run tests/googleHealth/window.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `chooseWindows`** in `src/lib/googleHealth/window.ts`.
- [ ] **Step 4: Run** same command → PASS.
- [ ] **Step 5: Commit** `feat(google-health): choose match and fetch windows`.

### Task 2: TCX builder

**Files:**
- Create: `src/lib/googleHealth/tcx.ts`
- Test: `tests/googleHealth/tcx.test.ts`

**Interfaces:**
- Consumes: `HrSample` from `src/lib/parsers/tcx.ts`; `parseTcx` (test only).
- Produces: `export function buildTcx(samples: HrSample[]): string` and `export function tcxFileName(firstMs: number, tz: string): string` → `google-health-YYYY-MM-DD-HHmm.tcx` in the given zone.

Structure: `TrainingCenterDatabase` (TCD v2 namespace) → `Activities/Activity Sport="Other"` with `Id` = first sample time → one `Lap StartTime=` first time → `Track` → per sample `Trackpoint{ Time (ISO UTC, ms precision, Z), HeartRateBpm{ Value } }`. Samples sorted by time, duplicates by time dropped.

- [ ] **Step 1: Failing tests**: `round trip`: 3 samples → `parseTcx(buildTcx(s))` gives the same `{tMs,bpm}` list and `missingOffset === false`; `sorts and drops duplicate times`; `empty input throws`; `tcxFileName(Date.UTC(2026,10,13,15,13), 'Europe/Belgrade') === 'google-health-2026-11-13-1613.tcx'`.
- [ ] **Step 2: Run** `npx vitest run tests/googleHealth/tcx.test.ts` → FAIL.
- [ ] **Step 3: Implement** (string building; escape nothing beyond numbers/ISO, no user text goes in).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(google-health): build TCX from heart-rate samples`.

### Task 3: Token crypto and OAuth state

**Files:**
- Create: `src/lib/googleHealth/crypto.ts`, `src/lib/googleHealth/state.ts`
- Test: `tests/googleHealth/crypto.test.ts`, `tests/googleHealth/state.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // crypto.ts — AES-256-GCM, output "iv:tag:ciphertext" each base64; key = base64 32 bytes
  export function encryptToken(plain: string, keyB64: string): string;
  export function decryptToken(sealed: string, keyB64: string): string; // throws on tamper/wrong key
  // state.ts — HMAC-SHA256 over base64url JSON {userId, nonce, exp}
  export function signState(p: { userId: string; nonce: string; exp: number }, secret: string): string;
  export function verifyState(state: string, secret: string, expect: { userId: string; nonce: string; now: number }): boolean;
  ```
- [ ] **Step 1: Failing tests**: round trip; two encryptions of same text differ; flipped ciphertext byte throws; wrong key throws; key not 32 bytes throws. State: valid → true; expired (`now > exp`) → false; other userId → false; other nonce → false; tampered payload → false (constant-time compare via `timingSafeEqual`).
- [ ] **Step 2: Run** `npx vitest run tests/googleHealth/crypto.test.ts tests/googleHealth/state.test.ts` → FAIL.
- [ ] **Step 3: Implement** with `node:crypto`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(google-health): token encryption and signed OAuth state`.

### Task 4: Google Health client

**Files:**
- Create: `src/lib/googleHealth/client.ts`
- Test: `tests/googleHealth/client.test.ts`

**Interfaces:**
- Produces (all take an injectable `fetchFn: typeof fetch` as last param, default global `fetch`):
  ```ts
  export const SCOPES: readonly [string, string];
  export class GoogleHealthError extends Error { constructor(public code: 'invalid_grant' | 'not_linked' | 'unavailable' | 'http', public status?: number) }
  export function authUrl(o: { clientId: string; redirectUri: string; state: string }): string;
  export function exchangeCode(o: { clientId; clientSecret; redirectUri; code: string }, fetchFn?): Promise<{ refreshToken: string; accessToken: string; scope: string }>;
  export function refreshAccessToken(o: { clientId; clientSecret; refreshToken: string }, fetchFn?): Promise<string>;
  export function revokeToken(token: string, fetchFn?): Promise<void>;          // never throws
  export function getIdentity(accessToken: string, fetchFn?): Promise<{ healthUserId: string }>;
  export function listShootingWorkouts(accessToken: string, fromDate: string, toDateExclusive: string, fetchFn?): Promise<Workout[]>;
  export function listHeartRate(accessToken: string, span: Span, fetchFn?): Promise<HrSample[]>;
  ```
  (`Workout`, `Span` from Task 1; `HrSample` from `src/lib/parsers/tcx.ts`.)

Behavior: 429/5xx retried up to 3 times with backoff (100 ms × 2^n; make the delay injectable or use fake timers) then `GoogleHealthError('unavailable')`; token endpoint `error: "invalid_grant"` → `GoogleHealthError('invalid_grant')`; identity 400 whose body contains `ACCOUNT_NOT_LINKED` → `'not_linked'`; pagination follows `nextPageToken` (cap 50 pages); filters URL-encoded via `URLSearchParams`; workout id = last segment of `dataPoint.name`; heart-rate points with non-finite time or bpm skipped.

- [ ] **Step 1: Failing tests** with a fake `fetchFn` recording URLs: `authUrl has both scopes, offline, consent, state`; `listHeartRate follows two pages and sends the exact filter`; `retries 429 then succeeds`; `gives up after 3 → unavailable`; `refresh invalid_grant → GoogleHealthError invalid_grant`; `identity ACCOUNT_NOT_LINKED → not_linked`; `listShootingWorkouts keeps only SHOOTING and parses id`.
- [ ] **Step 2: Run** `npx vitest run tests/googleHealth/client.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(google-health): API client`.

### Task 5: Migration, pull orchestration and pull route

**Files:**
- Create: `supabase/migrations/0029_google_health.sql`, `src/lib/googleHealth/pull.ts`, `src/app/api/google-health/pulse/route.ts`
- Test: `tests/googleHealth/pull.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  ```ts
  export type PullInput =
    | { trainingId: string }
    | { shooterId: string; date: string; shotSpan?: Span | null; startedAt?: string | null; endedAt?: string | null };
  export interface PullDeps {
    callerId: string | null;                       // signed-in active user, null otherwise
    isCoachOf(shooterId: string): Promise<boolean>; // rpc coach_of with the caller's client
    loadTraining(id: string): Promise<{ shooterId: string; date: string; shotSpan: Span | null; training: Span | null } | null>; // caller's client (RLS = can_see_training)
    loadLink(shooterId: string): Promise<{ refreshTokenEnc: string; brokenAt: string | null } | null>; // admin client
    markBroken(shooterId: string): Promise<void>;
    touch(shooterId: string): Promise<void>;
    decrypt(sealed: string): string;
    google: { refresh(rt: string): Promise<string>; workouts(at: string, from: string, to: string): Promise<Workout[]>; heartRate(at: string, span: Span): Promise<HrSample[]> };
    tz: string;                                     // for the file name: viewer's zone
  }
  export type PullResult =
    | { status: 200; tcx: string; fileName: string; workout: Workout | null; range: Span; source: 'shots' | 'workout' | 'training' }
    | { status: 401 | 403 | 404 | 409 | 422 | 503; error: 'unauthorized' | 'forbidden' | 'not_found' | 'no_data' | 'not_connected' | 'reconnect' | 'no_window' | 'google_unavailable' };
  export function pullPulse(input: PullInput, deps: PullDeps): Promise<PullResult>;
  ```

Migration `0029_google_health.sql` (write in the style of `0024_inbox.sql`, comment header in English):
- table `google_health_links` with columns exactly as the spec table (`user_id` PK → `profiles(id)` on delete cascade, `refresh_token_enc text not null`, `health_user_id text`, `scopes text not null`, `connected_at timestamptz not null default now()`, `last_used_at timestamptz`, `broken_at timestamptz`);
- `enable row level security`; `revoke all ... from anon, authenticated`; no policies (service role only);
- `create function health_link_status(sid uuid) returns text language sql stable security definer set search_path = public` → `'none'` unless `is_active() and (sid = auth.uid() or coach_of(sid))`, then `'broken'` if `broken_at` not null, `'ok'` if row exists, else `'none'`; `grant execute ... to authenticated`;
- a comment noting the coach exception to the `0002_rls.sql:79` rule ("Google Health pulse: a coach may pull for a training frame without a share, owner decision 2026-11-15").

Flow of `pullPulse`: no caller → 401; resolve shooter/date/spans (trainingId → `loadTraining`, null → 404; client-sent times ignored); `isCoach = callerId !== shooterId`; if coach and `!(await isCoachOf(shooterId))` → 403; link missing → 409 `not_connected`; `brokenAt` → 409 `reconnect`; refresh (`invalid_grant` → `markBroken` + 409 `reconnect`; `unavailable` → 503); workouts for `date-1 .. date+2` (exclusive end, civil); `chooseWindows` (`no_window` → 422); heart rate for `fetch`; empty → 404 `no_data`; `buildTcx`; `touch`; 200.

Route `POST /api/google-health/pulse`: parse JSON body (validate uuid / `YYYY-MM-DD` / numbers; bad → 400), build deps from `createClient()` (caller; `getUser`, `is_active` via profile status) and `createAdminClient()`; `NextResponse.json(result, { status })`. No samples in logs.

- [ ] **Step 1: Failing tests** (fake deps):
  - auth matrix: no caller 401; shooter self 200; coach of shooter 200; coach not linked 403; unrelated user 403.
  - `trainingId ignores client times`: deps.loadTraining returns shots; result range derived from them.
  - `coach with only training times → 422 no_window`.
  - `not_connected 409`, `brokenAt → reconnect 409`.
  - `invalid_grant marks link broken` (markBroken called once, 409 reconnect).
  - `unavailable → 503 google_unavailable`.
  - `no samples → 404 no_data`; `partial data still builds a TCX` (samples only in first half of window → 200).
  - `finds a workout whose UTC date differs from the training date`: date `2026-11-14`, workout 2026-11-13T23:40Z–2026-11-14T00:50Z, no shots → source `workout`; assert `google.workouts` called with `'2026-11-13'`, `'2026-11-16'`.
  - `touch` called on success only.
- [ ] **Step 2: Run** `npx vitest run tests/googleHealth/pull.test.ts` → FAIL.
- [ ] **Step 3: Implement `pullPulse`, the migration and the route.**
- [ ] **Step 4: Run** → PASS; also `npx tsc --noEmit` → no errors.
- [ ] **Step 5: Commit** `feat(google-health): pull route and link storage`.

### Task 6: Connect / disconnect, account panel, privacy policy

**Files:**
- Create: `src/lib/googleHealth/connect.ts`, `src/app/api/google-health/connect/route.ts`, `src/app/api/google-health/callback/route.ts`, `src/app/api/google-health/disconnect/route.ts`, `src/app/(app)/nalog/GoogleHealthPanel.tsx`
- Modify: `src/app/(app)/nalog/page.tsx` (render panel for shooters, next to `InboxTokenPanel`), `src/components/PrivacyPolicy.tsx`, `src/lib/i18n/sr.ts`
- Test: `tests/googleHealth/connect.test.ts`, `tests/components/googleHealthPanel.test.tsx`

**Interfaces:**
- Consumes: Tasks 3, 4; `health_link_status` (Task 5).
- Produces:
  ```ts
  export type ConnectOutcome = 'ok' | 'scopes' | 'not_linked' | 'state' | 'error';
  export function completeConnect(
    q: { code: string | null; state: string | null; error: string | null },
    deps: { userId: string | null; nonce: string | null; now: number; stateSecret: string;
            exchange(code: string): Promise<{ refreshToken: string; accessToken: string; scope: string }>;
            identity(accessToken: string): Promise<{ healthUserId: string }>;
            save(row: { userId: string; refreshTokenEnc: string; healthUserId: string; scopes: string }): Promise<void>;
            encrypt(plain: string): string },
  ): Promise<ConnectOutcome>;
  export function GoogleHealthPanel(props: { status: 'none' | 'ok' | 'broken'; connectedAt: string | null; flash: ConnectOutcome | null }): JSX.Element;
  ```

Routes: `connect` (GET) requires active signed-in user, sets httpOnly `gh_nonce` cookie (10 min, `sameSite=lax`, `secure` in production, path `/api/google-health`), signs state `{userId, nonce, exp: now+10 min}`, redirects to `authUrl` with redirect URI `${siteUrl() ?? origin}/api/google-health/callback`. `callback` (GET) runs `completeConnect`, clears the cookie, redirects to `/nalog?gh=<outcome>`; saves via admin client upsert (clears `broken_at`, sets `connected_at=now()`). `disconnect` (POST, form action from the panel) decrypts and revokes (ignore failure), deletes the row, redirects `/nalog?gh=off`. Connected-at for the panel comes from a tiny admin read in the page (shooter's own row only; never the token).

Panel copy (`sr.googleHealth`): title `Google Health (puls)`; `none` → button `Poveži Google Health` + hint `Pre povezivanja se prijavi u Google Health aplikaciju na telefonu. Dok aplikacija nije verifikovana, Google će prikazati upozorenje „unverified app“ — izaberi Advanced → Continue.`; `ok` → `Povezano od {datum}` + button `Prekini vezu`; `broken` → `Veza je istekla ili je opozvana.` + `Poveži ponovo`. Flash: `ok` `Google Health je povezan.`; `scopes` `Potrebno je odobriti oba pristupa (puls i aktivnosti).`; `not_linked` `Google nalog nije povezan sa Google Health aplikacijom. Prijavi se u aplikaciju na telefonu, pa pokušaj ponovo.`; `state`/`error` `Povezivanje nije uspelo. Pokušaj ponovo.`; `off` `Veza sa Google Health je prekinuta.`.

Privacy policy: remove the `location.readonly` item; add the coach exception (pulse for a training's frame — shots or a Shooting workout, ±20 min — without a separate share, once the shooter connects); only that range (max 6 h) is read and stored as a file on the training; disconnecting stops future pulls, already saved pulse stays until the training is deleted.

- [ ] **Step 1: Failing tests**: `completeConnect`: Google `error` param → `'error'`; bad/expired state or missing nonce → `'state'`; granted scope string missing activity scope → `'scopes'` (save not called); identity throws `not_linked` → `'not_linked'`; happy path → `'ok'`, save called once with encrypted token (not the plain one). Panel: renders each status's button/text; flash `scopes` shows its message.
- [ ] **Step 2: Run** `npx vitest run tests/googleHealth/connect.test.ts tests/components/googleHealthPanel.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `completeConnect`, the three routes, the panel, page wiring, copy, privacy text.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(google-health): connect account and privacy text`.

### Task 7: "Povuci puls sa Google Health" in the training form

**Files:**
- Modify: `src/components/NewTrainingForm.tsx` (HR `SourceCard` near line 771; new prop), `src/app/(app)/trening/novi/page.tsx`, `src/app/(app)/strelci/[shooterId]/novi/page.tsx`, `src/app/(app)/trening/[id]/podaci/page.tsx`, `src/lib/i18n/sr.ts`
- Create: `src/lib/googleHealth/useHealthPull.ts` (client hook calling the route)
- Test: `tests/components/newTraining.test.tsx` (extend)

**Interfaces:**
- Consumes: route from Task 5 (`POST /api/google-health/pulse`, body `PullInput`, response `PullResult`).
- Produces: new `NewTrainingForm` prop `healthStatus?: 'none' | 'ok' | 'broken'` (default `'none'`); pages read it with `supabase.rpc('health_link_status', { sid: shooterId })`, RPC error → `'none'`.

Behavior: button `Povuci puls sa Google Health` in the HR card when `healthStatus === 'ok'`, disabled without a date or while pulling (`Povlačim puls…`). Body: edit mode → `{ trainingId: edit.trainingId }`; else `{ shooterId: userId, date: trainedOn, shotSpan: first..last shot time of whatever shots are loaded (SCATT or SIUS), startedAt, endedAt }` (from `timeFrom`/`timeTo` in `venueTz`). On 200: `addHr(new File([tcx], fileName, { type: 'application/xml' }))`, then status line `Puls povučen sa Google Health: {HH:mm}–{HH:mm}` (range in `venueTz`) and, if `workout`, `Pronađena vežba Shooting {HH:mm}–{HH:mm}`; if `timeFrom`/`timeTo` empty and a workout came back, prefill them (still editable). `broken` status → text `Veza sa Google Health je istekla — strelac treba ponovo da je poveže.` (shooter also gets a link to `/nalog`). Errors → `errors.hr`: `not_connected` `Strelac nije povezao Google Health.`; `reconnect` same as broken text; `no_window` `Učitaj SCATT ili upiši vreme treninga.` (coach: `Učitaj SCATT ili sačekaj vežbu Shooting sa sata.`); `no_data` `Google Health nema puls za ovo vreme — da li je sat sinhronizovan?`; `forbidden` `Nemaš pristup pulsu ovog strelca.`; `google_unavailable`/other `Google Health trenutno nije dostupan. Pokušaj kasnije.`.

- [ ] **Step 1: Failing tests** (mock `fetch`): `shows the pull button only when status is ok`; `sends trainingId in edit mode and shot span otherwise`; `loads the pulled TCX like an upload` (loaded line shows `google-health-…tcx` and sample count); `prefills empty times from the workout`; `second pull replaces the loaded pulse` (sample count updates, one file); `shows error on 403` (forbidden text); `no_data message`.
- [ ] **Step 2: Run** `npx vitest run tests/components/newTraining.test.tsx` → new tests FAIL.
- [ ] **Step 3: Implement** hook, button, copy, page props.
- [ ] **Step 4: Run** → PASS, plus full `npm test`.
- [ ] **Step 5: Commit** `feat(google-health): pull pulse from the training form`.

### Task 8: Report — full range toggle and no-shot-time fallback

**Files:**
- Modify: `src/lib/report/derive.ts` (new function), `src/app/(app)/trening/[id]/page.tsx:101`, `src/components/report/ReportWorkspace.tsx` (prop `hr.window` → `hr.windows`), `src/components/report/useHrSamples.ts`, `src/components/report/HrPanel.tsx`, `src/lib/report/charts.ts` (`hrOption` muted area), `src/lib/import/saveTraining.ts:93` (`hrAverage`), `src/lib/i18n/sr.ts`
- Test: `tests/report/derive.test.ts`, `tests/import/saveTraining.test.ts`, `tests/components/report.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // derive.ts
  export function hrWindows(
    shotTimes: (number | null | undefined)[],
    training: { startedAt: string | null; endedAt: string | null },
    file: { firstMs: number; lastMs: number } | null,
  ): { match: Span | null; full: Span | null };
  ```
  `match` = shots ±1 min → else training span → else whole file → else null. `full` = whole file or null.
- The page calls `hrWindows(shotTimes, training, null)` (it cannot know the file range) and passes `match` (may be null). `useHrSamples(tcxPath, offsetMs, match: Span | null, zone, showFull: boolean)` parses the file, calls `hrWindows` again with the parsed file range (offset applied) to fill `full` and the whole-file fallback for a null `match`, and returns the same `HrState` plus `fullAvailable: boolean` (full extends match by ≥ 1 min on either side). `HrState` becomes `'none'` only when there is no file.
- `hrOption(samples, view, sel, tz, matchSpan?: Span)` → when `matchSpan` given and samples extend beyond it, add ECharts `markArea` greying the parts outside.

Behavior: toggle `Pre i posle meča` (switch, off by default) in `HrPanel` header, shown only when `fullAvailable`; on → samples from `full`, muted outside match; the timeline chart keeps using match samples. `hrAverage`: when there is no match or its shots have no times, average over `started_at..ended_at`, else over all samples (draft carries `startedAt`/`endedAt` already as training times — use those).

- [ ] **Step 1: Failing tests**: `hrWindows` 4 fallback levels; `hrAverage` with untimed shots uses training span, then whole file; report component: toggle hidden when file equals match window, shown when file has 20 min extra, toggling renders more points (assert on the option passed to the chart mock as other report tests do).
- [ ] **Step 2: Run** `npx vitest run tests/report/derive.test.ts tests/import/saveTraining.test.ts tests/components/report.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; full `npm test`; `npm run lint`; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(report): pulse before and after the match`.

### Task 9: Owner hand-off and manual check

**Files:**
- Modify: `docs/supabase-setup.md` (section "Google Health": env vars, redirect URIs, consent scopes, migration 0029)
- Delete: nothing (spike stays local and gitignored; owner decides)

- [ ] **Step 1:** Write the doc section: set the 4 env vars in Vercel + `.env.local` (generate key: `openssl rand -base64 32`), add redirect URIs `https://<prod>/api/google-health/callback` and `http://localhost:3000/api/google-health/callback`, remove `location.readonly` from Data Access, apply `0029_google_health.sql`.
- [ ] **Step 2:** With the owner (after they set env + migration locally): run dev server, connect on `/nalog`, open a training from 2026-11-13 with SCATT, pull, confirm 1–3 s samples, toggle "Pre i posle meča"; as a coach account, pull for the linked shooter.
- [ ] **Step 3: Commit** `docs: Google Health setup`.
