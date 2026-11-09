---
name: Dnevnik streljaštva
description: Finale na televiziji. A finals broadcast board, with a deep navy ground, white condensed figures, one colour per job, and one current row lit across every panel.
colors:
  ground: "#0b1530"
  ground-deep: "#070e22"
  panel: "#101c3b"
  panel-raised: "#172751"
  panel-sunk: "#0a1430"
  rule: "#22335e"
  rule-strong: "#3a4f86"
  ink: "#f3f6fc"
  ink-muted: "#aab6d3"
  ink-faint: "#8190b5"
  data: "#39c6f0"
  data-soft: "rgb(57 198 240 / 0.16)"
  proposed: "#f2c14e"
  proposed-soft: "rgb(242 193 78 / 0.14)"
  danger: "#ff6b74"
  danger-soft: "rgb(255 107 116 / 0.14)"
  select-bg: "#ffffff"
  select-fg: "#0b1530"
  select-hover: "#d9e2f5"
  select-active: "#b9c7e6"
  select-muted: "#3a4a72"
  select-pip: "#8b98bb"
  target-card: "#e9ecef"
  target-ink: "#14181b"
  pip-top: "#39c6f0"
  pip-ten: "#2a8fb4"
  pip-nine: "#5c6e9c"
  pip-low: "#ff6b74"
typography:
  display:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  plate-numeral:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(1.8rem, 2.6vw, 2.6rem)"
    fontWeight: 800
    lineHeight: 1
  row-numeral:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 800
    lineHeight: 1
  title:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  ui:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    letterSpacing: "0.02em"
  panel-label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 700
    letterSpacing: "0.1em"
  figure-label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 700
    letterSpacing: "0.12em"
rounded:
  board: "2px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  gutter: "clamp(1rem, 3vw, 1.75rem)"
components:
  button-primary:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-fg}"
    typography: "{typography.ui}"
    rounded: "{rounded.board}"
    padding: "0 1rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.select-hover}"
    textColor: "{colors.select-fg}"
  button-primary-active:
    backgroundColor: "{colors.select-active}"
    textColor: "{colors.select-fg}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.board}"
    padding: "0 1rem"
    height: "2.5rem"
  button-quiet-hover:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.board}"
    padding: "0 1rem"
    height: "2.5rem"
  button-danger-hover:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
  input:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.board}"
    padding: "0 0.7rem"
    height: "2.5rem"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    padding: "1rem"
  panel-head:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.panel-label}"
    padding: "0 1rem"
    height: "2.5rem"
  board-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0 1rem"
    height: "3rem"
  board-row-current:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-fg}"
  score-box:
    backgroundColor: "{colors.panel-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.plate-numeral}"
    rounded: "{rounded.board}"
    padding: "0.5rem 0.75rem"
  score-box-total:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-fg}"
  flag-proposed:
    backgroundColor: "{colors.proposed-soft}"
    textColor: "{colors.proposed}"
    rounded: "{rounded.board}"
    padding: "0 0.65rem 0 0.5rem"
    height: "1.9rem"
  flag-confirmed:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.board}"
    padding: "0 0.65rem 0 0.5rem"
    height: "1.9rem"
  seg-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    padding: "0 1rem"
  seg-item-selected:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-fg}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.board}"
    padding: "0 0.75rem"
    height: "2.5rem"
  nav-link-current:
    backgroundColor: "{colors.select-bg}"
    textColor: "{colors.select-fg}"
---

# Design System: Dnevnik streljaštva

## Overview

**Creative North Star: "Finale na televiziji"**

A training reads like an ISSF finals broadcast. The ground is a deep navy board. Figures sit on it in white condensed numerals, and every colour does exactly one job. The interface is a working scoreboard, not a document. On desktop, the signed-in app is a fixed board: a rail on the left, a scoreboard strip across the top, and a grid of panels that fills the viewport. Each panel scrolls on its own and the page itself does not scroll. Density is high and deliberate. Figures are large and everything around them is small and quiet.

The signature is the current row. When the shooter picks a series or a shot, that row turns into a white bar with navy text. Every panel lights the same selection at the same moment: the series board row, the shot table row, the large white point on the timeline, the white marker on the heart-rate chart and the white dot in the drift view. Because white is reserved for that bar and for primary actions, the selection can always be read from across the room.

The world is flat and graphic. It uses square corners, 1px steel rules between panels and tonal navy steps for depth. Glow, glass, decorative gradients and a light theme are all rejected. It is dark only.

