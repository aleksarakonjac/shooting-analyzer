import type { DisciplineId } from './types';

export interface DisciplineConfig {
  nameSr: string;
  hasPositions: boolean;
  /** Shots are scored with one decimal (air rifle) rather than whole rings. */
  decimal: boolean;
  maxShot: number;
  maxSeries: number;
  /**
   * Display reference only (spec 6a): the usual number of series in a match.
   * Never used to validate or cap a training's series count or total.
   */
  referenceMatchSeries: number | null;
}

export const DISCIPLINES: Record<DisciplineId, DisciplineConfig> = {
  air_rifle: {
    nameSr: 'Vazdušna puška',
    hasPositions: false,
    decimal: true,
    maxShot: 10.9,
    maxSeries: 109.0,
    referenceMatchSeries: 6,
  },
  smallbore_3p: {
    nameSr: 'MK puška trostav',
    hasPositions: true,
    decimal: false,
    maxShot: 10,
    maxSeries: 100,
    referenceMatchSeries: null,
  },
  air_pistol: {
    nameSr: 'Vazdušni pištolj',
    hasPositions: false,
    decimal: false,
    maxShot: 10,
    maxSeries: 100,
    referenceMatchSeries: 6,
  },
};

/** Maps a SIUS discipline label ("Air Rifle 80", "50m Rifle 3x20") to a discipline id. */
export function disciplineFromSiusName(name: string): DisciplineId | undefined {
  const n = name.toLowerCase().replace(/\s+/g, ' ').trim();
  if (n.includes('air rifle')) return 'air_rifle';
  if (n.includes('air pistol')) return 'air_pistol';
  if (/\b(50m|50 m) rifle\b/.test(n) && /3x(20|40)/.test(n)) return 'smallbore_3p';
  // Other pistol events (25 m precision / rapid fire, 50 m free) are not supported yet.
  return undefined;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function validateShot(d: DisciplineId, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const cfg = DISCIPLINES[d];
  if (value < 0 || value > cfg.maxShot) return false;
  return cfg.decimal ? Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 : Number.isInteger(value);
}

/** Validates single shots and the series sum only. Match totals are never capped. */
export function validateSeries(d: DisciplineId, shots: number[]): { ok: boolean; reason?: string } {
  for (const s of shots) {
    if (!validateShot(d, s)) return { ok: false, reason: `Invalid shot value ${s}` };
  }
  const total = round1(shots.reduce((a, b) => a + b, 0));
  const max = DISCIPLINES[d].maxSeries;
  if (total > max) return { ok: false, reason: `Series total ${total} exceeds ${max}` };
  return { ok: true };
}
