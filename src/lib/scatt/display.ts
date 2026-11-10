/**
 * SCATT's display pipeline (re/scatt_display.py): resample to 200 Hz with 3-point quadratic interpolation,
 * then a 2-pole Chebyshev low-pass (0.5 % ripple, cutoff 0.15) on x and y. Metrics use these samples.
 */

export const OUT_RATE = 200;
const CUTOFF = 0.15;
const RIPPLE = 0.5;

export function resampleQuadratic(vals: ArrayLike<number>, srcRate: number, outRate = OUT_RATE): number[] {
  const P = 1000 / srcRate;
  const step = 1000 / outRate;
  const out: number[] = [];
  let n = 0;
  let tout = 0;
  for (let i = 2; i < vals.length; i++) {
    const w0 = vals[i - 2];
    const w1 = vals[i - 1];
    const w2 = vals[i];
    while (tout <= P * (n + 2)) {
      const t = (tout - P * n) / P;
      out.push(w0 + t * (-1.5 * w0 + 2 * w1 - 0.5 * w2) + t * t * (0.5 * w0 - w1 + 0.5 * w2));
      tout += step;
    }
    n += 1;
  }
  return out;
}

/** Smith's recursive Chebyshev low-pass, one biquad (DSP guide ch. 20). */
function chebCoeffs(fc = CUTOFF, pr = RIPPLE): [number, number, number, number, number] {
  const np = 2;
  let rp = -Math.cos(Math.PI / (np * 2));
  let ip = Math.sin(Math.PI / (np * 2));
  const es = Math.sqrt((100 / (100 - pr)) ** 2 - 1);
  const vx = (1 / np) * Math.log(1 / es + Math.sqrt(1 / (es * es) + 1));
  let kx = (1 / np) * Math.log(1 / es + Math.sqrt(1 / (es * es) - 1));
  kx = (Math.exp(kx) + Math.exp(-kx)) / 2;
  rp = (rp * ((Math.exp(vx) - Math.exp(-vx)) / 2)) / kx;
  ip = (ip * ((Math.exp(vx) + Math.exp(-vx)) / 2)) / kx;
  const T = 2 * Math.tan(0.5);
  const W = 2 * Math.PI * fc;
  const M = rp * rp + ip * ip;
  const D = 4 - 4 * rp * T + M * T * T;
  const x0 = (T * T) / D;
  const x1 = (2 * T * T) / D;
  const x2 = (T * T) / D;
  const y1 = (8 - 2 * M * T * T) / D;
  const y2 = (-4 - 4 * rp * T - M * T * T) / D;
  const k = Math.sin(0.5 - W / 2) / Math.sin(0.5 + W / 2);
  const d = 1 + y1 * k - y2 * k * k;
  const a0 = (x0 - x1 * k + x2 * k * k) / d;
  const a1 = (-2 * x0 * k + x1 + x1 * k * k - 2 * x2 * k) / d;
  const a2 = (x0 * k * k - x1 * k + x2) / d;
  const b1 = (2 * k + y1 + y1 * k * k - 2 * y2 * k) / d;
  const b2 = (-k * k - y1 * k + y2) / d;
  const gain = (a0 + a1 + a2) / (1 - (b1 + b2));
  return [a0 / gain, a1 / gain, a2 / gain, b1, b2];
}

const COEFFS = chebCoeffs();

export function chebLowpass(vals: number[]): number[] {
  const [a0, a1, a2, b1, b2] = COEFFS;
  if (!vals.length) return [];
  let x1 = vals[0];
  let x2 = vals[0];
  let y1 = vals[0];
  let y2 = vals[0];
  const out = new Array<number>(vals.length);
  for (let i = 0; i < vals.length; i++) {
    const x = vals[i];
    const y = a0 * x + a1 * x1 + a2 * x2 + b1 * y1 + b2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** Display samples as SCATT draws them: [x[], y[]] at OUT_RATE. */
export function displaySamples(x: ArrayLike<number>, y: ArrayLike<number>, srcRate: number): { x: number[]; y: number[] } {
  const rx = srcRate !== OUT_RATE ? resampleQuadratic(x, srcRate) : Array.from(x);
  const ry = srcRate !== OUT_RATE ? resampleQuadratic(y, srcRate) : Array.from(y);
  return { x: chebLowpass(rx), y: chebLowpass(ry) };
}

export const displayIndex = (rawIndex: number, srcRate: number) => Math.floor((OUT_RATE * rawIndex) / srcRate);

/** Decimal score on a 10-ring target, distance measured from the centre; the pellet radius widens each ring. */
export function decimalScore(x: number, y: number, rings: Record<number, number>, caliber: number): number {
  const d = Math.hypot(x, y);
  let inner = 0;
  for (let n = 10; n >= 1; n--) {
    const R = (rings[n] + caliber) / 2;
    if (d <= R) return Math.min(Math.floor(((R - d) / (R - inner) + n) * 10) / 10, 10.9);
    inner = R;
  }
  return 0;
}

type Circle = { x: number; y: number; r: number };
const inside = (c: Circle, px: number, py: number) => Math.hypot(px - c.x, py - c.y) <= c.r + 1e-9;
const circ2 = (ax: number, ay: number, bx: number, by: number): Circle => ({ x: (ax + bx) / 2, y: (ay + by) / 2, r: Math.hypot(ax - bx, ay - by) / 2 });
function circ3(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Circle {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return [circ2(ax, ay, bx, by), circ2(ax, ay, cx, cy), circ2(bx, by, cx, cy)].reduce((a, b) => (b.r > a.r ? b : a));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}

/** Smallest circle around the points (the hold circle); unique, so the visiting order does not matter. */
export function minCircle(xs: number[], ys: number[]): Circle {
  // A fixed pseudo-random order keeps the expected running time linear.
  const idx = xs.map((_, i) => i);
  let seed = 1;
  for (let i = idx.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const px = idx.map((i) => xs[i]);
  const py = idx.map((i) => ys[i]);
  let c: Circle = px.length ? { x: px[0], y: py[0], r: 0 } : { x: 0, y: 0, r: 0 };
  for (let i = 0; i < px.length; i++) {
    if (inside(c, px[i], py[i])) continue;
    c = { x: px[i], y: py[i], r: 0 };
    for (let j = 0; j < i; j++) {
      if (inside(c, px[j], py[j])) continue;
      c = circ2(px[i], py[i], px[j], py[j]);
      for (let k = 0; k < j; k++) if (!inside(c, px[k], py[k])) c = circ3(px[i], py[i], px[j], py[j], px[k], py[k]);
    }
  }
  return c;
}
