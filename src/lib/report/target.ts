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
  smallbore_pistol: { tenMm: 50, stepMm: 50, blackMm: 200, minViewRing: 9 },
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

export type ScoreBand = 'top' | 'ten' | 'nine' | 'low';

/** Colour band of a shot pip: decimal 10.5+ / 10.0-10.4 / 9.x / lower; whole rings 10 / 9 / 8 / lower. */
export function scoreBand(value: number, decimal: boolean): ScoreBand {
  if (decimal) {
    if (value >= 10.5) return 'top';
    if (value >= 10) return 'ten';
    if (value >= 9) return 'nine';
    return 'low';
  }
  if (value >= 10) return 'top';
  if (value >= 9) return 'ten';
  if (value >= 8) return 'nine';
  return 'low';
}
