# SIUS Cloud Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick a private SIUS Cloud exercise or the owner's own public competition performance inside the new
training form, with stored (encrypted) SIUS credentials, decimals next to whole 3x20 values, and sighters shown as
"Proba" rows.

**Architecture:** Server-only SIUS client (`src/lib/sius/`) does the hosted-form login, token refresh/re-login with
limits, and calls the Training Center and Result Service APIs. Server actions expose it to a new `SiusCloudTab` in
the form and a `SiusPanel` on `/nalog`. SIUS JSON is mapped to the existing `ParsedSiusResult`, so the save,
alignment and report paths are reused; the database gains `shots.value_decimal`, a `sighter_shots` table and SIUS
metadata on `source_files`.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing route/action code, see
AGENTS.md), TypeScript, Supabase (Postgres + RLS + Storage), Vitest + Testing Library, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-11-15-sius-cloud-import-design.md`. Research with exact endpoints, payloads
and shot format: `docs/research/sius-cloud-api.md`. Working login reference: `scripts/sius-spike/login-test.mjs`.

## Global Constraints

- SIUS hosts: auth `https://shootingsportscloud.com:8597`, Training Center `https://shootingsportscloud.com:8598`,
  Result Service `https://shootingsportscloud.com:8594/api/v1`.
- Client id `0b659819-8568-4a56-b800-0e5981130a0c`; redirect URI `https://shootingsportscloud.com:443/login-callback`;
  scope `openid offline_access`; PKCE S256.
- Coordinates `"x/y"` in mm, +x right, +y up. `timeStamp` is UTC.
- Encryption: AES-256-GCM, sealed text `v1:iv:tag:ciphertext` (base64 parts), key env `SIUS_CRED_KEY` (32 bytes,
  base64). Missing key → feature reports `not_configured`, never stores plaintext.
- Login limits: after one "Invalid login credentials" the stored password is cleared and never retried; at most
  3 password logins per user per hour; at most 30 password logins per hour across all users. Refresh calls are not
  limited.
- SIUS call timeout 10 s; one retry on network/5xx, then `unavailable`.
- Never log, return or render passwords, tokens or SIUS response bodies; log only status codes and error kind.
- All `src/lib/sius/*` except pure modules (`map.ts`, `pick.ts`, `sighters` helpers) start with `import 'server-only'`.
- Access rule for private exercises: `shooterId = auth.uid()` or `coach_of(shooterId)`; connect/disconnect only for
  self. Competition data needs no connection.
- 3x20 (`50m Rifle 3x*`): `value` = whole official value, `valueDecimal` = decimal. Air, prone program and finals:
  `value` = decimal.
- Sighters never count in totals, stats or alignment-dependent figures.
- Serbian UI strings go in `src/lib/i18n/sr.ts`; tab label `SIUS Cloud`, sub-tabs `Trening` / `Takmičenje`, row
  label `Proba`, position control label `Stavovi`.
- Migrations are run by hand by the owner; the new migration takes the next free number (`0030_sius_cloud.sql` at
  time of writing).

## Review Focus

- SIUS answers a login with an unexpected page (layout change, CAPTCHA, extra step that needs input): the user gets
  "SIUS blokirao prijavu" style state `blocked`, nothing crashes, the stored password is kept but not auto-retried.
  → Task 5 test `unknown page → blocked`.
