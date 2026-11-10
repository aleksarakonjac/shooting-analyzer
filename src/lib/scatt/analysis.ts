import type { ScattTraceFile } from '@/lib/parsers/scatt';
import { decimalScore, displayIndex, displaySamples, minCircle, OUT_RATE } from './display';
import type { ScattTarget } from './targets';

/** Per-shot metrics as SCATT Expert computes them (re/analysis.py, re/NOTES-analysis.md). */

/** The control interval before the shot that the metrics look at. */
export const CONTROL_MS = 1000;

export interface ShotMetrics {
  /** Aim point speed over the control interval, mm/s (total, X, Y). */
  speed: number;
  speedX: number;
  speedY: number;
  /** Speed over the last 0.25 s before the shot, mm/s. */
  speed250: number;
  /** Average aim point in the control interval, mm. */
  aapX: number;
  aapY: number;
  /** Hold box, mm. */
  boxW: number;
  boxH: number;
  /** Diameter of the smallest circle around the aim point in the control interval, mm. */
  holdCircleD: number;
  /** Share of the control interval spent inside ring 10 / 9 / 8, from the target centre (abs) or from the AAP (rel), %. */
  hold10Abs: number;
  hold10Rel: number;
  hold9Abs: number;
  hold9Rel: number;
  hold8Abs: number;
  hold8Rel: number;
  /** Distance of the hit from the average aim point, mm. */
  breachFromAap: number;
}

export interface ShotAnalysis {
  shotId: number;
  traceId: number;
  match: boolean;
  missed: boolean;
  /** Hit point (the sample at the shot), mm. */
  x: number;
  y: number;
  /** SCATT's own decimal score of that point (for comparison; results come from SIUS). */
  score: number;
  aimingMs: number;
  shotMs: number;
  metrics: ShotMetrics | null;
}

const ringRadius = (t: ScattTarget, n: number) => (t.rings[n] + t.caliber) / 2;

function windowMetrics(dx: number[], dy: number[], di: number, t: ScattTarget, hitX: number, hitY: number): ShotMetrics | null {
  const nInt = Math.floor((OUT_RATE * CONTROL_MS) / 1000);
  const start = Math.max(0, di - nInt);
  const sx = dx.slice(start, di + 1);
  const sy = dy.slice(start, di + 1);
  if (sx.length < 2) return null;
  const n250 = Math.floor(OUT_RATE / 4);
  const steps = sx.length - 1;
  const k = nInt / steps;
  const T = CONTROL_MS / 1000;
  let path = 0;
  let pathX = 0;
  let pathY = 0;
  const hyp: number[] = [];
  for (let i = 0; i < steps; i++) {
    const ddx = sx[i + 1] - sx[i];
    const ddy = sy[i + 1] - sy[i];
    const h = Math.hypot(ddx, ddy);
    hyp.push(h);
    path += h;
    pathX += Math.abs(ddx);
    pathY += Math.abs(ddy);
  }
  const last = hyp.slice(-n250);
  const path250 = last.reduce((a, b) => a + b, 0) * (n250 / last.length);
  const aapX = sx.reduce((a, b) => a + b, 0) / sx.length;
  const aapY = sy.reduce((a, b) => a + b, 0) / sy.length;
  const circ = minCircle(sx, sy);
  const within = (ring: number): [number, number] => {
    const r2 = ringRadius(t, ring) ** 2;
    let ab = 0;
    let rel = 0;
    for (let i = 0; i < sx.length; i++) {
      if (sx[i] * sx[i] + sy[i] * sy[i] <= r2) ab++;
      if ((sx[i] - aapX) ** 2 + (sy[i] - aapY) ** 2 <= r2) rel++;
    }
    return [Math.floor((100 * ab) / sx.length), Math.floor((100 * rel) / sx.length)];
  };
  const [h10a, h10r] = within(10);
  const [h9a, h9r] = within(9);
  const [h8a, h8r] = within(8);
  return {
    speed: (path * k) / T,
    speedX: (pathX * k) / T,
    speedY: (pathY * k) / T,
    speed250: path250 / 0.25,
    aapX,
    aapY,
    boxW: Math.max(...sx) - Math.min(...sx),
    boxH: Math.max(...sy) - Math.min(...sy),
    holdCircleD: 2 * circ.r,
    hold10Abs: h10a,
    hold10Rel: h10r,
    hold9Abs: h9a,
    hold9Rel: h9r,
    hold8Abs: h8a,
    hold8Rel: h8r,
    breachFromAap: Math.hypot(hitX - aapX, hitY - aapY),
  };
}

/** Interval stability between shots (calcIntervalStability): 100 for fewer than three shots. */
export function intervalStability(timesMs: number[]): number {
  if (timesMs.length < 3) return 100;
  const d = timesMs.slice(1).map((t, i) => t - timesMs[i]);
  const span = timesMs[timesMs.length - 1] - timesMs[0];
  if (d.length < 2 || span === 0) return 100;
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  const dev = Math.floor(d.reduce((a, x) => a + Math.abs(m - x), 0));
  const v = Math.floor((dev * 100) / span);
  return v >= 100 ? 0 : 100 - v;
}

/** Hit point, aiming time and the control-interval metrics of every shot in the file, in shot-time order. */
export async function analyseShots(f: ScattTraceFile, target: ScattTarget): Promise<ShotAnalysis[]> {
  const rate = f.sampleRate;
  const display = new Map<number, { x: number[]; y: number[] }>();
  const out: ShotAnalysis[] = [];
  let prev: number | null = null;
  for (const s of f.shots) {
    const tr = f.traces.get(s.traceId);
    if (!tr) continue;
    let D = display.get(s.traceId);
    if (!D) {
      D = displaySamples(tr.x, tr.y, rate);
      display.set(s.traceId, D);
    }
    const off = Math.min(s.offset, tr.x.length - 1);
    const x = tr.x[off];
    const y = tr.y[off];
    const shotMs = tr.timer + Math.floor((s.offset * 1000) / rate);
    let aim = tr.timerEnter > 0 ? shotMs - tr.timerEnter : Math.floor((s.offset * 1000) / rate);
    aim = Math.max(0, aim);
    if (prev !== null && shotMs - prev <= aim) aim = shotMs - prev;
    prev = shotMs;
    const di = Math.min(displayIndex(s.offset, rate), D.x.length - 1);
    out.push({
      shotId: s.shotId,
      traceId: s.traceId,
      match: s.match,
      missed: s.missed,
      x,
      y,
      score: decimalScore(x, y, target.rings, target.caliber),
      aimingMs: aim,
      shotMs,
      metrics: windowMetrics(D.x, D.y, di, target, x, y),
    });
  }
  return out;
}
