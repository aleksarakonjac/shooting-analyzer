# Sessions, events, venue time and heart-rate average: brief

Status: draft for the owner's confirmation (2026-11-09). Follows owner feedback on the finished Phase 1.

## 1. What changes for the owner

1. **"Novi trening" becomes "Nova sesija".**
   - A session has a type: trening, kontrolni meč or takmičenje.
   - It has a part: slobodan trening, eliminacije, kvalifikacije or finale.
   - It has a discipline, a day, from–to time, place and notes.
   - Each part is its own session, because eliminations and qualifications can be on different days.
2. **Events (optional):** the sessions of one competition or control match can be grouped under an event (name, place, dates), for example "Grand Prix Beograd 2026" with eliminations on Friday, then qualification and final on Saturday. The event page lists its sessions in order.
3. **Finals only where they belong.** The finals panel and its entry appear only on a session whose part is "finale". A finale session has no qualification series board, unless the owner wants both.
4. **Dashboard:**
   - It opens on the most recent sessions, not on an empty current week.
   - Optional filters narrow it down: date range, discipline, type, part, place, event.
   - The figures and the trend follow the filtered set.
5. **Venue time.**
   - Every session stores the time zone of the place where it happened, by default the shooter's profile zone; it can be changed at entry.
   - Times are shown in that zone. A 17:00–19:00 competition six hours away reads 17:00–19:00, with the zone named next to it when it differs from the viewer's zone.
   - Exact instants are stored in UTC.
6. **Heart-rate average** is computed over the shot window of the session with the current offset and zone. It is recomputed and stored whenever the offset or zone is changed on the report, so the dashboard always agrees with the report.

## 2. Time fixes (from the final review)

- **Session zone.** Add `trainings.tz`, the venue zone, an IANA name checked against `pg_timezone_names`. All clock times are entered and read in it: from–to, pasted clock times, and the TCX zone reinterpretation.
- **DST inside a TCX.** Store the chosen TCX zone, `hr_samples_ref.zone`, and re-run the reinterpretation per sample when the report loads. Stop folding a single constant into the offset.
- **Pasted ISO timestamps without an offset** are read in the session zone, not the browser zone.
- **Midnight crossing.** When the end time is earlier than the start time, the end is taken as the next day, with a visible "+1 dan" marker.
- **The repeated hour on the night clocks go back.** The picker shows the two 02:xx readings as "02:30 (letnje)" and "02:30 (zimsko)" only on that night. Elsewhere nothing changes.
- **Profile zone** gets the same validity check as the session zone.

## 3. Data model

These are additive migrations. The `trainings` table keeps its name in the database to avoid a risky rename; the UI calls it a session.

