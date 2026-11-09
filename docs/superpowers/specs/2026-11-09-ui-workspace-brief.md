# UI redesign brief: segmented workspace, "Final on TV"

Status: draft for the owner's confirmation (2026-11-09). Replaces the light "Range Hall Lane Board" look.

## 1. Job and audience

- **Shooter** reviews a training at a laptop afterwards and enters or imports one at the range on a phone.
- **Coach** reviews linked shooters and their trainings.
- Mode: **Operate**. The user must know where everything is before noticing the style.
- Owner feedback being answered: forms are scattered and misaligned; native select and date inputs; manual series entry is a bare text box; alignment flags are sprinkled everywhere; the report is a paper-like scroll with a big number, a meaningless chart and centred-series pictures.

## 2. Direction (chosen by the owner: "Finale na televiziji")

- **World:** ISSF finals broadcast graphics. Deep navy ground, slightly lighter navy panels, white figures, condensed sports numerals.
- **Colour jobs:**
  - cyan is the data series;
  - gold means "proposed, awaiting your confirmation" (always with a dashed edge and the word "Predloženo");
  - red means elimination, out of range or an error;
  - white bar with navy text is the current selection.
  - Nothing else gets colour.
- **Type:** Big Shoulders for numerals and titles (already in the project), Barlow for UI text, tabular figures everywhere numbers are compared.
- **Signature move: the broadcast "current row".** The selected series or shot is a white bar with navy text, like the active shooter on a TV leaderboard. It slides between rows. The same selection lights up at once in every panel: the row in the list, the point on the timeline, the marker on the heart-rate chart, and the group on the target.
- **Shot pips:** every shot is a small pip on its series row, filled by score band (10.5+, 10.0 to 10.4, 9.x, below 9). The whole match can be read at a glance.

## 3. Layout and topology

- **Desktop (from 1024 px):** the app fills the viewport and the page does not scroll.
  - Left: a navy rail.
  - Top: a scoreboard strip for the screen.
  - Below: a grid of panels. Each panel scrolls on its own and has a head showing the range in view (for example "Serija 3 · pogoci 21–30").
- **Tablet:** the same grid in fewer columns.
- **Phone (below 720 px):** one segment fills the screen, with tabs at the top (for example Serije · Meta · Vreme · Puls). Switching is a hard switch, with no half-scrolled state.

### Training report

- **Strip:**
  - training name, discipline, date with time from and to, place;
  - total in a broadcast score box;
  - one alignment state, with a confirm action when it is proposed;
  - edit and delete.
- **Panels:**
  1. **Serije i pogoci** (left column): leaderboard-style rows per series with total, pips and position group. A row expands into its shots (value, inner ten, time).
  2. **Meta**: an ISSF target drawn to scale.
     - It shows the group circle and the MPI of the selected series, plus the MPI of every other series as faint dots.
     - It is honest about the data: the SIUS CSV has no per-shot coordinates, so no fake shot holes are drawn.
  3. **Vreme pogodaka**: an interactive timeline.
     - x is clock time and y is score; series are shaded bands.
     - It has a legend and labelled axes; hovering shows a tooltip and clicking selects the shot.
  4. **Puls**: heart rate over the match window with shot markers, a legend and a hover readout. When there is no file or no overlap, it shows a clear empty state.
  5. **Finale**: shown only when finals exist or the discipline allows them. Stage totals are bars, with an elimination marker.
  6. **Ostalo** (small): warm-up and failed attempts, and the source files.

### New training

The page becomes a workspace with three panels and a fixed save bar.

1. **Osnovno**, a strict two-column grid of equal-height fields:
   - discipline as a custom select;
   - date plus time from and to as a custom picker;
   - name;
   - place as a search-select over the places entered before, where free text is allowed;
   - notes.
