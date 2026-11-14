import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';

export interface TargetSpec {
  /** Diameter of the 10 ring, mm. */
  tenMm: number;
  /** Each ring further out adds this much to the diameter, mm. */
  stepMm: number;
  /** Diameter of the black aiming mark, mm (not always a ring edge: 50 m rifle is 112.4). */
  blackMm: number;
  /** Never zoom in further than this ring. */
  minViewRing: number;
}

/** ISSF target dimensions per discipline. */
const SPECS: Record<DisciplineId, TargetSpec> = {
  air_rifle: { tenMm: 0.5, stepMm: 5, blackMm: 30.5, minViewRing: 9 },
  air_pistol: { tenMm: 11.5, stepMm: 16, blackMm: 59.5, minViewRing: 9 },
  smallbore_3p: { tenMm: 10.4, stepMm: 16, blackMm: 112.4, minViewRing: 9 },
};

export const targetSpec = (d: DisciplineId): TargetSpec => SPECS[d];

/** Radius of ring n (1..10) in millimetres. */
export function ringRadiusMm(s: TargetSpec, ring: number): number {
  return (s.tenMm + (10 - ring) * s.stepMm) / 2;
}

/**
 * How much of the target to show for content that reaches `extentMm` from the centre:
 * the smallest whole ring that leaves 30 % room, never tighter than the spec's minimum ring.
 */
export function viewRadiusMm(s: TargetSpec, extentMm: number): number {
  const want = extentMm * 1.3;
  for (let ring = s.minViewRing; ring >= 1; ring--) {
    if (ringRadiusMm(s, ring) >= want) return ringRadiusMm(s, ring);
  }
  return ringRadiusMm(s, 1);
}

/**
 * The next view radius when zooming in or out: SCATT zooms ring by ring about the centre.
 * A radius between rings snaps to the neighbouring ring; the view stays between ring 1 and the minimum ring.
 */
export function zoomRing(s: TargetSpec, R: number, dir: 'in' | 'out'): number {
  const eps = 1e-6;
  if (dir === 'in') {
    for (let ring = 1; ring <= s.minViewRing; ring++) {
      if (ringRadiusMm(s, ring) < R - eps) return ringRadiusMm(s, ring);
    }
    return ringRadiusMm(s, s.minViewRing);
  }
  for (let ring = s.minViewRing; ring >= 1; ring--) {
    if (ringRadiusMm(s, ring) > R + eps) return ringRadiusMm(s, ring);
  }
  return ringRadiusMm(s, 1);
}

export type ScoreBand = 'top' | 'ten' | 'nine' | 'low';

/** Default line between a filled pip and a ring: 10.5 for decimal scoring, 10 for whole rings. */
export const defaultPipTop = (decimal: boolean) => (decimal ? 10.5 : 10);

/** The owner's filled-pip threshold for a discipline, if it is a valid one (decimal 10.0-10.9, whole 9 or 10). */
export function pipTopFor(prefs: Record<string, unknown> | null | undefined, d: DisciplineId): number {
  const decimal = DISCIPLINES[d].decimal;
  const v = prefs?.[d];
  if (typeof v !== 'number' || !Number.isFinite(v)) return defaultPipTop(decimal);
  const ok = decimal ? v >= 10 && v <= 10.9 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 : v === 9 || v === 10;
  return ok ? v : defaultPipTop(decimal);
}

/**
 * Colour band of a shot pip. `top` (filled) starts at the owner's threshold; below it, down to the 10 (9 for
 * whole rings), is `ten` (a ring); then 9.x (8) and lower.
 */
export function scoreBand(value: number, decimal: boolean, topFrom = defaultPipTop(decimal)): ScoreBand {
  if (value >= topFrom) return 'top';
  if (decimal) {
    if (value >= 10) return 'ten';
    if (value >= 9) return 'nine';
    return 'low';
  }
  if (value >= 9) return 'ten';
  if (value >= 8) return 'nine';
  return 'low';
}

/** Legend entries for the pip bands under a threshold; the ring band is left out when the threshold leaves it empty. */
export function bandLegend(decimal: boolean, top: number): { band: ScoreBand; label: string }[] {
  if (decimal) {
    return [
      { band: 'top' as const, label: `${top.toFixed(1)}+` },
      ...(top > 10 ? [{ band: 'ten' as const, label: `10.0–${(top - 0.1).toFixed(1)}` }] : []),
      { band: 'nine' as const, label: '9.x' },
      { band: 'low' as const, label: '< 9' },
    ];
  }
  return [
    { band: 'top' as const, label: top === 10 ? '10' : `${top}+` },
    ...(top === 10 ? [{ band: 'ten' as const, label: '9' }] : []),
    { band: 'nine' as const, label: '8' },
    { band: 'low' as const, label: '< 8' },
  ];
}

/** The ring whose edge is at radius R (rounded to the nearest ring, 1..10). */
export function ringAtRadius(s: TargetSpec, R: number): number {
  return Math.max(1, Math.min(10, Math.round(10 - (2 * R - s.tenMm) / s.stepMm)));
}