**Key Characteristics:**
- Deep navy ground with lighter navy panels separated by 1px steel rules (a grid gap of 1px showing the rule colour).
- White condensed numerals (Big Shoulders 800) for every score and total; Barlow for all UI text.
- One colour per job: cyan = data series, gold dashed + word = proposed, red = elimination or error, white bar = current selection.
- Shot pips banded by score, with the 10.0–10.4 band drawn as a ring rather than a filled dot.
- Near-square corners (2px), no decorative shadows. One soft shadow is reserved for floating popovers.
- Desktop: a fixed panel grid. Phone: one panel per tab with a bottom navigation bar.

## Colors

The palette is a navy broadcast board with four signal colours, and each signal has exactly one meaning.

### Primary
- **Broadcast White** (select-bg): the current row. It is the bar under the selected series, shot, nav link, segmented tab, calendar day and listbox option. It is also the fill of primary buttons and of the total score box. Navy text (select-fg) always sits on it, with Slate Ink (select-muted) for secondary text on the bar. Hover darkens it to Pale Steel (select-hover) and press to Pressed Steel (select-active).
- **Series Cyan** (data): the data series. It colours chart lines and points, the group circle on the target, MPI markers of other series, the top pip band, focus rings, links, live status and positive deltas. Its soft tint (data-soft) marks a file drop zone under drag.

### Secondary
- **Proposal Gold** (proposed): proposed and awaiting confirmation. It always comes with a dashed edge and a word (for example "Predloženo", "poravnanje nije potvrđeno"). Its tint (proposed-soft) fills the proposed badge and the strip confirmation bar.

### Tertiary
- **Elimination Red** (danger): elimination, out of range or error. It is used for the below-9 pip band, invalid field edges, error text, alerts, destructive buttons and negative deltas. Its tint (danger-soft) fills alerts and the danger button on hover.

### Neutral
- **Board Navy** (ground): the app ground and the browser theme colour.
- **Rail Navy** (ground-deep): the rail, the scoreboard strip and the phone tab bar.
- **Panel Navy** (panel): panel bodies.
- **Raised Navy** (panel-raised): inputs, triggers, popovers and row hover.
- **Well Navy** (panel-sunk): wells inside panels, such as the shot table, chart plot areas, score boxes and the scoreline.
- **Steel Rule** (rule): the 1px rules between panels, rows and table cells.
- **Strong Steel** (rule-strong): control edges, the scoreline frame, the phone nav top edge and scrollbars.
- **Figure White** (ink): primary text and figures.
- **Muted Steel** (ink-muted): secondary text and nav links at rest (8.3:1 on panel).
- **Faint Steel** (ink-faint): tertiary text, axis labels, placeholders and series indices (5.1:1 on panel).
- **Target Card / Target Ink** (target-card, target-ink): the printed ISSF target face. It is the only paper-coloured object on the board, because it depicts a physical card.

### Score bands
- **Pip Top** (pip-top, 10.5 and up): a filled cyan dot.
- **Pip Ten** (pip-ten, 10.0–10.4): a 2px ring in deep cyan, not filled.
- **Pip Nine** (pip-nine, 9.x): a filled slate dot. On the white bar it becomes select-pip so it stays visible.
- **Pip Low** (pip-low, below 9): a filled red dot.
- An inner ten adds a cyan outer ring around the pip and an asterisk in the shot table.

### Named Rules
**The One Job Rule.** Cyan means data, gold means proposed, red means error or elimination, and white means selected. Never use a signal colour for decoration, and never give one colour two meanings.

**The Current Row Rule.** A white bar with navy text means the current selection or the primary action. Every panel that shows the selected series or shot lights it at the same time.

**The Not Colour Alone Rule.** State always carries a word and a form along with its colour: a dashed or solid edge, a pennant or check, a struck or dashed rule, or a ring or filled pip.

## Typography

**Display Font:** Big Shoulders (self-hosted variable woff2, OFL, with Arial Narrow as the metric-adjusted fallback)
**Body Font:** Barlow 400/500/600/700 (Google via next/font, Latin and Latin Extended, with a system-ui fallback)
**Label/Mono Font:** ui-monospace, used only for pasted shot text

**Character:** Big Shoulders gives the tall, condensed, broadcast-graphic numerals and uppercase titles. Barlow is a slightly technical grotesque that keeps the dense UI legible on a phone at the range.

