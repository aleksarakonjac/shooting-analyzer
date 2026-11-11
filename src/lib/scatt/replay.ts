import type { TraceSamples } from './decode';
import { CONTROL_MS } from './analysis';
import { displayIndex, displaySamples, minCircle, OUT_RATE } from './display';

/**
 * One shot's aim trace prepared for replay as SCATT Expert draws it (re/NOTES-render.md):
 * display samples (200 Hz, low-passed), coloured in four segments by time to the shot.
 */

/** Oldest part / control interval (1 s) / last 250 ms / after the shot. */
export type SegmentKind = 'before' | 'control' | 'last250' | 'after';

export interface Segment {
  kind: SegmentKind;
  /** Display sample indices, inclusive; consecutive segments share their joint. */
  from: number;
  to: number;
}

export interface Replay {
  rate: number;
  /** Aim point, mm, x right, y up. */
  x: number[];
  y: number[];
  /** Weapon tilt in degrees per display sample, when recorded. */
  angle: number[] | null;
  /** Index of the shot. */
  shot: number;
  segments: Segment[];
  /** Smallest circle around the aim point in the control interval. */
  hold: { x: number; y: number; r: number };
}

/** SCATT keeps 60 s before the shot (limitSecondsBeforeShot); we keep up to 3 s after it (SCATT itself stops at 2 s, so less may exist). */
const BEFORE_S = 60;
const AFTER_MAX_S = 3;

export function buildReplay(trace: TraceSamples, offset: number, srcRate: number): Replay {
  const D = displaySamples(trace.x, trace.y, srcRate);
  const last = D.x.length - 1;
  const di = Math.max(0, Math.min(displayIndex(offset, srcRate), last));
  const start = Math.max(0, di - BEFORE_S * OUT_RATE);
  const end = Math.min(last, di + AFTER_MAX_S * OUT_RATE);
  const x = D.x.slice(start, end + 1);
  const y = D.y.slice(start, end + 1);
  const shot = di - start;
  const ctrl = Math.max(0, shot - Math.floor((OUT_RATE * CONTROL_MS) / 1000));
  const q = Math.max(ctrl, shot - Math.floor(OUT_RATE / 4));
  const segments = (
    [
      { kind: 'before', from: 0, to: ctrl },
      { kind: 'control', from: ctrl, to: q },
      { kind: 'last250', from: q, to: shot },
      { kind: 'after', from: shot, to: x.length - 1 },
    ] satisfies Segment[]
  ).filter((s) => s.to > s.from);
  const rad = trace.angle;
  const angle = rad
    ? x.map((_, i) => (rad[Math.min(Math.floor(((start + i) * srcRate) / OUT_RATE), rad.length - 1)] * 180) / Math.PI)
    : null;
  const hold = minCircle(x.slice(ctrl, shot + 1), y.slice(ctrl, shot + 1));
  return { rate: OUT_RATE, x, y, angle, shot, segments, hold };
}

/** Last index shown when the replay runs `afterS` seconds past the shot. */
export const endFor = (r: Replay, afterS: number) => Math.min(r.x.length - 1, r.shot + Math.round(afterS * r.rate));

/** First index shown when the replay starts `beforeS` seconds before the shot. */
export const startFor = (r: Replay, beforeS: number) => Math.max(0, r.shot - Math.round(beforeS * r.rate));

/** Aim point at a fractional sample position, clamped to the trace. */
export function pointAt(r: Replay, pos: number): { x: number; y: number } {
  const last = r.x.length - 1;
  const p = Math.max(0, Math.min(pos, last));
  const k = Math.floor(p);
  const f = p - k;
  if (k >= last) return { x: r.x[last], y: r.y[last] };
  return { x: r.x[k] + (r.x[k + 1] - r.x[k]) * f, y: r.y[k] + (r.y[k + 1] - r.y[k]) * f };
}

/** The segments as far as the replay has drawn them (from `start`, up to `pos`, never past `end`). */
export function segmentsUpTo(r: Replay, pos: number, end: number, start = 0): Segment[] {
  const k = Math.min(Math.floor(pos), end);
  return r.segments.filter((s) => s.from < k && s.to > start).map((s) => ({ ...s, from: Math.max(s.from, start), to: Math.min(s.to, k) }));
}

/** Tilt at sample k averaged over the last 0.1 s, so the level bubble does not jitter. */
export function angleAt(r: Replay, k: number): number | null {
  if (!r.angle) return null;
  const n = Math.max(1, Math.round(r.rate / 10));
  const hi = Math.max(0, Math.min(Math.floor(k), r.angle.length - 1));
  const lo = Math.max(0, hi - n + 1);
  let sum = 0;
  for (let i = lo; i <= hi; i++) sum += r.angle[i];
  return sum / (hi - lo + 1);
}
