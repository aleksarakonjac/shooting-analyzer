# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js on Vercel, Supabase (Postgres, auth, file storage). Chosen by the user in conversation on 2026-11-07. UI language: Serbian.

## Users

- **Shooter (strelac):** air rifle competitor (10 m, e.g. Air Rifle 80 shots) who trains with a SIUS electronic target, a SCATT aiming tracker, and a Fitbit watch for heart rate. Does a training, then wants one combined view of that training.
- **Coach (trener):** sees only the shooters linked to them. Has a dedicated dashboard of all their shooters and their latest trainings. Can add, edit, and delete trainings for linked shooters. May follow a shooter's match live at a competition.
- **Admin:** the product owner. Approves every new registration before the account can be used. Registration is open to request, not to self-activate.
- Current scale: the owner, one coach, a few shooters. Access control and roles must be built so the product can grow.

## Product Purpose

A high-tech shooting training diary and database. It stores trainings and merges different data sources of one training (SIUS results, SCATT shot timing and aim traces, heart rate) into one unified timeline per shot, then supports review, trends, comparison, charts, and later AI analysis. Success: after a training the shooter imports files once and sees everything about it in one place, with no manual re-alignment memory required.

## Positioning

Merges three independent systems (SIUS target, SCATT tracker, Fitbit heart rate) into one per-shot record, which none of them does alone. A paper diary or a spreadsheet cannot do this.

## Operating Context

- A training is a container holding one or more matches, plus warm-up/probe shots and failed match attempts (a match can be restarted on the SIUS target without restarting SCATT, so SCATT contains extra shots).
- SIUS CSV: series, shot values, series total, MPI (X/Y mm per series and total), group size (mm), report generation time. No per-shot coordinates and no per-shot time in CSV. Newer SIUS targets give a per-shot timestamp and a cloud account (API unverified).
- SCATT `.scatt-expert` file: a SQLite database. Per-shot millisecond timestamps and probe/match flags are readable. Aim traces are in an unreadable binary block (decoding is an open spike).
- Heart rate from Fitbit: TCX file import, possibly Fitbit Web API later.
- Match boundaries are chosen by the user: last N shots, first N shots, or from an exact shot or time. The app proposes, the user confirms.
- Live mode: record match start, series, shots, and timings during a training; a coach can follow a match live (preparation time, aiming time, time between shots).
- Deleted items go to a trash with a retention period; an audit log records who changed what.

## Capabilities and Constraints

- Entry is one page, not a wizard. Only discipline is required. Date and name default automatically. SIUS (CSV, cloud, pasted text or PDF, manual series or shots), SCATT, and heart rate are optional; saving with nothing attached shows a warning.
- Dashboard: macro view with week/month/year periods and a list of trainings, newest first; clicking opens one training report.
- Desktop and mobile friendly.
- Terminology is Serbian: trening, meč, serija, pogodak, grupa.
- Open product facts: SIUS cloud API existence and access, Fitbit/Google Health API route, SCATT trace decoding.

## Brand Commitments

None yet. The user wants a "high tech" feel. Visual direction is undecided.

## Evidence on Hand

- `samples/2026-10-21T190309.csv` (SIUS CSV, 8 series of 10, total 841.1)
- `samples/export_2026-10-22_14.11.scatt-expert` (SCATT SQLite, 129 shots)
- No Fitbit TCX sample yet. No SIUS cloud access verified.

## Product Principles

- Alignment is always proposed, then confirmed by the user; the app never silently guesses which shots belong together.
- Raw imported files are kept so parsing can be redone.
- Everything optional except the minimum; partial trainings are normal.
- Roles are enforced at the data layer, not only in the interface.
- Nothing is destroyed at once: trash with retention plus an audit log.

## Accessibility & Inclusion

Serbian-language interface. Must be usable on a phone at the range.