### Hierarchy
- **Display** (Big Shoulders 800, 1.8rem, line-height 1, uppercase): screen titles in the scoreboard strip and on pages, auth titles and the empty heart-rate word. On a phone it steps down to 1.4rem.
- **Plate numeral** (Big Shoulders 800, clamp(1.8rem, 2.6vw, 2.6rem), line-height 1): the score-box figure. In the scoreline and on a phone it is 1.8rem.
- **Row numeral** (Big Shoulders 800, 1.4rem): series totals, list totals, strip counts and coach-card names. Series indices use 1.15rem in Faint Steel.
- **Title** (Barlow 600, 1.15rem): page subsections and emphasised rows.
- **Body** (Barlow 400, 1rem, line-height 1.5, max 70ch): text and inputs.
- **UI** (Barlow 700, 0.9rem, +0.02em): buttons, nav links and segmented tabs (600 for nav and tabs).
- **Panel label** (Barlow 700, 0.82rem, +0.1em, uppercase): panel titles such as SERIJE, META and PULS, and table column heads (0.72rem, +0.08em).
- **Figure label** (Barlow 700, 0.72rem, +0.12em, uppercase): the label paired with a figure inside a score box ("UKUPNO").

The ramp has seven steps (0.72, 0.82, 0.9, 1, 1.15, 1.4 and 1.8rem) plus the plate clamp. Nothing goes between them.

### Named Rules
**The Figures Are Condensed Rule.** Every score, total and count that a shooter compares is set in Big Shoulders 800. Every compared figure in tables and charts uses tabular numerals.

**The Seven Steps Rule.** Use only the seven ramp sizes and the plate clamp.

## Layout

The signed-in shell is a two-column grid: a 13rem rail and the main area, at 100dvh. A workspace is a scoreboard strip followed by a panel grid. The grid uses 12 columns (`--ws-cols`). Panels sit on a background of rule colour with a 1px gap, so the gap draws the steel rules. Each panel has a 2.5rem head and a body that scrolls on its own with overscroll containment. On desktop the page never scrolls.

- **Desktop (1024px and up):** a fixed board. The report places the series board on the left and the target, shot timeline, heart rate and finals around it.
- **Tablet (721–1023px):** two columns. Panels are at least 20rem tall, wide panels span both columns, and the page scrolls.
- **Phone (720px and below):** the rail becomes a fixed bottom navigation bar (about 4.25rem). The strip wraps to the title, then one row with the score box and alignment state. A sticky tab bar shows one panel at a time, and the panel heads are hidden because the tab names the panel. Controls grow to 2.75rem.

Spacing is on a 4px base (0.25–3rem). The page gutter is clamp(1rem, 3vw, 1.75rem). Single-panel pages cap at 72rem (44rem when narrow). Forms use a two-column grid that collapses to one column below 520px.

## Elevation & Depth

The board is flat. Depth comes from tonal navy steps: ground-deep for rail and strip, ground, panel, panel-raised for interactive surfaces, and panel-sunk for wells. Panels are separated by 1px rules, never by shadows. The only shadow belongs to things that float above the board: popovers, listboxes, calendars and tooltips.

### Shadow Vocabulary
- **Popover lift** (`box-shadow: 0 2px 4px rgb(0 0 0 / 0.35), 0 14px 32px -10px rgb(0 0 0 / 0.6)`): select and combo popovers, calendar dialogs and tooltips only.

### Named Rules
**The Flat Board Rule.** Nothing resting on the board casts a shadow. Use no glow, glass or decorative gradient fills.

## Shapes

Corners are near-square (2px) on every control, panel frame, badge, score box and tooltip. The phone bottom nav and tab bar are fully square. Edges are 1px: Steel Rule between surfaces and Strong Steel around controls. Dashed edges carry meaning. Gold dashed means proposed. A Strong Steel dashed edge means an empty file drop zone, which turns solid when filled. A dashed read-only input marks a computed value. The only round forms are shot pips, target rings and chart points.

## Components

### Buttons
Buttons are solid and broadcast-white. They are the loudest thing on the board after the current row.
- **Shape:** near-square (2px), 2.5rem tall (2.75rem on a phone), padding 0 1rem.
- **Primary:** a white fill with navy Barlow 700 text at 0.9rem. Hover is Pale Steel and press is Pressed Steel. Disabled is 50% opacity.
- **Quiet:** transparent with a Strong Steel edge and white text. Hover fills it with Raised Navy.
- **Danger:** transparent with a red edge and red text. Hover adds the red tint.
- **Focus:** a 2px cyan outline.

