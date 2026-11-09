import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSeries, ParsedShot, ParsedSiusResult } from '@/lib/domain/types';

export const round1 = (v: number) => Math.round(v * 10) / 10;

/** A series from its shots: decimal disciplines keep both the decimal and the whole-ring total. */
export function seriesFromShots(d: DisciplineId, index: number, shots: ParsedShot[]): ParsedSeries {
  const dec = DISCIPLINES[d].decimal;
  const sum = round1(shots.reduce((a, s) => a + s.value, 0));
  return {
    index,
    shots,
    total: dec ? shots.reduce((a, s) => a + Math.floor(s.value), 0) : sum,
    totalDecimal: dec ? sum : undefined,
  };
}

/** Wraps series into the same shape a SIUS import gives, so the rest of the form treats them alike. */
export function resultFromSeries(d: DisciplineId, series: ParsedSeries[]): ParsedSiusResult {
  const cfg = DISCIPLINES[d];
  return {
    discipline: cfg.nameSr,
    disciplineId: d,
    total: series.reduce((a, s) => a + s.total, 0),
    totalDecimal: cfg.decimal ? round1(series.reduce((a, s) => a + (s.totalDecimal ?? s.total), 0)) : undefined,
    series,
  };
}