- Aborted or tiny exercises (the owner's list has 2-, 3-, 6- and 9-shot exercises, some with only sighters): the
  list row shows the match-shot count so the owner can skip them; if one is picked anyway the mapper returns a valid
  result with zero or few series and nothing crashes. → Task 3 test `exercise with sighters only`, Task 11 test
  `row shows shot count`.
- Unfinished prone program with a repeated position (46 shots, klečeći `1-25, 41-46`, ležeći `26-40`): series
  10, 10, 5 kneeling, 10, 5 prone, 6 kneeling; totals equal the sum of all 46 values; an unassigned or doubled shot
  blocks apply with the shot numbers named. → Task 3 tests `ranges with repeated position, unfinished`,
  `ranges reject overlap and gaps`.
- Competition whose part starts near midnight UTC (Doha WCh qualification `2026-10-31T21:00:00Z`, zone
  `Asia/Qatar`): the session date becomes 1 Nov. → Task 8 test `part date in competition time zone`.
- Owner not in the part's results, or no `sius_athlete_id` yet: message "Nisi pronađen…" and the searchable ranking
  list; no row is auto-picked on a partial name; a picked row is confirmed only after its pulled result is shown. → Task 8 test `findMyRow without id never guesses on partial
  name`, Task 11 test `not found shows message and list`.
- Owner already typed a session name, then picks a competition: the typed name stays; an empty name gets
  "<competition> <discipline> <part>". → Task 11 test `competition pick fills only empty name`.

---

### Task 1: Secret box

**Files:**
- Create: `src/lib/crypto/secretBox.ts`
- Test: `tests/sius/secretBox.test.ts`

**Interfaces:**
- Produces: `seal(plain: string, keyB64: string): string`, `open(sealed: string, keyB64: string): string`,
  `siusKey(): string | null` (reads `SIUS_CRED_KEY`, returns null when unset or not 32 bytes).

- [ ] **Step 1: Write the failing tests**

```ts
const key = Buffer.alloc(32, 7).toString('base64');
it('round trips', () => expect(open(seal('pw', key), key)).toBe('pw'));
it('uses v1 prefix and a fresh IV', () => {
  const a = seal('pw', key), b = seal('pw', key);
  expect(a.startsWith('v1:')).toBe(true); expect(a).not.toBe(b);
});
it('rejects tampering', () => { const s = seal('pw', key); expect(() => open(s.slice(0, -2) + 'AA', key)).toThrow(); });
it('rejects wrong key', () => expect(() => open(seal('pw', key), Buffer.alloc(32, 8).toString('base64'))).toThrow());
it('siusKey is null for a 16-byte key', () => { vi.stubEnv('SIUS_CRED_KEY', Buffer.alloc(16).toString('base64')); expect(siusKey()).toBeNull(); });
```

- [ ] **Step 2: Run** `npx vitest run tests/sius/secretBox.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `src/lib/crypto/secretBox.ts`, same cipher use as `src/lib/googleHealth/crypto.ts`
  plus the `v1:` prefix (Google Health stays on its own module).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): AES-GCM secret box for SIUS credentials`.

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/0030_sius_cloud.sql`

**Interfaces:**
- Produces (SQL): table `sius_links` (columns exactly as in the spec table plus `updated_at timestamptz not null
  default now()`), table `sius_login_attempts (id bigint identity pk, user_id uuid not null, at timestamptz not null
  default now())` with index on `(at)`, function `sius_link_status(sid uuid) returns jsonb`
  (`{"state":"none"|"ok"|"broken","reason":text|null,"email":text|null}`; email only when `sid = auth.uid()`;
  `none` unless `is_active() and (sid = auth.uid() or coach_of(sid))`), column `profiles.sius_athlete_id text`
  (`grant update (sius_athlete_id) on profiles to authenticated`), enum value `source_kind 'sius_cloud'`, columns
  `source_files.external_id text, first_shot_at timestamptz, shot_count int` with partial index on `external_id`,
  column `shots.value_decimal numeric(4,1)`, table `sighter_shots` (spec columns incl. `before_series int not null`; unique
  `(match_id, idx)`; RLS policy mirroring `shots_all` in `0002_rls.sql:153` through the match's training),
  and `insert_training_parts(tid, payload)` redefined from `0018_replace_training_data.sql` to also write
  `shots.value_decimal` (`sh ->> 'value_decimal'`) and `match.sighters` (`[{before_series, position, shots:[{idx,
  value,value_decimal,inner,x,y,t_ms}]}]`, `idx` running across the whole match) into `sighter_shots`.
- `sius_links` and `sius_login_attempts`: RLS on, `revoke all from anon, authenticated`, grants to `service_role`
  (see `0029_google_health.sql` comment about 0026).

- [ ] **Step 1: Write the migration** following `0029_google_health.sql` style (header comment with owner decisions:
  stored password, coach may import, sighters table instead of a flag).
- [ ] **Step 2: Check** `alter type … add value` is not used in the same transaction as a statement that uses
  `'sius_cloud'` (Postgres restriction); if needed, nothing in this file references the new value.
- [ ] **Step 3: Owner runs it** in the Supabase SQL editor (staging/prod as usual); record the result in the
  task's report. Builder cannot run it.
- [ ] **Step 4: Commit** `feat(sius): schema for SIUS links, decimals, sighters, source metadata`.

### Task 3: Types and SIUS → ParsedSiusResult mapping

**Files:**
- Modify: `src/lib/domain/types.ts` (add `ParsedShot.valueDecimal?: number`, `ParsedSighterGroup`,
  `ParsedSiusResult.sighters?: ParsedSighterGroup[]`)
- Create: `src/lib/sius/types.ts` (raw response types: `SiusShot`, `SiusShotGroup`, `SiusShotsResponse`
  (`type: 'SingleStage'|'MultiStage'`, `sightingShots?`, `competitionGroups?`, `stageResults?: {stageName: string;
  sightingShots?: SiusShotGroup[]; competitionGroups: SiusShotGroup[]}[]`), `SiusExercise` (list item fields from the
  research doc))
- Create: `src/lib/sius/map.ts`
- Create: `tests/fixtures/sius/` hand-written JSON in the documented format: `air-60-sighters.json` (4 sighters,
  6×10 shots), `rifle-3x20.json` (MultiStage, 3 stages, sighters per stage, `scores ["10x","10.6"]`),
  `prone-60.json` (SingleStage, 3 sighters, 60 decimal shots, times increasing), `sighters-only.json`, and
  `public-final.json` (copy of the real Doha final response for SHENG Lihao from the research curl, public data).
- Test: `tests/sius/map.test.ts`

**Interfaces:**
- Produces:
  - `type ParsedSighterGroup = { beforeSeries: number; position?: Position; shots: ParsedShot[] }`
    (`beforeSeries` = idx of the match series the group precedes)
  - `disciplineFromSiusName(name: string): DisciplineId | undefined` (`10m Air Rifle*` → air_rifle, `10m Air
    Pistol*` → air_pistol, `50m Rifle 3x*` and `50m Rifle Prone*` → smallbore_3p; case-insensitive; also matches
    Result Service event names like `10m AIR RIFLE MEN`)
  - `isProneProgram(name: string): boolean`
  - `mapSiusShots(raw: SiusShotsResponse, meta: { name: string; final?: boolean }): ParsedSiusResult`
  - `type ProneRanges = { kneeling: string; prone: string; standing: string }` (raw field text)
  - `defaultProneRanges(shotCount: number): ProneRanges` (60 → `1-20`/`21-40`/`41-60`, otherwise all `''`)
  - `parseProneRanges(ranges: ProneRanges, shotCount: number): { ok: true; positions: (Position | null)[] } |
    { ok: false; error: 'syntax' | 'out_of_range' | 'overlap' | 'unassigned'; shots: number[] }`
    (`positions[i]` for shot i+1; accepts `1-25, 41-60`, single numbers, spaces, `;`; all three empty → ok with
    all `null`; `shots` names the offending shot numbers)
  - `splitByPositions(r: ParsedSiusResult, positions: (Position | null)[]): ParsedSiusResult` (series rebuilt in
    shooting order, each run of one position cut into 10s from the run start; sighters re-placed by time)
  - `firstShotAt(r: ParsedSiusResult): Date | undefined`, `matchShotCount(r: ParsedSiusResult): number`

- [ ] **Step 1: Write the failing tests** (values from the fixtures):

```ts
it('air: decimal values, x/y, tMs, 6 series, sighters', () => {
  const r = mapSiusShots(air, { name: '10m Air Rifle' });
  expect(r.disciplineId).toBe('air_rifle');
  expect(r.series).toHaveLength(6);
  expect(r.series[0].shots[0]).toMatchObject({ value: 10.7, x: -0.08, y: 0.63, tMs: Date.parse('2026-08-19T08:36:52.59Z') });
  expect(r.sighters?.[0].shots).toHaveLength(4);
  expect(r.reportTime?.toISOString()).toBe(/* last shot time in fixture */);
});
it('3x20: whole value + decimal, positions, 2 series per position, sighters per position', () => {
  const r = mapSiusShots(x320, { name: '50m Rifle 3x20' });
  expect(r.series.map((s) => s.position)).toEqual(['kneeling','kneeling','prone','prone','standing','standing']);
  expect(r.series[0].shots[0]).toMatchObject({ value: 10, inner: true, valueDecimal: 10.6 });
  expect(r.sighters?.map((g) => g.position)).toEqual(['kneeling','prone','standing']);
});
it('score strings with spaces parse ("  9.9")', ...);
it('exercise with sighters only → 0 series, sighters kept', ...);
it('public final: 24 decimal shots, no sighters', ...);
it('air sighters precede series 1; 3x20 sighters precede 1, 3, 5', () => {
  expect(mapSiusShots(air, { name: '10m Air Rifle' }).sighters?.map((g) => g.beforeSeries)).toEqual([1]);
  expect(mapSiusShots(x320, { name: '50m Rifle 3x20' }).sighters?.map((g) => g.beforeSeries)).toEqual([1, 3, 5]);
});
it('prone 60 with default ranges → 6 series of 10 with positions, decimals kept, sighters by time', () => {
  const base = mapSiusShots(prone, { name: '50m Rifle Prone' });
  const p = parseProneRanges(defaultProneRanges(60), 60);
  const r = splitByPositions(base, p.ok ? p.positions : []);
  expect(r.series.map((s) => s.position)).toEqual(['kneeling','kneeling','prone','prone','standing','standing']);
  expect(r.sighters?.[0]).toMatchObject({ beforeSeries: 1, position: 'kneeling' });
});
it('ranges with repeated position, unfinished', () => {
  const p = parseProneRanges({ kneeling: '1-25, 41-46', prone: '26-40', standing: '' }, 46);
  const r = splitByPositions(first46, p.ok ? p.positions : []);
  expect(r.series.map((s) => [s.position, s.shots.length])).toEqual(
    [['kneeling',10],['kneeling',10],['kneeling',5],['prone',10],['prone',5],['kneeling',6]]);
  // total = sum of all 46 values
});
it('ranges reject overlap and gaps', () => {
  expect(parseProneRanges({ kneeling: '1-30', prone: '25-60', standing: '' }, 60)).toEqual({ ok: false, error: 'overlap', shots: [25,26,27,28,29,30] });
  expect(parseProneRanges({ kneeling: '1-20', prone: '21-40', standing: '41-58' }, 60)).toEqual({ ok: false, error: 'unassigned', shots: [59,60] });
  expect(parseProneRanges({ kneeling: '1-70', prone: '', standing: '' }, 60)).toMatchObject({ ok: false, error: 'out_of_range' });
  expect(parseProneRanges({ kneeling: '1-', prone: '', standing: '' }, 60)).toMatchObject({ ok: false, error: 'syntax' });
  expect(parseProneRanges({ kneeling: '', prone: '', standing: '' }, 17)).toEqual({ ok: true, positions: Array(17).fill(null) });
});
it('defaultProneRanges', () => { expect(defaultProneRanges(46)).toEqual({ kneeling: '', prone: '', standing: '' }); });
it('disciplineFromSiusName', () => { expect(disciplineFromSiusName('50m 3x20 NOVO FINALE')).toBeUndefined(); expect(disciplineFromSiusName('10m AIR RIFLE WOMEN')).toBe('air_rifle'); });
```

- [ ] **Step 2: Run** `npx vitest run tests/sius/map.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/sius/map.ts` (pure, no `server-only`). Score rule: a score string with `.` is
  decimal; otherwise whole with optional trailing `x` (= inner). For 3x20 (`/3x/i` and not `final`) `value` = whole,
  `valueDecimal` = the decimal entry; else `value` = the decimal entry (fallback: whole). Series totals follow the
  convention of `parsePrnxXml` in `src/lib/parsers/siusPrnx.ts`. Sighters for SingleStage go into one group without
  position, `beforeSeries: 1`; `splitByPositions` puts each sighter before the first series whose first shot comes
  after it (by `tMs`); sighters after the last shot go before the last series. `first46` in the test = the prone
  fixture cut to its first 46 shots.
- [ ] **Step 4: Run** the test — Expected: PASS. Also `npx vitest run tests/parsers` stays green.
- [ ] **Step 5: Commit** `feat(sius): map SIUS shot JSON to parsed results, prone position ranges`.

### Task 4: Save path and source metadata

**Files:**
- Modify: `src/lib/import/saveTraining.ts` (`PayloadShot.value_decimal: number | null`; `SavePayload.match.sighters:
  { before_series: number; position: string | null; shots: PayloadSighter[] }[]`; `buildSavePayload` fills both from `draft.sius`)
- Modify: `src/lib/import/uploadSource.ts` (`SourceKind` adds `'sius_cloud'` with extension `json`; `uploadSource`
  gains optional `meta?: { externalId: string; firstShotAt: string | null; shotCount: number }` written to
  `external_id`, `first_shot_at`, `shot_count`)
- Test: `tests/import/saveTraining.test.ts` (extend), `tests/import/uploadSource.test.ts` (extend or create)

**Interfaces:**
- Consumes: `ParsedShot.valueDecimal`, `ParsedSiusResult.sighters` (Task 3).
- Produces: `PayloadSighter = { idx: number; value: number; value_decimal: number | null; inner: boolean; x: number |
  null; y: number | null; t_ms: number | null }`; `uploadSource(file, trainingId, kind, deps?, meta?)`.

- [ ] **Step 1: Failing tests:** payload carries `value_decimal` (10.6 for a 3x20 shot, null for CSV shots);
  `match.sighters` keeps the groups' `before_series`, idx runs from 1 across the match; sighters do not change series totals or `hr_avg_bpm`;
  `uploadSource(..., 'sius_cloud', deps, meta)` inserts a row with `external_id`, `first_shot_at`, `shot_count` and
  path ending `.json`.
- [ ] **Step 2: Run** `npx vitest run tests/import` — Expected: FAIL.
- [ ] **Step 3: Implement.** Match selection (last N / first N) applies only to series, never to sighters; after
  selection renumbers series, each group's `before_series` is remapped to the new idx of the series it preceded
  (a group whose series was cut goes before the next kept series, or the last one). Add this to the Step 1 tests.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): save decimals and sighters, SIUS source metadata`.

### Task 5: SIUS auth client

**Files:**
- Create: `src/lib/sius/auth.ts`
- Test: `tests/sius/auth.test.ts`

**Interfaces:**
- Produces:
  - `type SiusTokens = { accessToken: string; refreshToken: string | null; expiresIn: number; userId: string | null }`
  - `type SiusAuthError = 'bad_password' | 'blocked' | 'unavailable'`
  - `class SiusAuthFailure extends Error { kind: SiusAuthError }`
  - `loginWithPassword(email: string, password: string, fetchImpl?: typeof fetch): Promise<SiusTokens>`
  - `refreshTokens(refreshToken: string, fetchImpl?: typeof fetch): Promise<SiusTokens>` (throws
    `SiusAuthFailure('blocked')` on `invalid_grant`/400/401 so the caller re-logs in; `'unavailable'` on 5xx/network)

- [ ] **Step 1: Failing tests** with a fake `fetch` scripted from the research flow: authorize page HTML (with
  hidden inputs and `<form action="authorize"`) → POST → 302 to `/oauth2/complete-registration` → 302 to
  `/oauth2/consent` → 302 to `…/login-callback?code=abc` → token JSON. Assert: tokens returned; the POST body has
  `loginId`, `password`, all hidden fields, no `rememberDevice` duplicate; the token request has `code_verifier`
  whose S256 equals the `code_challenge` sent; cookies from `Set-Cookie` are sent on later requests; the callback URL
  is never fetched. Plus: `Invalid login credentials.` page → `bad_password`; page without the form → `blocked`;
  `unknown page → blocked` (redirect chain ends on a 200 page without code); 503 → `unavailable`; refresh
  `invalid_grant` → `blocked`; refresh response without `refresh_token` → `refreshToken: null`.
- [ ] **Step 2: Run** `npx vitest run tests/sius/auth.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** by porting `scripts/sius-spike/login-test.mjs` (`login`, `refresh`, cookie jar,
  redirect hops up to 6, same-origin only) with `AbortSignal.timeout(10_000)` and one retry on network/5xx.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): server-side SIUS login and token refresh`.

### Task 6: Token session with re-login and limits

**Files:**
- Create: `src/lib/sius/session.ts`
- Create: `src/lib/sius/store.ts` (service-role reads/writes of `sius_links` and `sius_login_attempts`)
- Test: `tests/sius/session.test.ts`

**Interfaces:**
- Consumes: `seal/open/siusKey` (Task 1), `loginWithPassword/refreshTokens` (Task 5).
- Produces:
  - `interface SiusLinkStore { get(userId): Promise<SiusLinkRow | null>; save(userId, patch: Partial<SiusLinkRow>):
    Promise<void>; remove(userId): Promise<void>; countLogins(userId: string | null, sinceMs: number):
    Promise<number>; recordLogin(userId): Promise<void> }` and `supabaseSiusStore(): SiusLinkStore`
  - `class SiusReconnectNeeded extends Error { reason: 'bad_password' | 'blocked' }`,
    `class SiusUnavailable extends Error {}`, `class SiusNotConnected extends Error {}`,
    `class SiusNotConfigured extends Error {}`
  - `getAccessToken(userId: string, deps?: { store?: SiusLinkStore; auth?: { login; refresh }; now?: () => number }):
    Promise<string>`
  - `connect(userId: string, email: string, password: string, deps?): Promise<void>` (logs in once, stores all;
    counts toward limits; on failure stores nothing)

- [ ] **Step 1: Failing tests:** cached token valid (> now + 60 s) → no network; expired → refresh, new access token
  saved, refresh token replaced only when returned; refresh `blocked` → password login → all tokens saved,
  `recordLogin` called; password rejected → `password_enc` set null, `broken_at` set, `broken_reason
  'bad_password'`, throws `SiusReconnectNeeded`, and a second call throws without calling login; 4th password login
  in an hour for one user → `SiusUnavailable` without calling SIUS; 31st global → `SiusUnavailable`; `broken_at`
  set → throws `SiusReconnectNeeded` immediately; no key → `SiusNotConfigured`; no row → `SiusNotConnected`;
  `connect` with bad password stores nothing.
- [ ] **Step 2: Run** `npx vitest run tests/sius/session.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** `store.ts` uses `createAdminClient()` from `src/lib/supabase/admin.ts`; prune
  `sius_login_attempts` older than 2 h on `recordLogin`. Concurrency: after a failed refresh, re-read the row once;
  if `updated_at` moved and the cached token is now valid, use it instead of logging in.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): token session with password fallback and login limits`.

### Task 7: Training Center and Result Service clients

**Files:**
- Create: `src/lib/sius/training.ts`, `src/lib/sius/results.ts`
- Test: `tests/sius/clients.test.ts`

**Interfaces:**
- Produces:
  - `listExercises(accessToken: string, page: { skip: number; take: number }, fetchImpl?): Promise<{ items:
    SiusExercise[]; more: boolean }>` (`more` = page was full)
  - `getExerciseShots(accessToken: string, exerciseId: string, fetchImpl?): Promise<SiusShotsResponse>`
  - `listCompetitions(q: { page: number; name: string }, fetchImpl?): Promise<{ items: SiusCompetition[]; more:
    boolean }>` (`{ id: RunningId, name, city, country, startDate, endDate, timeZone }`, newest first,
    `PageSize=20`, `Name=` passes the search text)
  - `listEvents(compId, fetchImpl?)`, `listParts(compId, eventId, fetchImpl?)` (`{ id, name, startDate }`)
  - `getRanking(compId, eventId, partId, fetchImpl?): Promise<{ athleteRunningId, identifier, displayName, nation,
    total }[]>` (from `/pub/series`, `shooterGroup=Regulars&teamKind=Individual`)
  - `getAthleteShots(compId, eventId, partId, athleteRunningId, fetchImpl?): Promise<SiusShotsResponse>`
    (`POST /Athletes/shotgroups`, body exactly as in the research doc)
- Errors: non-200 → `SiusUnavailable` (401 from Training Center → `SiusAuthFailure('blocked')` so the session layer
  refreshes once).

- [ ] **Step 1: Failing tests:** `loadOptions` query decodes to exactly the research object (`sort` on
  `exerciseDate`, `group: null`, `searchOperation`, `searchValue: null`, `userData: {}`, `stringToLower: true`) with
  given skip/take; `Authorization: Bearer <t>`; full page → `more: true`; shotgroups POST body has the five ids,
  `shooterGroup: 'Regulars'`, `teamKind: 'Individual'`, `athleteRunningIds: [id]`; ranking maps
  `AthletesSeries[0].AthleteIdentifier.Identifier` and `RunningId`.
- [ ] **Step 2: Run** `npx vitest run tests/sius/clients.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (10 s timeout, one retry on network/5xx).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): Training Center and Result Service API clients`.

### Task 8: Competition helpers (pure)

**Files:**
- Create: `src/lib/sius/pick.ts`
- Test: `tests/sius/pick.test.ts`

**Interfaces:**
- Produces:
  - `partLocalDate(startDate: string /* ISO UTC */, timeZone: string): string /* YYYY-MM-DD */` (IANA zone; an
    unknown zone falls back to the UTC date)
  - `stageFromPartName(partName: string): SessionStage | null` (contains `Qualification` → `kvalifikacije`,
    `Final` → `finale`, `Elimination` or `Pre` → `eliminacije`; case-insensitive; else null)
  - `sessionNameFor(compName: string, eventName: string, partName: string): string` (`<competition> <discipline>
    <part>`: discipline = `sr.ts` label of `disciplineFromSiusName(eventName)`, else `eventName`; part = `sr.ts`
    stage label of `stageFromPartName(partName)`, else `partName`)
  - `findMyRow(ranking, athleteId: string | null, displayName: string): RankingRow | null` (exact identifier match;
    without id only an exact normalized full-name match, `SURNAME Name` order-insensitive; never partial)

- [ ] **Step 1: Failing tests:** `part date in competition time zone` (`2026-10-31T21:00:00Z`, `Asia/Qatar` →
  `2026-11-01`; bad zone → `2026-10-31`); `sessionNameFor('ISSF World Championship Doha', '10m AIR RIFLE MEN',
  'Qualification')` → `'ISSF World Championship Doha Vazdušna puška Kvalifikacije'` (use the real labels);
  unknown event/part names pass through unchanged; `stageFromPartName('Final')` → `finale`, `('Medal Match')` →
  null; `findMyRow without id never guesses on partial name` ("RAKONJAC" alone does not match "RAKONJAC Aleksa";
  "Aleksa Rakonjac" does).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): competition helpers, session name, own-row match`.

### Task 9: Server actions

**Files:**
- Create: `src/lib/sius/actions.ts` (`'use server'`)
- Test: `tests/sius/actions.test.ts` (mock pattern as in `tests/googleHealth/pull.test.ts`)

**Interfaces:**
- Consumes: Tasks 3, 6, 7, 8.
- Produces (all return `SiusState` on failure: `{ state: 'none' | 'broken' | 'unavailable' | 'not_configured' |
  'forbidden'; reason?: string }`):
  - `connectSius(email: string, password: string): Promise<{ ok: true } | { ok: false; error: SiusAuthError |
    'not_configured' | 'limit' }>`
  - `disconnectSius(): Promise<void>`
  - `siusExercises(shooterId: string, skip: number): Promise<{ items: (SiusExercise & { importedTrainingId: string |
    null })[]; more: boolean } | SiusState>` (take 20; `importedTrainingId` from `source_files.external_id` joined to
    non-deleted trainings of that shooter)
  - `siusExerciseResult(shooterId: string, exerciseId: string, name: string): Promise<{ parsed: ParsedSiusResult;
    raw: string; externalId: string; duplicateOf: string | null } | SiusState>`
  - `siusCompetitions(page: number, name: string): Promise<{ items: SiusCompetition[]; more: boolean } | SiusState>`,
    `siusEvents(compId)`, `siusParts(compId, eventId)`
  - `siusMyPerformance(shooterId, compId, eventId, partId): Promise<{ found: { parsed; raw; externalId; duplicateOf } }
    | { notFound: true; pick: RankingRow[] }>` (uses `profiles.sius_athlete_id`, then `findMyRow` with the shooter's
    display name; no match → `notFound` with the whole ranking)
  - `siusAthletePerformance(compId, eventId, partId, athleteRunningId)`: returns `{ parsed; raw; externalId;
    duplicateOf }` for the double-check preview without saving anything.
  - `siusConfirmAthlete(shooterId, identifier)`: saves `profiles.sius_athlete_id` (only when `shooterId` is self,
    or coach of shooter); called when the owner confirms "Da, to sam ja".
  - `duplicateOf` = training id of another `sius_cloud` source of the same shooter with `first_shot_at` within
    ± 2 s and the same `shot_count`, else null. `externalId` = exercise id, or `comp:<partId>:<athleteRunningId>`.
- Access: `getSessionProfile()` from `src/lib/auth/session.ts` and `status === 'active'`, as in
  `src/app/api/google-health/pulse/route.ts`; private reads check `shooterId === profile.id` or
  `supabase.rpc('coach_of', { sid: shooterId })`; the user id is never taken from input for connect/disconnect.

- [ ] **Step 1: Failing tests:** unauthenticated → rejected; coach of shooter reads exercises with the shooter's
  token (store called with shooter id); unrelated user → `forbidden` and no SIUS call; `SiusReconnectNeeded` →
  `{state:'broken', reason}`; `importedTrainingId` filled; `duplicateOf` found across sources; `connectSius` limit →
  `{ok:false,error:'limit'}`.
- [ ] **Step 2: Run** `npx vitest run tests/sius/actions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): server actions for SIUS connection, exercises and competitions`.

### Task 10: Account panel and privacy policy

**Files:**
- Create: `src/app/(app)/nalog/SiusPanel.tsx`
- Modify: `src/app/(app)/nalog/page.tsx` (render next to `GoogleHealthPanel`; status via `sius_link_status`),
  `src/lib/i18n/sr.ts`, `src/components/PrivacyPolicy.tsx` (Serbian and English sections)
- Test: `tests/components/siusPanel.test.tsx`

**Interfaces:**
- Consumes: `connectSius`, `disconnectSius` (Task 9).
- Produces: `SiusPanel({ status: { state: 'none'|'ok'|'broken'; reason: string | null; email: string | null };
  athleteId: string | null })`.

- [ ] **Step 1: Failing tests:** none → email + password form, submit calls `connectSius`, password field cleared
  after submit and never echoed; `bad_password` shows the error text; ok → email, "Prekini vezu"; broken → reason
  and form; athlete id field saves via a profile update.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with the existing panel components (`GoogleHealthPanel.tsx` as the model). Copy: the
  password is stored encrypted and used only to sign in to SIUS when needed; Google sign-in users must first set a
  SIUS password via "Forgot password" on SIUS. Privacy policy: the spec's "Privacy policy" paragraph, for every user,
  including the coach exception.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): account panel and privacy policy text`.

