# Phase 4 handoff: SCATT aim traces (decoded, not yet implemented)

Status: the spike SUCCEEDED. `traces.data` is decoded and verified on `samples/export_2026-10-22_14.11.scatt-expert`
(262/262 traces, 190735 samples, 129 shots, all checksums OK). Implementation into the app is a later phase;
Phase 1 only reads shot times and reserves nullable trace / per-shot-metric columns.

Source of truth (do not edit from the app sessions): `re/NOTES.md` (format), `re/NOTES-render.md` (display, targets),
`re/NOTES-analysis.md` (metrics), reference code `re/decode_traces.py`, `re/scatt_display.py`, `re/analysis.py`,
`re/targets.py`, `re/make_preview.py`, `re/preview_template.html` (working viewer prototype). Ghidra dumps in `re/gscripts/` are reference only.
Owner states this is their licensed program and own data, used to read own trainings.

## Decisions already made by the owner
- Real hit position comes from SIUS, not SCATT. SCATT "Ballistic Ratio" not needed. Comparing the trace-derived hit with the SIUS hit may later be a shot-quality metric.
- Do not rely on SCATT scoring; results come from SIUS and the `shots` table.
- Canting graph dropped; a live level vial (libela) shows weapon tilt instead. Tilt sign (which side) is NOT verified.
- Colours identical for both themes: older #09e57c, control interval (1 s) #eac223, last 250 ms #2c97e7, after shot #cc3641.
- Trace line width: 0.15 mm air rifle (we use 60 % of it), 0.3 air pistol, 0.5 50 m rifle.
- Calibre fixed by weapon: air 4.5 mm, small-bore 5.6 mm.
- Viewer options become app settings: play/pause, speeds 0.25x to 2x, scrubber, zoom around target centre only (wheel, buttons, double-click reset; target and trace zoom together), "after shot" 0.5 / 1 / 2 s (default 1 s), level vial.

## Format summary (details in re/NOTES.md)
blob[0]=0x01; rest: plain[i] = c[i-1] ^ c[i] ^ KEY[i%16], KEY = e300e90034851d04f095c0700e1eb9f3; drop plain[0];
plain[1:3] = BE CRC-16/X-25 (qChecksum) of plain[3:]; plain[3:] = Qt qCompress (BE u32 length + zlib);
QDataStream BE: magic 0x0A0B0C0D, format 0x10000010, version 2, u16 N, i8 flags (bit0 float angle, bit1 i16 trigger), N x (f32 x mm, f32 y mm, [f32 angle rad], [i16 trigger]).
Hit = sample at `shots.trace_offset`; `shots.timer = traces.timer + trace_offset*1000/sample_rate` (verified, 0 ms diff); sample_rate 100 Hz.
Port to TypeScript: needs CRC-16, chained XOR, zlib inflate (pako/fflate in browser), DataView reader.

## Display pipeline (re/NOTES-render.md)
Resample 100 -> 200 Hz (quadratic Lagrange), Chebyshev low-pass (2 poles, 0.5 % ripple, cutoff 0.15) on x and y, 4 coloured time segments.
Hold circle = minimum enclosing circle of control-interval samples. Targets in `re/targets.py` (ar10, ap10, sbr50 only; others not extracted).
Ring numbers 1 to 8 on all four axes; 9 and 10 unnumbered; ten filled.

## Metrics per shot (re/NOTES-analysis.md; formulas read from code, NOT yet compared with the SCATT GUI)
aiming speed (last 1 s and last 0.25 s; total, X, Y; mm/s), average aim point, hold box, hold circle, hold-within rings (absolute and relative),
aiming time, interval stability between shots. Sample output: avg speed 10.3 mm/s, speed250 10.0, aiming time 14.6 s, hold circle 2.4 mm, hold in 10 = 96 %, stability 52.

## Open
Tilt direction; why calibre 4.4 fits stored score better than 4.5 (sample: sessions.result 1026, properties.score 1079.4);
small-bore scoring unverified on a real MK sample; "time shift" curves not decompiled; GUI comparison of metrics.

## Phase 4 task outline (write a proper plan with writing-plans when started)
1. TS decoder + tests on the sample (counts above, checksum, first sample values from re/traces_out.csv).
2. Filter/resampler + tests against `re/scatt_display.py` output.
3. Targets module (3 targets) + metrics module + tests against `re/analysis_out.csv`.
4. DB: store decoded samples compactly (not raw blob only), per-shot metrics columns.
5. Viewer component with the settings above, in the training report; align shot by `shots.timer` with SIUS shots (existing alignment engine).
