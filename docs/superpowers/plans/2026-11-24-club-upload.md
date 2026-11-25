# Clubs, Club Upload Link and Shared Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shooters pick their name on a public club page and drop SIUS and SCATT files; they or their coach join them into trainings in one inbox.

**Architecture:** `clubs` and `club_links` tables; files keep going into the existing `inbox_files` table and `inbox` bucket. Uploads go browser to storage with signed URLs; the server starts and confirms each one. The existing new-training form stays the only place a training is saved.

**Tech Stack:** Next.js 16.4 (read `node_modules/next/dist/docs/` before writing routes or pages), Supabase (Postgres RLS, storage), React 19, vitest, pgTAP in `supabase/tests`.

**Spec:** `docs/superpowers/specs/2026-11-24-range-upload-design.md`

## Global Constraints

- All user-visible text in Serbian (latin) in `src/lib/i18n/sr.ts`; code and comments in English.
- No link holder, club maker or member can read anybody's files or trainings; only the shooter and their coach (`coach_of`).
- Only the person sets or clears their own club. No limit on how many clubs a person makes.
- Empty club: deleted with its link after 7 days by the daily cron.
- At most 50 waiting files per shooter, 25 MB per file (existing `MAX_WAITING`, `MAX_UPLOAD_BYTES`).
- Inbox kinds: `scatt`, `tcx`, `sius_pdf`, `sius_prnx`. No HTML.
- `service_role` gets only the column grants each route uses (see 0026). Migrations are run by hand by the owner; 0031 before 0032.
- Load the `supabase-postgres-best-practices` skill before writing SQL.
- Pushing to `main` deploys production: work on a branch, never push without the owner's word.

## Review Focus

1. Club names in Cyrillic ("Чачак") must be the same club as "Čačak" (Task 1, Task 2).
2. A shooter leaves the club between start and confirm: the file is refused and its object removed (Task 4).
3. The same laptop, next shooter: after sending, no name or file of the previous one is left (Task 5).
4. Half a batch fails (network): sent files are marked sent, the failed ones stay and can be retried (Task 5).
5. Two sessions on one day: a SCATT file is proposed with one SIUS file only, the nearest in time (Task 6).

## Before Task 1

- [ ] Commit the finished SIUS import work (PDF, HTML, PRNX angles, migration 0031) on branch `feat/sius-summary-import`, without `docs/superpowers`. Run `npm test` first; expect 758 passing. Then branch `feat/club-upload` from it and commit the spec and this plan.

---

### Task 1: Database

**Files:** Create `supabase/migrations/0032_clubs_upload.sql`, `supabase/tests/clubs_upload.test.sql` (follow `hardening.test.sql`).

**Produces (SQL):**
- `clubs(id, name, name_key unique, created_by null on delete set null, created_at, empty_since)`; name trimmed, 2 to 80 characters. `authenticated` selects `id, name` when `is_active()`; no direct writes.
- `club_links(club_id pk on delete cascade, token unique, created_at, last_used_at)`; token `ub_` + 64 hex, from two `gen_random_uuid()`. No direct select.
- `profiles.club_id uuid references clubs on delete restrict`. Not updatable directly. Readable with the profile row, so by the person, linked people and the admin.
- `inbox_files`: kind check gains `sius_prnx`; `sha256 text`, `meta jsonb`; unique `(user_id, sha256)` where `sha256` is not null.
- `inbox_uploads(id, user_id, club_id null, storage_path unique, file_name, meta, created_at)`: started, unconfirmed; service role only.
- `club_key(text) returns text immutable`: Serbian Cyrillic to Latin, lower case, `čćšžđ` to `ccszd` (љ lj, њ nj, џ dz, ђ d), spaces collapsed.
- `choose_club(p_name text) returns uuid`: active caller; blank clears; finds by key or makes club and link; sets only the caller's `club_id`.
- `my_club() returns table(id, name, token, can_manage)`: active member; `can_manage` = maker or admin.
- `rename_club(cid, p_name)`, `replace_club_link(cid) returns text`: the maker while a member, or an admin.
- `admin_clubs() returns table(id, name, members int)`: admin only.
- `club_mates() returns table(id, display_name)`: the caller's club's other active shooters; empty without a club.
- `pass_inbox_file(fid, to_shooter)`: caller is the file's shooter or `coach_of` them; target is an active shooter in the old shooter's club, or `coach_of(target)`. Refused when the target is at the cap or already has that sha.
- `club_shooters(p_token text) returns table(club_name, id, display_name)`: active shooters of that club; executable by `service_role` only; stamps `last_used_at`.
- `purge_clubs()`: service role; marks newly empty clubs, unmarks joined ones, deletes those empty 7 days that still have no profile.
- Policies on `inbox_files` select/delete: `user_id = auth.uid() and is_active()` or `coach_of(user_id)`. Storage `inbox` select/delete: an `inbox_files` row with `storage_path = name` visible to the caller.

