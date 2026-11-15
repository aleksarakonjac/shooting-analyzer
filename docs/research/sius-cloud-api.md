# SIUS Shooting Sports Cloud — API notes (2026-11-15)

Result Service SPA: `https://shootingsportscloud.com:8594/` (Angular + Blazor WASM).
Auth: FusionAuth OIDC at `https://shootingsportscloud.com:8597` (auth code + PKCE,
client_id `0b659819-8568-4a56-b800-0e5981130a0c`, scope `openid offline_access`).

## Public endpoints (no auth; SPA sends `Authorization: Bearer null`)

Base `https://shootingsportscloud.com:8594/api/v1`

| Call | Returns |
|---|---|
| `GET /pub/competitions?Page=1&PageSize=10&Name=&Sort={"StartDate":"desc"}&IsPublic=true[&Status=live]` | competitions (`RunningId`, `TenantId`, dates, TZ), `totalcount` |
| `GET /pub/competitions/events?CompetitionId=<id>&Name=&Sort={"Startdate":"asc"}` | events (10m AR men, ...) |
| `GET /pub/competitions/<compId>/events/<eventId>/subevents` | Qualification / Final, `DefaultTargetCode` |
| `GET /pub/shotgroups?runningCompetitionId&runningCompetitionEventId&subEventId` | group layout (shots per series, stages) |
| `GET /pub/series?...&shooterGroup=Regulars&teamKind=Individual` | ranking, totals, inner tens, series sums, athlete `RunningId` + ISSF id |
| `POST /Athletes/shotgroups` | **per-shot data** (below) |

`POST /Athletes/shotgroups` body:

```json
{"runningCompetitionId":"…","runningCompetitionEventId":"…","subEventId":"…",
 "shooterGroup":"Regulars","teamKind":"Individual","athleteRunningIds":["…"]}
```

Response: `{type, sightingShots[], competitionGroups[{shots[]}]}`, each shot:

```json
{"shotNumber":1,"coordinates":"-2.23/-0.18","timeStamp":"2026-11-03T06:16:23.48+00:00",
 "score":"10.1","innerTen":false,"miss":false,"frameHit":false,"inTime":true,"demo":false}
```

- `coordinates` = x/y in **mm** from center (verified vs decimal score: 0.25 mm per 0.1 on air rifle).
  Axes: **+x = right, +y = up** (verified against the SCloud target plot: shot `1.99/-1.77` drawn right-low).
- `timeStamp` UTC, ms precision.
- `sightingShots` empty on public results (sighters not published).
- `elapsedTime` is .NET `TimeSpan.MinValue` (unused).

## Private training data (Training Center, verified with own account)

SPA: `https://shootingsportscloud.com:8598/userExercises`. Same OIDC client as above.
Tokens live in `sessionStorage` (`access_token`, `refresh_token`, `id_token`).
All calls need `Authorization: Bearer <access_token>`.

| Call | Returns |
|---|---|
| `GET /api/user-results?loadOptions=<json>` | training list (DevExtreme load options) |
| `GET /api/user-results/<exerciseId>/shots` | all shots incl. **sighters** |
| `GET /api/user-results/tags`, `GET /api/userprofile` | misc |

Working `loadOptions` (500 without these fields/selector names):

```json
{"sort":[{"selector":"exerciseDate","desc":true}],"group":null,"searchOperation":"contains",
 "searchValue":null,"skip":0,"take":100,"userData":{},"stringToLower":true}
```

List item: `exerciseId, exerciseName ("10m Air Rifle", "50m Rifle 3x20", "50m Rifle Prone", custom names),
exerciseDate, startTime, lane, totalString ("630.9" or "590-38x"), numberOfCompetitionShots,
isTargetViewSupported, comment, userSpecificData{weapons, ammunitions}`. `totalCount` is -1: page until short page.

Shots response:
- `SingleStage`: `{sightingShots[{shots}], competitionGroups[{shots}]}` (e.g. 16 sighters + 60).
- `MultiStage` (3x20): `{stageResults[{stageName:"Kneeling"|…, competitionGroups[{shots}]}]}`.
- Shot fields same as public; `scores` = `["10x","10.6"]` (integer-with-x, decimal) on 50m;
  `elapsedTime` is real here (time since exercise start); `fireKind` 0/1 varies.

### Token refresh
`POST https://shootingsportscloud.com:8597/oauth2/token`
form: `grant_type=refresh_token&client_id=0b659819-8568-4a56-b800-0e5981130a0c&refresh_token=…`
→ 200, new `access_token` (`expires_in` 1799 s), refresh token **not rotated**, no client secret
(public PKCE client). Refresh-token lifetime unknown (FusionAuth default 30 days).

### Server-side login with email + password (verified 2026-11-15)
- `grant_type=password` is **disabled** for this client (`unauthorized_client`).
- Hosted-form login works (no CAPTCHA, no 2FA on our account):
  1. `GET :8597/oauth2/authorize?response_type=code&client_id…&redirect_uri=https://shootingsportscloud.com:443/login-callback&scope=openid offline_access&code_challenge…(S256)` → HTML form, keep cookies.
  2. `POST :8597/oauth2/authorize` with all hidden inputs + `loginId`, `password` → 302.
     Wrong password → 200 page with "Invalid login credentials."
  3. Follow same-origin 302s (`/oauth2/complete-registration` → `/oauth2/consent`) until `Location` is
     `…/login-callback?code=…` (do not request the callback).
  4. `POST :8597/oauth2/token` `grant_type=authorization_code, client_id, code, redirect_uri, code_verifier` →
     access (1799 s) + refresh token.
- Reference implementation: `scripts/sius-spike/login-test.mjs` (saw 121 trainings; 3x20 had 73 sighters + 60 shots).

Caveat: this is SIUS's own client_id, not a partner integration. For production ask SIUS for API access.
