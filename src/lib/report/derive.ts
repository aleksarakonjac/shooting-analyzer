import type { HrSample } from '@/lib/parsers/tcx';

const round1 = (v: number) => Math.round(v * 10) / 10;

type Side<S extends string> = { mm: number; side: S | null };

/** Offset of the mean point of impact from the centre, as the SIUS sign convention reads it: +X right, +Y up. */
export function offsetDirection(mpi: { x: number; y: number }): {
  x: Side<'left' | 'right'>;
  y: Side<'up' | 'down'>;
} {
  const ax = round1(Math.abs(mpi.x));
  const ay = round1(Math.abs(mpi.y));
  return {
    x: { mm: ax, side: ax === 0 ? null : mpi.x < 0 ? 'left' : 'right' },
    y: { mm: ay, side: ay === 0 ? null : mpi.y < 0 ? 'down' : 'up' },
  };
}

/** Match total: decimal series sum with one decimal, whole-ring series as integers. */
export function matchTotal(
  series: { total: number | null; total_decimal: number | null }[],
  decimal: boolean,
): number {
  const sum = series.reduce((a, s) => a + (decimal ? (s.total_decimal ?? s.total ?? 0) : (s.total ?? 0)), 0);
  return round1(sum);
}

export function hrStats(samples: HrSample[]): { avg: number; min: number; max: number; count: number } | null {
  if (samples.length === 0) return null;
  const bpm = samples.map((s) => s.bpm);
  return {
    avg: Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length),
    min: Math.min(...bpm),
    max: Math.max(...bpm),
    count: bpm.length,
  };
}

/** Time span of the shots (UTC ms) widened by padMs on both sides; null when no shot has a time. */
export function shotWindow(
  times: (number | null | undefined)[],
  padMs: number,
): { fromMs: number; toMs: number } | null {
  const t = times.filter((x): x is number => typeof x === 'number');
  if (t.length === 0) return null;
  return { fromMs: Math.min(...t) - padMs, toMs: Math.max(...t) + padMs };
}

/** How far reinterpreting a TCX clock moved the samples; folded into the stored heart-rate offset. */
export function zoneShiftMs(original: HrSample[], reinterpreted: HrSample[]): number {
  if (original.length === 0 || reinterpreted.length === 0) return 0;
  return reinterpreted[0].tMs - original[0].tMs;
}

/**
 * How many heart-rate samples fall inside the shot window (widened by a minute, offset applied).
 * Zero means the watch clock and the shots do not meet: wrong zone or offset. Null without shot times.
 */
export function hrCoverage(
  samples: HrSample[],
  shotTimes: (number | null | undefined)[],
  offsetMs: number,
): { inside: number; total: number } | null {
  const win = shotWindow(shotTimes, 60_000);
  if (!win) return null;
  const inside = samples.filter((s) => s.tMs + offsetMs >= win.fromMs && s.tMs + offsetMs <= win.toMs).length;
  return { inside, total: samples.length };
}
