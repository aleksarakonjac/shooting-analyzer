# Shooting Analyzer: design

Date: 2026-11-07. Status: draft for approval. Language of the product UI: Serbian. This document is in English so a builder can plan from it; Serbian domain terms are given where they appear in the UI.

## 1. Intent and why

A high-tech shooting training diary for air rifle shooters (10 m, e.g. "Air Rifle 80"). Today a training produces data in three unconnected places: a SIUS electronic target (results), a SCATT aiming tracker (shot timing and aim trace), and a Fitbit watch (heart rate). The owner (a competitive shooter) wants one place that stores trainings, merges the three sources into one per-shot record on a shared timeline, and then supports review, trends, comparison, charts, and AI analysis of patterns across weeks and months, including outside factors (time of day, temperature, other workouts, rest, volume).

Primary scene: after a training, import files once and see everything about it together, without having to remember alignment details. Secondary scene: a coach follows a match live and records timing.

## 2. Goals

1. One training = one unified record. SIUS result + SCATT shot timeline + heart rate on a single timeline, per shot.
2. Fast, simple data entry: one page, almost everything optional, sensible defaults.
3. Live tracking of a training or match (coach panel with stopwatch phases; shooter marker panel) so alignment never depends on memory.
4. Dashboard for macro review (week / month / year) and a list of trainings; click opens a full training report.
5. Accounts, roles (shooter, coach, admin), coach-shooter linking, enforced at the database level.
6. AI-assisted pattern finding across trainings and outside factors (a later phase, see roadmap).
7. Works on desktop and phone, fully usable on a phone at the range.

## 3. Non-goals

- Replacing SIUS or SCATT software, or controlling the hardware.
- Real-time per-shot results from the SIUS system during a live match (not available; coach enters shots manually or imports later).
- Public product with open self-registration (admin approves every account).
- Native mobile apps (responsive web only).
- Competition scoring/officiating features.

## 4. Anti-goals (what would make it a failure even if it works)

- Slow or complicated data entry.
- Unclear usage: a new user (or the owner after a week away) cannot tell what to do next.
- Silent wrong alignment: the app guessing which shots belong together without the user seeing and confirming it.
- A "gamer/neon" look, an interface that is too dense or too small to read, or one that is empty and decorative.

## 5. Users and roles