### Task 11: SIUS Cloud tab in the training form

**Files:**
- Create: `src/components/entry/SiusCloudTab.tsx`, `src/components/entry/ProneSplit.tsx`
- Modify: `src/components/NewTrainingForm.tsx` (SIUS `SegTabs` gains `{ id: 'cloud', label: 'SIUS Cloud' }`;
  applying passes a `File` built from `raw` (`sius-<externalId>.json`, `application/json`) to `applySius`; the
  source upload on save uses kind `sius_cloud` with `meta` from Task 4; the finale view renders `SiusCloudTab` above
  `FinalEntry`), `src/components/FinalEntry.tsx` (new prop `prefill?: { value: number; tMs?: number }[]` that fills
  the grid once), `src/lib/i18n/sr.ts`
- Test: `tests/components/siusCloudTab.test.tsx`, extend `tests/components/newTraining.test.tsx`

**Interfaces:**
- Consumes: Task 9 actions, Task 3 `parseProneRanges`/`defaultProneRanges`/`splitByPositions`/`isProneProgram`,
  Task 8 helpers.
- Produces: `SiusCloudTab({ shooterId, sessionKind, discipline, stage, date, onApply: (r: { parsed:
  ParsedSiusResult; file: File; meta: { externalId; firstShotAt; shotCount }; session?: { name: string; eventName:
  string; place: string; date: string; stage: SessionStage | null } }) => void, onFinal?: (shots) => void })`. `session` comes only from the
  Takmičenje sub-tab; `NewTrainingForm` applies each of its fields only where the form's field is empty (date only
  while not touched by the owner); `stage`, when not null, always replaces the form's stage; a part that maps to `finale` goes to `onFinal`
  (the form switches to the finale view and `FinalEntry` gets the prefill), any other part to `onApply`. Test:
  `final part picked in qualification session switches to finale view and fills FinalEntry`. `SeriesBoard` already
  starts a group heading when the position changes (`SeriesBoard.tsx:139`); Task 12 pins that with a test.