2. **Rezultati** has three tabs:
   - **SIUS fajl**: the CSV or PDF import, as now.
   - **Ručno**:
     - a stepper sets the number of series fired, giving one row per series with a total field;
     - any row expands into the shot fields of that series, and the series total is then computed from the shots.
   - **Nalepi**: one text field takes raw pasted lines (a score, or a score plus a timestamp). The app recognises them and shows a preview table before using them.
3. **SCATT i puls**: the SCATT file, the TCX file with its offset, and the match selector. The alignment state appears here once and nowhere else.

### Dashboards

- **Shooter:**
  - the strip carries the period tabs and the discipline select;
  - the panels are a scoreboard of five figures, two interactive trend charts (axes, tooltips, click a point to open that training) and the training list as leaderboard rows.
- **Coach:**
  - a shooters panel shows broadcast rows with the last training and the change against last month, plus the latest trainings across shooters;
  - opening a shooter shows the shooter dashboard.

### Other pages

These are links, sharing, trash, audit log, approvals and the sign-in pages. They get the new look as single-panel layouts, with no structural change.

## 4. Custom controls

No native browser select, date or time inputs (owner, 2026-11-09). Libraries are allowed, installed in the project only (never globally).

- **Controls:** `react-aria-components` (Adobe). The components ship unstyled and accessible, with keyboard handling, focus management, screen-reader names and locale-aware dates through `@internationalized/date` (Serbian Latin, 24-hour). They are styled entirely in the new world, with 44 px targets on the phone.
- **Charts:** Apache ECharts (owner asked for a powerful library, 2026-11-09).
  - **Charts it draws:** the shot timeline, heart rate and the dashboard trends.
  - **Interaction:** zoom and pan (dataZoom), legends, tooltips and axis pointers come built in. Charts with the same time axis share one cursor (`echarts.connect`), so the timeline and heart rate move together.
  - **Selection sync:** clicking a point selects that shot in every panel.
  - **Look:** one theme object built from the design tokens.
  - **Loading:** tree-shaken imports from `echarts/core`, loaded on the client only (`next/dynamic`), so the first paint stays light.
- **Target:** stays our own SVG. ISSF ring geometry, the group circle and the MPI must be drawn to scale in millimetres, which a general chart library does poorly.

- **Select:** the library's `Select`, a listbox with type-ahead.
- **Date and time range:** the library's `DatePicker` with a `Calendar` popover, plus two `TimeField`s for from and to.
- **Search-select:** the library's `ComboBox`, which allows a custom value for a new place.
- **Number stepper:** the library's `NumberField`.
- **Tabs:** the library's `Tabs`, also used for the phone segment switcher.
- **Tooltip and hover readout:** for the charts.

## 5. Data changes

- **Training times:** a migration adds `trainings.started_at` and `trainings.ended_at` (nullable timestamptz). `save_training` and the edit form store them.
- **Place suggestions:** distinct earlier `place` values that the viewer may see.
- **Manual entry:** a series typed shot by shot stores real shot rows without times. A series with only a total stores the total alone.
- **Paste parser:** a pure, unit-tested function. It reads one shot per line as "10.4", "10,4" or "10.4 19:03:09.250", with optional numbering, and reports the first line it cannot read.

## 6. States that must look designed

- empty period;
- training with no match (files only);
- proposed and confirmed alignment;
- no heart rate, and heart rate outside the window;
- no finals;
- loading;
- save error;
- a coach without linked shooters;
- the phone at the range.

## 7. Out of scope

- SCATT aim-trace playback (Phase 4; the target panel leaves room for it).
- Live mode.
- Fitbit API.

## 8. Order of work

Each step is its own commit, with tests and the e2e specs kept green. Accessible names stay stable so the e2e tests change little.

1. Tokens, the dark world, the app shell, the workspace grid with phone tabs, and the custom controls (unit tests for each control's keyboard behaviour).
2. Training report workspace.
3. New-training workspace, the migration for training times, the manual series entry and the paste parser.
4. Shooter and coach dashboards.
5. Restyle of the remaining pages.
6. Rewrite DESIGN.md from the built result, and a final design review with desktop and phone screenshots.
