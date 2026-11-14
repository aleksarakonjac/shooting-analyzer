import type { TargetSpec } from '@/lib/report/target';
import type { ScattTarget } from './targets';

export interface CanvasSize {
  w: number;
  h: number;
  dpr: number;
}

export function cssVar(name: string, fallback: string): string {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return v || fallback;
}

/** Pixels per mm and the mm -> pixel maps (x right, y up) for a view of radius R mm. */
export function viewTransform(size: CanvasSize, R: number) {
  const S = Math.min(size.w, size.h) / 2 / (R * 1.04);
  return { S, X: (mm: number) => size.w / 2 + mm * S, Y: (mm: number) => size.h / 2 - mm * S };
}

/** The target face as SCATT draws it (card, black, rings, ring numbers) for a view radius R mm. Shared by the replay and the shot overview. */
export function drawTarget(g: CanvasRenderingContext2D, size: CanvasSize, tg: ScattTarget, spec: TargetSpec, R: number) {
  const { w, h, dpr } = size;
  const { S, X, Y } = viewTransform(size, R);
  const card = cssVar('--target-card', '#e9ecef');
  const ink = cssVar('--target-ink', '#14181b');
  const dim = cssVar('--target-dim', '#7f8aa8');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = card;
  g.fillRect(0, 0, w, h);
  const disc = (rad: number, fill: string) => {
    g.beginPath();
    g.arc(X(0), Y(0), rad * S, 0, 2 * Math.PI);
    g.fillStyle = fill;
    g.fill();
  };
  const circle = (rad: number, stroke: string, width: number) => {
    g.beginPath();
    g.arc(X(0), Y(0), rad * S, 0, 2 * Math.PI);
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.stroke();
  };
  const black = tg.black / 2;
  disc(black, ink);
  const pen = Math.max(0.75, spec.stepMm * 0.02 * S);
  for (let n = 1; n <= 10; n++) {
    const rad = tg.rings[n] / 2;
    if (n === 10 && (!tg.innerTen || rad * S < 3)) disc(Math.max(rad, 1.5 / S), card);
    else circle(rad, rad > black + 1e-9 ? ink : dim, pen);
  }
  if (tg.innerTen) {
    // The inner ten is printed as a dashed ring.
    g.setLineDash([pen * 3, pen * 2]);
    circle(tg.innerTen / 2, dim, pen);
    g.setLineDash([]);
  }
  const fontPx = Math.min(30, spec.stepMm * 0.22 * S);
  if (fontPx >= 7) {
    g.font = `600 ${fontPx.toFixed(1)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let n = 1; n <= tg.labelsTo; n++) {
      const ro = tg.rings[n] / 2;
      const rr = ro - (tg.rings[n] - tg.rings[n + 1]) / 4;
      g.fillStyle = ro > black + 1e-9 ? ink : dim;
      for (const [sx, sy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) g.fillText(String(n), X(rr * sx), Y(rr * sy));
    }
  }
}