- [ ] **Step 1: Write failing pgTAP tests**, one `ok`/`throws_ok` per line:
  `club_key('  ЧАЧАК ') = club_key('cacak')` and `= club_key('Čačak')`; choosing 'cacak' after 'Čačak' returns the same id; blank clears; a pending account is refused; nobody can update another's `club_id`; a member reads the token through `my_club`, an outsider gets no row; `authenticated` cannot select `club_links`, `inbox_uploads` or call `club_shooters`; a non-maker cannot rename or replace; a maker who left cannot; replacing changes the token; coach reads and deletes a linked shooter's file row, another member of the same club reads none; storage rows follow the same; `pass_inbox_file` by owner to a club mate works and the old owner stops seeing it, to a stranger throws, by a club mate who is not the owner throws; `purge_clubs` keeps a club empty for 6 days, deletes it at 8, keeps one that was joined again.
- [ ] **Step 2:** Run `supabase start && supabase test db`. Expected: the new file fails, others pass.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run `supabase db reset && supabase test db`. Expected: all pass.
- [ ] **Step 5:** Commit `feat(clubs): schema, access rules and inbox columns`.

### Task 2: Club in Nalog

**Files:** Create `src/lib/clubs/key.ts`, `src/lib/clubs/actions.ts`, `src/app/(app)/nalog/ClubPanel.tsx`, `tests/clubs/key.test.ts`, `tests/components/clubPanel.test.tsx`. Modify `nalog/page.tsx` (profile pane, all roles), `admin/approvals/page.tsx` (section "Klubovi": rename, replace link), `sr.ts`, `components/PrivacyPolicy.tsx` (a club link shows the name to whoever has it).

**Produces:** `clubKey(name: string): string`; actions `chooseClub(form)`, `renameClub(form)`, `replaceClubLink(form)`; `ClubPanel({ club, clubs, siteUrl })` with `club: { id; name; token; canManage } | null`, `clubs: string[]`.

