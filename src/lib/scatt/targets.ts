import type { DisciplineId } from '@/lib/domain/types';

/** A SCATT target geometry (re/targets.py). Lengths in mm; rings[n] is the diameter of ring n (1 outer..10). */
export interface ScattTarget {
  id: 'ar10' | 'ap10' | 'sbr50';
  rings: Record<number, number>;
  black: number;
  /** Inner ten diameter where the target has one. */
  innerTen: number | null;
  caliber: number;
  /** Trace line width SCATT draws. */
  traceW: number;
}

const rings = (d: number[]) => Object.fromEntries(d.map((v, i) => [i + 1, v])) as Record<number, number>;

export const SCATT_TARGETS: Record<ScattTarget['id'], ScattTarget> = {
  ar10: { id: 'ar10', rings: rings([45.5, 40.5, 35.5, 30.5, 25.5, 20.5, 15.5, 10.5, 5.5, 0.5]), black: 30.5, innerTen: null, caliber: 4.5, traceW: 0.15 },
  ap10: { id: 'ap10', rings: rings([155.5, 139.5, 123.5, 107.5, 91.5, 75.5, 59.5, 43.5, 27.5, 11.5]), black: 59.5, innerTen: 5.0, caliber: 4.5, traceW: 0.3 },
  sbr50: { id: 'sbr50', rings: rings([154.4, 138.4, 122.4, 106.4, 90.4, 74.4, 58.4, 42.4, 26.4, 10.4]), black: 112.4, innerTen: 5.0, caliber: 5.6, traceW: 0.5 },
};

/** The SCATT target of a discipline, or null where none was extracted (25 m pistol). */
export function scattTargetFor(d: DisciplineId): ScattTarget | null {
  return d === 'air_rifle' ? SCATT_TARGETS.ar10 : d === 'air_pistol' ? SCATT_TARGETS.ap10 : d === 'smallbore_3p' ? SCATT_TARGETS.sbr50 : null;
}
