---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: ["src/app/(app)/trening/[id]/page.tsx","src/app/(app)/trening/novi/page.tsx","src/components/ShooterDashboard.tsx"]
---

Scope: the signed-in app (shell, workspaces for the training report, new training and dashboards, plus restyled secondary pages). Visitor mode: Operate. Full plan: docs/superpowers/specs/2026-11-09-ui-workspace-brief.md.

## Direction contract

THESIS: A training reads like a finals broadcast: navy board, white figures, and one "current row" that every panel lights at once. It refuses the paper-like scrolling page and the generic grey dashboard.

OWN-WORLD: Deep navy ground, lighter navy panels with 1px steel rules and square corners. White condensed numerals (Big Shoulders), Barlow UI. Cyan is the data series. Gold with a dashed edge and a word means proposed. Red means elimination or error. A white bar with navy text means selected. Shot pips are coloured by score band. No glow, glass or gradients.

STORY: The shooter opens a training and sees the score box, the series board and the target at once. They click a series or shot and the timeline, heart rate and target follow. They confirm a proposed alignment in the one place it lives.

FIRST VIEWPORT: Navy rail on the left. A scoreboard strip across the top (name, date and time, place, total box, alignment state, actions). Below it, a panel grid that fills the viewport: series board on the left, target, shot timeline, heart rate, finals. Each panel scrolls on its own. The phone shows one panel per tab.

FORM: Finals broadcast graphics (ISSF TV), my top-ranked grounded candidate (1 of 7), taken as the pick card over the assigned "range hall after dark"; seed key 486a1af9.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