- [ ] **Step 1: Failing tests.** `clubKey` over the same cases as Task 1. Panel: typing `cacak` with `Čačak` entered shows the button "Upiši se u Čačak"; an unknown name shows "Napravi klub <name>"; the hint "Vaše ime vide svi koji imaju link kluba." is present; the link reads `<siteUrl>/ubaci#<token>`; rename and replace are absent when `canManage` is false; replacing asks for confirmation.
- [ ] **Step 2:** `npx vitest run tests/clubs tests/components/clubPanel.test.tsx`. Expected: FAIL, modules missing.
- [ ] **Step 3:** Implement with `ComboField`.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(clubs): choose or make a club in Nalog`.

### Task 3: PRNX in the inbox, shared file readers

**Files:** Create `src/lib/import/readFiles.ts`, `tests/import/readFiles.test.ts`. Modify `lib/inbox/upload.ts`, `lib/inbox/types.ts`, `NewTrainingForm.tsx`, `sr.ts` (kind labels), `sa-telefona/page.tsx` (`HAS`), `tests/inbox/upload.test.ts`.

**Produces:**
- `parseSiusFile`, `parseScattFile`, `siusKind` moved from `NewTrainingForm.tsx` unchanged.
- `InboxKind = 'scatt' | 'tcx' | 'sius_pdf' | 'sius_prnx'`; `isSius(kind: InboxKind): boolean`.
- `type InboxMeta = { sius: { discipline: string; total: number; shots: number; atMs: number | null } } | { scatt: { shots: number; startMs: number; endMs: number } } | null`
- `describeFile(file: File, tz: string): Promise<{ kind: InboxKind; meta: InboxMeta }>`; throws `UnknownFileError`. `endMs` is the last shot.

- [ ] **Step 1: Failing tests.** `inboxKindOf` gives `sius_prnx` for the prnx fixture and null for the HTML one; `describeFile` on the prnx fixture: total 628.8, 60 shots, `atMs` 2026-11-11T18:51:09Z; on the SCATT fixture: `shots` equals its parsed count and `startMs < endMs`; on a text file it throws. Form: an inbox item of kind `sius_prnx` is offered in the SIUS tray.
- [ ] **Step 2:** `npx vitest run tests/import tests/inbox tests/components/newTraining.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3:** Implement; gzip header means prnx.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(inbox): take SIUS .prnx and share the file readers`.

### Task 4: Upload steps and routes

**Files:** Create `src/lib/inbox/directUpload.ts`, `src/app/api/inbox/link/route.ts`, `tests/inbox/directUpload.test.ts`. Modify `lib/inbox/actions.ts`.

**Produces:**
- `startUpload(req: { shooterId; fileName; bytes: number; meta: unknown }, deps): Promise<{ status: 201; uploadId; signedUrl; token } | { status: 400|403|413|429; error }>`
- `confirmUpload(uploadId, deps): Promise<{ status: 201; kind } | { status: 403|404|409|415; error }>`; 409 means already sent.
- `deps` carries `allowed(shooterId): Promise<boolean>`: club member by token, own account, or linked shooter for a coach. `cleanMeta(x: unknown): InboxMeta` drops anything of another shape and caps strings at 80 characters.
- Route: `GET` club name and shooters; `POST {step:'start',...}`; `POST {step:'confirm', uploadId}`; bearer `ub_[0-9a-f]{64}`; 401 otherwise. Server actions `startOwnUpload`, `confirmOwnUpload` use the session.

- [ ] **Step 1: Failing tests** with fake deps: the path is `<shooterId>/<server id>`, never from the client; a shooter outside the club gives 403; 50 waiting plus started gives 429; over 25 MB gives 413; confirm of another token's upload gives 404; left the club before confirm gives 403 and removes the object; bytes that are no known kind give 415 and remove the object; same sha gives 409 and removes the object; the kind and sha come from the stored bytes; bad `meta` becomes null.
- [ ] **Step 2:** `npx vitest run tests/inbox`. Expected: FAIL.
- [ ] **Step 3:** Implement; storage `createSignedUploadUrl` with the service role.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(inbox): direct uploads by club link or session`.

### Task 5: The public page

**Files:** Create `src/app/ubaci/page.tsx`, `src/components/inbox/DropBox.tsx`, `src/components/inbox/ClubUpload.tsx`, `tests/components/clubUpload.test.tsx`. Modify `lib/auth/guard.ts`, `tests/auth/guard.test.ts`, `sr.ts`, styles.

**Produces:** `DropBox({ shooters, start, confirm, fixed? })`, `shooters: { id; name }[]`; used signed-in in Task 6.

- [ ] **Step 1: Failing tests.** `/ubaci` is allowed signed out, pending and active; `/ubacivanje` is not opened. Page: with `#ub_…` it stores the token and the address has no hash; without a token, and on 401, it shows "Ovaj računar nije povezan"; "Pošalji" is disabled without a name or with an unreadable file only; a SIUS file shows discipline, total and time; after success name and files are cleared; a failed file stays with "Pokušaj ponovo" while a sent one is marked; 409 shows "Već poslato". Storage blocked: the page still works until closed.
- [ ] **Step 2:** `npx vitest run tests/components/clubUpload.test.tsx tests/auth`. Expected: FAIL.
- [ ] **Step 3:** Implement. `/ubaci` has `robots: noindex` and no app shell; layout from phone width up.
- [ ] **Step 4:** Same command. Expected: PASS. Then look at it in the browser at 375 and 1280 px.
- [ ] **Step 5:** Commit `feat(clubs): public upload page`.

### Task 6: Sanduče