### Chips (alignment flag)
- **Proposed:** gold text, a gold dashed 1px edge, a gold tint, a pennant icon and the word "Predloženo". It appears in one place per screen, next to its confirm action.
- **Confirmed:** white text, a solid Strong Steel edge, a check icon and the confirming word.

### Cards / Containers
- **Panel:** Panel Navy with no radius inside the grid. It has a 2.5rem head with an uppercase tracked label, an optional faint range and right-aligned actions, a 1px rule under the head, and a 1rem body.
- **Score box:** a Well Navy box with a Strong Steel edge. It holds a small uppercase figure label and a Big Shoulders numeral. The total box inverts to white with navy figures, the score bug of the broadcast.
- **Scoreline:** a single framed Well Navy row of label and figure pairs, divided by 1px rules. It reflows to 3 columns, then 1.
- **Cards inside panels are flattened:** source sections sit directly in the panel and are separated by rules.

### Inputs / Fields
- **Style:** Raised Navy fill, a Strong Steel 1px edge, 2px corners, a 2.5rem height, a cyan caret and a Faint Steel placeholder. Labels are Barlow 600 at 0.82rem in Muted Steel.
- **Hover / Focus:** hover lightens the edge to Faint Steel. Focus gives a 2px cyan outline and a cyan edge.
- **Error:** a red edge and red helper text.
- **React-aria controls:** select triggers, combo fields, number steppers, date fields and date-time ranges share the field style. Date segments light white and navy when focused. Calendar days light white when selected and get a cyan underline for today.
- **File field:** a dashed Strong Steel drop zone with a white "Izaberi" button. On drag or hover the edge and tint go cyan. When filled the edge turns solid.

### Navigation
- **Rail:** Rail Navy with the wordmark (Big Shoulders 800, uppercase) under a short cyan bar. Links are Barlow 600 with 20px line icons in Muted Steel. Hover goes to Panel Navy and white. The current page is the white bar.
- **Phone:** a fixed bottom bar with icons over labels at 0.72rem and square cells.
- **Segmented tabs:** a Well Navy frame with a Strong Steel edge and 1px rule dividers. The selected item is the white bar.
- **Phone workspace tabs:** a sticky Rail Navy bar. The selected tab shows a 3px white underline.

### Series Board (signature)
This is the match as a finals leaderboard. Each series is a 3rem row: a faint condensed index, a run of score-band pips, the group in mm, the series total as a row numeral, and the running total "Σ" in small faint text. Rows have 1px rule separators and hover in Raised Navy. The selected series becomes the white bar and opens its shot table. The shot table is a Well Navy table with uppercase column heads, and the selected shot is also the white bar. Position groups get a small uppercase faint header.

### Target and Drift
The ISSF target is drawn as a printed card (Target Card / Target Ink) with a cyan group circle and tint. The selected series MPI is a white cross, and other series MPIs are numbered cyan points. Next to it, the drift view plots MPIs on a Well Navy square with dashed rule rings, and the selected MPI is a white dot. On a phone it stacks under the target.

### Charts (ECharts)
Canvas colours mirror the tokens in the `CHART` constant. Axes use Steel Rule, axis labels use Faint Steel in Barlow, and split lines are dashed rules. Series data is cyan. Series bands alternate faint cyan tints, and the selected band is a faint white. The selected shot is drawn large and white with a navy edge. Tooltips are the white bar with navy text and 2px corners.

## Do's and Don'ts

### Do:
- **Do** set every compared figure in Big Shoulders 800 with tabular numerals.
- **Do** mark the current selection with the white bar and navy text (select-bg and select-fg) in every panel at once.
- **Do** pair gold with a dashed edge and a word whenever something is proposed, and show it in one place per screen.
- **Do** separate panels with the 1px rule gap. Keep depth to the navy tonal steps.
- **Do** draw the 10.0–10.4 band as a ring and keep the other bands as filled dots.
- **Do** keep chart colours in `CHART` in sync with tokens.css whenever a token changes.
- **Do** give phone controls 2.75rem and show one panel per tab.

### Don't:
- **Don't** add glow, glass, blur or decorative gradient fills.
- **Don't** use cyan, gold, red or white for decoration or for a second meaning.
- **Don't** signal state with colour alone.
- **Don't** round corners beyond 2px or put shadows on resting surfaces.
- **Don't** add a light theme. The board is dark only.
- **Don't** nest cards inside panels. Sections inside a panel are separated by rules.
