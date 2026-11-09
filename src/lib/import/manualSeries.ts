import { DISCIPLINES, validateShot } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSeries } from '@/lib/domain/types';
import type { ParsedSiusResult } from '@/lib/domain/types';
import { resultFromSeries, round1, seriesFromShots } from './series';

export interface ManualRow {
  /** The series total as typed ("104,5"); ignored when shots are entered. */
  total: string;
  /** Shot values as typed; empty strings are shots not entered. */
  shots: string[];
}

export type ManualBuild =
  | { ok: true; result: ParsedSiusResult }
  | { ok: false; error: 'empty' }
  | { ok: false; error: 'missing' | 'total'; row: number }
  | { ok: false; error: 'shot'; row: number; shot: number };

const num = (s: string) => Number(s.trim().replace(',', '.'));

/** Rows of the manual entry: a typed total, or shots from which the total is computed. */
export function buildManualResult(d: DisciplineId, rows: ManualRow[]): ManualBuild {
  if (rows.length === 0) return { ok: false, error: 'empty' };
  const cfg = DISCIPLINES[d];
  const series: ParsedSeries[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const typed = row.shots.map((s, i) => ({ s: s.trim(), i })).filter((x) => x.s !== '');
    if (typed.length > 0) {
      const shots = [];
      for (const { s, i } of typed) {
        const v = num(s);
        if (!/^\d+([.,]\d+)?$/.test(s) || !validateShot(d, v)) return { ok: false, error: 'shot', row: r + 1, shot: i + 1 };
        shots.push({ value: v });
      }
      series.push(seriesFromShots(d, r + 1, shots));
      continue;
    }
    if (!row.total.trim()) return { ok: false, error: 'missing', row: r + 1 };
    const total = num(row.total);
    const oneDecimal = Math.abs(total * 10 - Math.round(total * 10)) < 1e-9;
    const whole = Number.isInteger(total);
    if (!/^\d+([.,]\d+)?$/.test(row.total.trim()) || total > cfg.maxSeries || (cfg.decimal ? !oneDecimal : !whole)) {
      return { ok: false, error: 'total', row: r + 1 };
    }
    series.push({
      index: r + 1,
      shots: [],
      total: cfg.decimal ? Math.floor(total) : total,
      totalDecimal: cfg.decimal ? round1(total) : undefined,
    });
  }
  return { ok: true, result: resultFromSeries(d, series) };
}