**Files:** Create `src/lib/inbox/pairs.ts`, `src/components/inbox/InboxDay.tsx`, `tests/inbox/pairs.test.ts`, `tests/components/inboxDay.test.tsx`. Modify `lib/inbox/waiting.ts`, `lib/inbox/actions.ts` (`passInboxFile(form)`), `sa-telefona/page.tsx`, `app/(app)/layout.tsx`, `sesije/page.tsx`, `AppShell.tsx` (coach nav), `sr.ts` ("Sanduče").

**Produces:** `waitingInbox(shooterIds: string[]): Promise<InboxItem[]>`, `InboxItem` gains `shooterId`, `meta`; `proposePairs(items: InboxItem[], tz: string): { siusId: string; scattId: string }[]`.

Pair rule: SIUS `atMs` from SCATT `startMs` to `endMs` + 60 min and SCATT shots at least SIUS shots; nearest `endMs` first; each file once. When either has no meta or no time: same shooter and arrival day (in `tz`), and only when exactly one unpaired of each is left that day.

- [ ] **Step 1: Failing tests.** `proposePairs`: inside the window; 61 min after is not paired; fewer SCATT shots is not; two sessions on one day pair to the nearest; different shooters never pair; phone SCATT without meta pairs with the day's only SIUS, and not when there are two. `InboxDay`: the pair starts selected; unchecking changes the link's `inbox` parameters; the coach's link goes to `/strelci/<id>/novi`, the shooter's to `/trening/novi`; passing offers only `club_mates()` and, to a coach, linked shooters.
- [ ] **Step 2:** `npx vitest run tests/inbox tests/components/inboxDay.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement. Shooter: own files plus `DropBox` fixed to self. Coach: linked shooters, grouped, plus `DropBox` with the linked names. `?f=` still puts the Shortcut's file first.
- [ ] **Step 4:** Same command, then `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(inbox): Sanduče for shooters and coaches, with proposed pairs`.

### Task 7: The form with a linked shooter's inbox

**Files:** Modify `strelci/[shooterId]/novi/page.tsx`, `trening/novi/page.tsx`, `trening/[id]/podaci/page.tsx`, `NewTrainingForm.tsx`, `tests/components/newTraining.test.tsx`.

**Consumes:** `waitingInbox([shooterId])`, existing `inbox`/`autoInbox` props.

- [ ] **Step 1: Failing test.** The form given a SIUS and a SCATT inbox item and both in `autoInbox` loads both; saving discards both. A file already gone (taken by the other person) shows `sr.inbox.loadFailed` and the rest of the form works.
- [ ] **Step 2:** `npx vitest run tests/components/newTraining.test.tsx`. Expected: the new test FAILs.
- [ ] **Step 3:** Implement; `podaci` offers the inbox to the owner and to a coach of the training's shooter.
- [ ] **Step 4:** Same command. Expected: PASS.
- [ ] **Step 5:** Commit `feat(inbox): coaches open a shooter's files in the form`.

### Task 8: Cleanup and final check

**Files:** Create `src/lib/inbox/purgeStarted.ts`, `tests/inbox/purgeStarted.test.ts`. Modify `api/cron/purge/route.ts`, `README.md`.

- [ ] **Step 1: Failing test.** `purgeStarted(deps, now)` removes objects and rows of uploads started more than 24 h ago, keeps newer ones, and reports a storage failure without deleting its row.
- [ ] **Step 2:** `npx vitest run tests/inbox`. Expected: FAIL.
- [ ] **Step 3:** Implement; the cron also calls `purge_clubs`. A failure of one job does not stop the training purge.
- [ ] **Step 4:** `npm test && npx tsc --noEmit -p . && npm run build && supabase test db`. Expected: all pass; lint has only the two known errors (`CloseReport.tsx`, `SessionsList.tsx`).
- [ ] **Step 5:** Against local Supabase with seeded test accounts, in the browser: choose a club, open the link signed out, send a prnx and a SCATT file, open the pair as the coach, save, see the inbox empty.
- [ ] **Step 6:** Commit `feat(clubs): clean up unconfirmed uploads and empty clubs`. Tell the owner: run 0031 and 0032 before merging to `main`.