- [ ] **Step 1: Failing tests:** sub-tab default: `takmicenje` → Takmičenje, `trening`/`kontrolni` → Trening;
  exercises on the session date listed first; `row shows shot count`; "uvezeno" badge links to the training;
  picking an imported one asks to confirm; `duplicateOf` asks to confirm; prone exercise shows `Stavovi` with three
  range fields (`1-20`/`21-40`/`41-60` for 60 shots, empty otherwise), an invalid entry shows the error with the
  shot numbers and disables apply, applied result has positions; competition list newest first with search and
  "more"; event and part lists show every SIUS entry and nothing is preselected (no apply until all three are
  picked); picked event/part set discipline and stage (`Qualification` → `kvalifikacije`); `competition pick fills
  only empty name`; `not found shows message and list`; picking a row shows the double-check preview (name,
  nation, total, series totals, shot count) and saves `sius_athlete_id` only after "Da, to sam ja"; "Nazad"
  returns to the list without saving; states `none` (link to `/nalog`, the
  Takmičenje sub-tab still works), `broken` ("Ponovo poveži SIUS"), `unavailable` (retry button); in finale view the
  pick fills `FinalEntry` and the save uploads the `sius_cloud` source with meta.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Preview before apply: series totals, match shot count, sighter count. Keep
  `NewTrainingForm.tsx` changes to wiring; logic lives in the new components.