- `trainings`:
  - `kind` (`trening` | `kontrolni` | `takmicenje`, default `trening`);
  - `stage` (`slobodno` | `eliminacije` | `kvalifikacije` | `finale`, default `slobodno`);
  - `tz` (default the owner's profile zone);
  - `event_id` (nullable).
- **New `events` table:** `id`, `shooter_id`, `kind`, `name`, `place`, `starts_on`, `ends_on`. It has the same row-level security as sessions: owner, linked coach, admin.
- **`hr_samples_ref`:** add `zone` (nullable, the TCX zone reinterpretation). `avg_bpm` stays and is recomputed on edit.
- **`finals`:** allowed only on a session whose stage is `finale`. `save_final` checks this and that the session is not in the trash.
- **Existing rows** become `kind trening`, `stage slobodno`, with `tz` set to the owner's profile zone.

## 4. Screens

- **Nova sesija:** the Osnovno panel gains:
  - type and part (segmented controls);
  - event (a search-select over the shooter's events, or "novi događaj");
  - the venue zone (a search-select of zones, defaulting to the profile zone).
  The Results panel switches to the finals entry when the part is "finale".
- **Report:**
  - The strip shows type, part and event (linking to the event page), and the time with its zone.
  - The heart-rate panel lets the owner edit the offset and zone, and save. The average is then recomputed.
- **Event page:** `/dogadjaj/<id>`, with the event's sessions in order and their results side by side.
- **Dashboard (shooter and coach drill-down):**
  - The default view is the most recent sessions (the last 20) with their scoreline and trend.
  - A filter bar offers date range, discipline, type, part, place and event.
  - The filters are kept in the URL so a view can be bookmarked.
  - Week, month and year become quick date ranges inside the filter.

## 5. Order of work

Each step is its own commit, test-first, with e2e kept green.

1. Session zone and time fixes:
   - `trainings.tz` and `hr_samples_ref.zone`;
   - per-sample TCX zone at load;
   - pasted ISO in the session zone;
   - midnight crossing;
   - the repeated DST hour;
   - zone checks.
2. Session type and part, events table and RLS, the entry form fields, and the finals panel only for "finale".
3. Report: edit the heart-rate offset and zone, and recompute the stored average.
4. Dashboard: recent sessions by default, and the filter bar.
5. Event page.

## 6. Open points for the owner

- Part list: is "slobodan trening, eliminacije, kvalifikacije, finale" complete? For example, should "proba (probni hici)" be its own part, or does it stay as warm-up inside a session?
- Should a "takmičenje" session without an event be allowed, or must a competition always have an event?

---

# Round 2 of owner feedback (2026-11-09)

## 7. Navigation and account

- **Collapsible side rail.** The rail can collapse to icons only. The state is remembered per browser.
- **Main navigation:** Sesije, Nova sesija, (Strelci for a coach), Nalog. Korpa and Dnevnik leave the main menu.
- **Account page `/nalog`** has these sections:
  - profile: name and default time zone;
  - Veze;
  - display settings: the pip rule (see 9);
  - Korpa and Dnevnik as secondary links.
- **Sharing merges into Veze.** Each active coach link has its own sharing settings, so there is no separate Deljenje page.

## 8. Typography pass

A `/impeccable typeset` pass over the session report, the dashboard, the entry form and the account page covers:
- readable label sizes, with no uppercase micro-labels for content people actually read;
- what is bold and what is not;
- numeral sizes against their labels;
- line heights and tabular figures.

The 7-step ramp stays; the roles assigned to each step are what get revised.

## 9. Session report

- **Ostalo panel removed.** Its contents move into a "⋯" menu in the strip:
  - session information (imported files, warm-up and failed-attempt counts with an explanation, alignment details);
  - edit;
  - delete.
- **Izmeni opens the full session editor**, not just name, place and notes. The editor covers:
  - discipline, type, part, event;
  - day, time and zone;
  - files (add or replace);
  - alignment (match selection, ignored shots, confirm);
  - heart-rate offset and zone.
  Saving recomputes everything derived from these.
- **Finale:**
  - On a session whose part is "finale", the whole view is the final: stage board, stage totals, elimination.
  - On any other session there is no finals panel.
- **Series board:**
  - an "expand all" control shows every shot of every series in one list;
  - shot columns gain SCATT metrics once traces are integrated (see 11): speed over the last 0.25 s, last second, hold in the 10 (10a0), hold in 10.0, aiming time.
- **Pip rule (filled or ring):** a setting on the account page, per discipline. The default is filled at 10.5 and above for decimal disciplines and 10 for whole rings. The owner can pick the threshold.
- **Chart selector** in the timeline panel:
  - score over time;
  - time between shots (rhythm), derived from the shot timestamps, with the mean and the spread;
  - heart rate;
  - once traces are integrated: stability, speed and the other SCATT charts.
- **Chart interaction:**
  - pinch to zoom on a trackpad or touch;
  - mouse wheel zooms at a lower sensitivity than now;
  - drag or swipe pans left and right when zoomed;
  - a reset control.
- **Target at true scale:**
  - shots are drawn as 4.5 mm pellets at their real positions on the ISSF geometry, already in the app and matching the SCATT extraction in `re/targets.py` (AR10 rings Ø45.5…0.5 mm, step 5 mm, black Ø30.5 mm);
  - the zoom works the way SCATT's does.
  - Per-shot positions need SCATT traces (see 11) or a SIUS export with coordinates. Until then only the group and the MPI can be drawn.

## 10. Sessions page (the old dashboard)

- **Hierarchy:**
  - the session list is the main content, with dates prominent (weekday and date as the row lead);
  - the figures follow;
  - the chart comes last and is smaller.
- **Default view:** the most recent sessions, with optional filters (date range or a quick week/month/year, discipline, type, part, place, event).
- **Chart selector:**
  - result over time (match total and average series, over a year, month or week);
  - average heart rate;
  - group.
  "Average series plus average group" is no longer the fixed chart.

## 11. SCATT traces (pulls Phase 4 forward)

Port the decoder and analysis from `re/` (read-only reference, `re/` is not modified) into the app. This gives:
- the hit position of every shot, for the true-scale target;
- per-shot metrics (10a0, 10.0, speed 0.25 s, last second, aiming time) for the series board;
- stability, speed and coordination charts;
- later, trace replay.

The handoff is `docs/superpowers/plans/2026-11-07-phase4-scatt-traces-handoff.md`.

## 12. Revised order of work

1. Navigation, account page, merged Veze/Deljenje, and the typography pass.
2. Session model (type, part, event, zone) with the time fixes, and the full session editor.
3. Session report: the "⋯" menu, finale-only view, expand all, chart selector with the shot rhythm chart, chart zoom and pan, and the pip rule setting.
4. Sessions page: list first, recent by default, filters, chart selector.
5. SCATT traces: positions, the true-scale target, per-shot metrics and the SCATT charts.
6. Event page.