- **Shooter (strelac):** sees and manages only their own data. Can delete any of their trainings, including ones a coach created. Can use a minimal marker panel during a training (start probe, start match, end match, optional series mark) used only to align imported files.
- **Coach (trener):** sees only shooters linked to them. Has a dedicated coach dashboard (not the shooter's screens): cards for all linked shooters, a shooter selector, and their latest trainings, with a shooter drill-down. Can add, edit, and delete trainings of linked shooters. Can run the full live control panel.
- **Admin:** the owner. Approves every registration before the account becomes usable. Registration is a request; the account is inactive until approved.
- **Linking:** shooter and coach connect by email or username; the other side must confirm; either side can end the link. (Builder call: after unlinking, the coach loses access immediately; data created by the coach stays with the shooter.)
- **Coach visibility (owner decision).** By default a linked coach sees all of the shooter's trainings: results, heart rate from the training, and original files. Fitbit and calendar data (other activities, sleep, resting heart rate, calendar events) is hidden from the coach by default; the shooter can allow it for all trainings generally, for individual trainings, or for a chosen period. The coach never sees the shooter's connected accounts themselves or personal data outside trainings. The shooter can revoke a link at any time.
- One shooter may have several coaches; one coach has several shooters. The audit log shows each user the history of their own data; the admin sees all.
- Current scale: owner, one coach, a few shooters. Access control must be built so it can scale.

## 6. Domain model

- **Discipline (disciplina):** a fixed list: Vazdušna puška, MK puška (trostav), Vazdušni pištolj, MK pištolj. A discipline does not fix the number of shots: shots per training or match vary and are taken from the entered or imported shots and series (the sample CSV's "Air Rifle 80" is read as discipline Vazdušna puška with 80 shots, not as a separate discipline). MK puška trostav has positions (stavovi: kneeling, prone, standing); series and shots are grouped and analysed per position as well as overall. Scoring format (decimal versus whole rings, maximum value, shots per series) is derived per discipline and per import, not hard-coded to the sample.
- **Training (trening):** container. Fields: shooter, discipline (required), date (default today), name (default "dd.mm. discipline"), place, notes, optional context. Contains one or more Matches, plus unmatched shots.
- **Match (meč):** a competition-format string of shots (e.g. 80 shots) inside a training. A training may hold several matches (e.g. two in one day).
- **Warm-up / probe shots and failed match attempts:** shots in a training that are not part of a confirmed match. The owner's drill: after probe shots, start a match; the first 5 match shots must each be 10.5 or higher or sum to at least 53.0; otherwise restart the match on SIUS but not on SCATT. So SCATT contains extra shots that never appear in SIUS. These are stored as a separate group ("attempts / warm-up"), not dropped.
- **Series (serija) and Shot (pogodak):** a match has series (10 shots each in the sample); a shot has value (e.g. 10.6), ring geometry coordinates when known, timestamp when known, optional SCATT trace, optional heart-rate sample window.
- **Source files:** the raw imported files are stored unchanged (Supabase Storage) so parsing can be redone.
- **Context:** optional per-training factors for analysis (see section 11).
- **Live session:** a recorded timeline of phases (probe, match, aiming, pause, long pause, weapon down, off firing line, end) with timestamps.
- **Trash and audit log:** deletions go to a trash with a retention period (builder call: 30 days default, configurable), then are removed permanently. An audit log records who created, changed, or deleted what.

## 6a. Scoring rules and finals (owner-supplied)

Scoring rules per discipline (used for validation and display; owner-stated, no sample for the pistols):

| Discipline | Shot score | Max shot | Max series (10 shots) | Match |
|---|---|---|---|---|
| Vazdušna puška | decimal, one decimal | 10.9 | 109.0 | 6 series, max 654.0 |
| MK puška trostav | whole rings, 0 to 10 | 10 | 100 | 3×20, max 600 |
| Vazdušni pištolj | whole rings, 0 to 10 | 10 | 100 | 6 series, max 600 |
| MK pištolj | whole rings, 0 to 10 | 10 | 100 | same as air pistol, max 600 |

The match column is a **reference only, never enforced**: a training can have any number of series (e.g. 8 series gives a score above the 60-shot reference maximum), and the app must not reject or cap totals. Only shot and series limits are validated.

**Finals (finale):** a final is a recorded part of a match day, entered manually, from a SIUS PDF, from the SIUS API, or by copying SIUS timestamps of the final shooting. A final has decimal scoring (one decimal) for the disciplines below. Not needed yet for MK pištolj.
- **Vazdušna puška and Vazdušni pištolj:** 24 shots: two series of 5, then single shots; after every second single shot the lowest-placed shooter is eliminated. The top two shooters fire the full 24 shots.
- **MK puška trostav:** up to 35 shots: one series of 10 kneeling, one of 10 prone, two series of 5 standing, then single shots with an elimination after each; the top two fire the full 35 shots.
- A recorded final is a special kind of match: ordered shots in stages (series stages, then single-shot stages), decimal values, optional timestamps, and the shooter's final placement or elimination point. The format of SIUS final PDFs and API output is not yet seen; the final importer needs a sample.

## 7. Data sources and import

### 7.1 SIUS CSV (sample: `samples/2026-10-21T190309.csv`)
Parseable now (only one sample, for Vazdušna puška; samples for the other three disciplines are still needed and parsers must be verified against them). Contains: discipline name (e.g. "Air Rifle 80"), report generation time, total (e.g. 841.1), inner tens, per-series shot values (10 per series, one decimal), series totals, MPI per series and overall as X/Y in mm, group size per series and overall in mm. Does NOT contain per-shot coordinates or per-shot time. The group-size symbol is mis-encoded in the sample; the parser must tolerate it. Direction of group offset from centre is derived from MPI X/Y. Report generation time is treated as the approximate end of the match.

### 7.2 SCATT file (sample: `samples/export_2026-10-22_14.11.scatt-expert`)
A SQLite database (tables `persons`, `sessions`, `shots`, `traces`). Readable now: person, session (distance, caliber, position, timer start), and per-shot millisecond timestamps with a match/probe flag. In the sample: 129 shots (26 flagged probe, 103 flagged match), first shot 17:29 local, last 18:54, SIUS report 19:03. Not yet readable: the aim traces and per-shot X/Y, stored in the `traces.data` blob (about 2 MB across 262 records), which resists standard decompression (entropy about 7.98 bits/byte). The spike later succeeded (see docs/superpowers/plans/2026-11-07-phase4-scatt-traces-handoff.md); implementation is Phase 4. Until it succeeds, SCATT contributes shot timing only. The schema must leave room for traces and per-shot SCATT metrics.

### 7.3 Heart rate
- Fitbit TCX file import (manual, first). Sample: `samples/4740240563405875576.tcx`, activity Sport "Other", 2026-11-04 08:54:50 to 09:44:48 (about 50 minutes), 1472 trackpoints with time and heart rate only (no GPS), heart rate 74 to 120 bpm, irregular sampling (1 to 3 seconds). **Its timestamps carry the offset `+03:00`, but Serbia is UTC+1 in November.** So either the watch or app wrote the wrong zone, or the local time was labelled with a wrong offset. The importer must read offsets as given, show the resulting local time, and offer a time-zone correction (treat the clock as local time of a chosen zone) in addition to the seconds offset. Never assume the offset is right.
- Later: Fitbit Web API via OAuth, or the Google Health route. Feasibility of each is unverified and must be checked before depending on it. Google Health Connect is on-device only and has no web access.

### 7.4 Other SIUS paths (later, unverified)
- SIUS cloud for newer targets (per-shot timestamps). Existence and access of an API is unverified. Credentials never go through chat; they would live in the app's own secure configuration.
- SIUS PDF report (sample: `samples/50m Rifle 3x20.pdf`, MK puška trostav, 3×20, dated 2026-10-02). The PDF has a real text layer, so it can be parsed. It contains: shooter name, report time, discipline "50m Rifle 3x20", overall total as whole rings with inner-ten count and decimal total (590-38x, 617.3), per-position totals (Kneeling, Prone, Standing, each as two 20-shot-halves whole and decimal), per-series (series 1 and 2 per position, 10 shots each) whole-ring value per shot with an inner-ten "x" flag and a direction arrow (the shot's direction from centre, not coordinates), series totals (whole and decimal), and MPI X/Y in mm per series. It does NOT contain decimal values per shot (the match is shot on whole rings, so whole rings is the official score; the decimal totals are informational), per-shot coordinates, or per-shot time. Parsing is by text extraction with a review step before saving; layout changes between SIUS versions are a risk, so unrecognised layouts fall back to manual entry. This sample confirms that trostav positions must be a first-class grouping (position, then series).
- Pasted competition result text: manual entry with the same review step.
- Manual entry of series or individual shots.

### 7.5 Context sources (later)
Google Calendar ("Sport" calendar, read-only), Fitbit (other activities, sleep, resting heart rate), weather for date and place, and values computed from the database (time since previous training, shots in previous training).

## 8. Alignment and match selection

- The app always proposes; the user confirms. No silent matching.
- Match selection offers three modes with no default: last N shots, first N shots, or "from this exact shot (or time)". N comes from the SIUS result. The same options apply to heart-rate time ranges.
- Boundaries are proposed from timestamps where available (SCATT shots, SIUS report time as match end, live-session markers). For SIUS CSV (no per-shot time), shots are matched by order within the confirmed match.
- If shot counts differ (for example 80 in SIUS versus 103 in SCATT in the sample), the app shows the mismatch and the user resolves it; shots outside the confirmed match stay in the training as warm-up or failed attempts.
- Live-session markers (start of probe, start and end of match, series marks, timings) are used automatically when present, so the user does not have to remember boundaries after the training.
- Heart-rate clock offset can be adjusted manually (seconds, with a slider).
- Retention of the owner's own drill rule is not built into the product; it was a training task.

## 9. Screens and flows

Look: see section 10.

- **Shooter dashboard:** macro view with period switch (week / month / year); summary figures (trainings, shots, average, group size trend, average heart rate); trend charts; list of trainings newest first; click opens the training report. Not a detailed latest-training view.
- **New training (single page, not a wizard):** required: discipline only. Defaults: date today, name "dd.mm. discipline". Order of sections: SIUS results first (CSV, SIUS cloud, pasted text or PDF, manual series or shots), then SCATT (optional), then heart rate (optional: TCX, or Fitbit). A merged preview appears as soon as something is attached, including match-boundary choices and mismatch warnings. Saving with nothing attached shows a confirmation warning.
- **Training report:** per-training detail: matches, series, shots on one timeline with value, SCATT metrics, heart rate; group display with direction of offset; attempts and warm-up shown separately.
- **Coach dashboard:** a dedicated view (not the shooter's screens): cards for all linked shooters, selector, latest trainings, drill-down into a shooter, and the ability to add, edit, and delete that shooter's trainings.
- **Live panel (coach):** one large main button that always means "next phase"; the stopwatch runs by itself and records durations per phase. Flow: start probe, end probe and start match, then loop: start aiming, end aiming (which is the moment of the shot, confirmed by the owner), pause until the next aiming. Secondary states recorded separately so they do not distort averages: longer pause, weapon put down, left the firing line. End of match closes the match. Optional shot value entry (or leave for import). The coach can follow a competition match.
- **Shooter marker panel:** minimal: start probe, start match, end match, optional series mark. Used for alignment only.
- **Accounts:** registration request, admin approval screen, coach-shooter linking by email or username with confirmation.
- **Trash and log:** view/restore trash within retention; view audit log.

## 10. Visual direction (chosen, Impeccable "Operate" mode)

Chosen world: **Range Hall Lane Board.** The ISSF shooting hall as the source of type, palette, density, and one signature move; navigation and controls stay standard web components.

- Palette (starting values, final tokens set at build): light concrete ground (about `#E9EBEC`), near-black ink (`#14181B`), safety orange (`#FF5A1F`, the chamber-flag colour), hi-vis yellow (`#F2D400`) used with black hatching for warnings, and one data blue (`#1F5FBF`). Colour appears in large flat fields per region, not as scattered accents.
- Materials: painted concrete, enamel lane plates with stencilled numerals, signal hatching.
- Signature move: black "lane plates" with large numerals for the key figures, and an **orange flag** meaning "proposed, awaiting your confirmation" versus **black** meaning "confirmed". This expresses the alignment-confirm principle.
- State is never colour alone: solid, dashed, half-height, and struck-through line forms accompany colour (accessibility, bright range light).
- Rejected: neon/gamer styling, too dense or tiny, too empty or decorative. Required: sports-analytics feel, equally good on phone and laptop.
- Build path: code-first (no mockup image step). Impeccable `PRODUCT.md` is at the project root and records product truth; `DESIGN.md` is written after the first build.

## 11. AI analysis (later phase)

Purpose: find patterns a person cannot see, across weeks, a month, and multiple months, between performance (average, group size and direction, hold, heart rate) and outside factors:
- time of day, temperature, weather on the day;
- other workouts that day (conditioning, strength) and when;
- time since the previous training and how many shots were fired;
- sleep, resting heart rate, general condition.

Design stance (builder call, flag to owner): statistics are computed by ordinary code so numbers are correct; an LLM explains them in plain Serbian and suggests questions. The app says "not enough data yet" instead of presenting weak correlations as findings. Output: weekly and monthly summaries with observations, plus a free question box ("why is my group bigger in the morning?").

Context sources, ideal state: pulled automatically (Fitbit for other activities, sleep, and resting heart rate; the owner's Google "Sport" calendar for planned training; weather and database facts), with manual optional fields as fallback. Calendar event names are mostly recurring and consistent; the app maps event-series names to types (shooting, conditioning, strength, rest, other) once, asks for confirmation on new names, and remembers rules. Each user connects their own accounts; a coach does not see a shooter's Fitbit or calendar beyond what that shooter shares.

## 12. Technology (agreed in conversation)

Next.js (App Router) on Vercel; Supabase for Postgres, authentication, and file storage. Reasons: Supabase gives auth and row-level security for the coach/shooter rule at the database level, plus storage for raw files; Vercel is first-class for Next.js. Netlify and Neon were considered and not chosen. Parsing of SQLite (SCATT) files must work on the server (or in a worker); the choice of library is left to the builder. UI language Serbian.

## 13. Roadmap and open spikes

Phases:
1. **Core:** accounts and approval, roles, coach-shooter linking, database and row-level security, SIUS CSV import, SCATT import (shot timing), TCX import, alignment and match selection with confirmation, single-page new training, training report, shooter and coach dashboards, trash and audit log, Serbian UI in the Lane Board style, responsive.
2. **Live tracking:** coach control panel and shooter marker panel, automatic use of markers during import.
3. **Context and AI:** Fitbit and calendar integration, weather, statistics, LLM summaries and questions.
4. **SCATT traces:** only when decoding succeeds.

Open spikes (must be resolved or consciously deferred; the schema stays ready):
- **SCATT trace decoding.** Standard codecs failed. SCATT Expert for macOS is installed locally (Qt 6 application). A Ghidra project of an arm64 copy of the binary exists under `re/`, with analysis finished; the search for the function that reads `traces` is the next step. UPDATE: decoding succeeded; the owner confirmed it is their licensed program and own data. Original note: success was not guaranteed, and the owner had to decide whether the software licence permits this analysis. Work on a copy, never on the installed original.
- **SIUS cloud API:** existence and access unverified.
- **Fitbit / Google Health route:** feasibility of API access unverified.

## 14. Constraints

- Everything optional except discipline, so partial trainings are normal.
- Raw imported files are always kept.
- Row-level security enforces roles; the UI is not the only gate.
- Nothing is destroyed immediately: trash plus audit log.
- Credentials and tokens for external services are never entered into chat; they are stored in the app's server-side configuration.

## 14a. Calls made by the designer (not decided by the owner; review these)

- **Phase 1 stands alone.** In Phase 1 alignment is timestamp-proposed plus manual confirmation. The schema carries nullable marker-derived boundaries so Phase 2 plugs in without rework.
- **Matching rule.** Within a confirmed match, SIUS shots map to SCATT shots by order, one-to-one and contiguous. The SCATT probe/match flag only informs the proposal. "Confirmed" means the user accepted the selection (last N / first N / from shot X). The user can mark individual shots as ignored (missed or double-recorded) without breaking contiguity of the rest.
- **Unresolved alignment can be saved.** A training may be saved with alignment still "proposed" (orange flag) and finished later. Statistics that depend on alignment exclude unconfirmed matches; SIUS-only figures still count.
- **Time.** All times stored in UTC; displayed in a per-user time zone (default Europe/Belgrade). The SCATT sample's timestamps are millisecond Unix epoch UTC (the shown 15:29 UTC is 17:29 local). TCX times are UTC. The SIUS CSV report time is local to the laptop and is interpreted in the user's time zone. The heart-rate offset slider corrects residual clock error.
- **Uploads.** Files upload directly to Supabase Storage from the browser (not through a serverless function), default limit 25 MB per file, per-user quota deferred.
- **Notifications.** Supabase Auth transactional email covers confirmations and approval results; the admin sees pending registrations in the app and gets an email. The first admin is the owner, created by a seed step, not by self-registration.
- **Trace decoding (Phase 4)** is unblocked (decoding done, see handoff doc); Phase 1 only reserves nullable trace and per-shot-metric columns.

## 15. What is left to the builder

Database schema and indexes, parsers, library choices, exact RLS policies, the audit-log mechanics, retention configuration, stopwatch implementation details (offline tolerance on a phone at a range), chart choices, final design tokens and component details within the chosen direction, and the order of tasks inside each phase.