- [ ] **Step 4: Run** `npx vitest run tests/components` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): SIUS Cloud tab with Trening and Takmičenje`.

### Task 12: Report: decimals and "Proba" rows

**Files:**
- Create: `src/lib/report/sighters.ts`
- Modify: `src/app/(app)/trening/[id]/page.tsx` (select `value_decimal` on shots and `sighter_shots` per match, ordered by `idx`, grouped by
  `before_series`),
  `src/lib/report/viewModel.ts` (`RawSeries.shots[].value_decimal`, `ShotView.valueDecimal?: number`,
  `ReportView.sighters`), `src/components/report/SeriesBoard.tsx` (Proba rows, decimal as secondary figure),
  `src/components/report/TargetPlot.tsx` (toggle sighters)
- Test: `tests/report/sighters.test.ts`, extend `tests/components/seriesBoard.test.tsx`

**Interfaces:**
- Produces: `type BoardRow = { kind: 'series'; idx: number } | { kind: 'sighters'; group: number }`;
  `boardRows(series: { idx: number }[], sighters: { beforeSeries: number }[]): BoardRow[]` (each sighter group
  placed before the series with `idx === beforeSeries`; groups whose series does not exist go at the end).

- [ ] **Step 1: Failing tests:** air (`beforeSeries` 1) → `[sighters, s1…s6]`; 3x20 (1, 3, 5) → `[sighters, s1,
  s2, sighters, s3, s4, sighters, s5, s6]`; no sighters → series only; sighters-only exercise (no series) → one
  Proba row; `repeated position starts a new group` (positions K,K,K,P,P,K,K → group headings klečeći, ležeći,
  klečeći, series 10/10/5, 10/10, 10/5); Proba row shows count and values (decimal when present) and is excluded from the match total;
  shot rows show `10` with `10,6` as secondary when `valueDecimal` exists.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Stats (`src/lib/stats/*`) and alignment read only `series`/`shots`, so they stay
  unchanged; confirm with a grep that nothing selects `sighter_shots` there.
- [ ] **Step 4: Run** `npx vitest run tests/report tests/components/seriesBoard.test.tsx tests/stats` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(sius): show sighters as Proba rows and decimals next to whole values`.

### Task 13: Wrap-up

**Files:**
- Modify: `.env.example` (or the env doc the project uses) with `SIUS_CRED_KEY=` and a generation hint
  (`openssl rand -base64 32`); `docs/research/sius-cloud-api.md` gets a line pointing to `src/lib/sius/`.

- [ ] **Step 1: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — Expected: all pass.
- [ ] **Step 2: Manual check** in the preview with the owner's connected account (owner enters the password on
  `/nalog` themselves): list shows recent exercises; 10 m exercise imports with sighters; 3x20 shows decimals and
  three Proba rows; prone program split with typed ranges (incl. a repeated position); Doha WCh picked from
  the list fills name, event, place and date 1 Nov; final fills `FinalEntry`.
- [ ] **Step 3: Commit** `chore(sius): env doc and research pointer`.
- [ ] **Owner to-dos:** set `SIUS_CRED_KEY` in Vercel (production + preview) and `.env.local`; run
  `0030_sius_cloud.sql`.
