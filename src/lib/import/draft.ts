import { alignMatch, selectMatchShots, type AlignedShot, type MatchSelection } from '@/lib/alignment/align';
import { DISCIPLINES, validateSeries } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSeries, ParsedSiusResult, Position } from '@/lib/domain/types';
import type { ScattData } from '@/lib/parsers/scatt';

export interface PositionGroup<T = ParsedSeries> {
  position?: Position;
  series: T[];
}

/** Contiguous series with the same position form one group (a 3x20 report gives kneeling, prone, standing). */
export function groupByPosition<T extends { position?: Position | null }>(series: T[]): PositionGroup<T>[] {
  const groups: PositionGroup<T>[] = [];
  for (const s of series) {
    const position = s.position ?? undefined;
    const last = groups[groups.length - 1];
    if (last && last.position === position) last.series.push(s);
    else groups.push({ position, series: [s] });
  }
  return groups;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export type ManualResult =
  | { ok: true; result: ParsedSiusResult }
  | { ok: false; error: 'empty' }
  | { ok: false; error: 'invalid'; line: number };

/** One series per non-blank line; shot values separated by spaces, commas or semicolons (decimal comma allowed). */
export function parseManualSeries(disciplineId: DisciplineId, lines: string[]): ManualResult {
  const cfg = DISCIPLINES[disciplineId];
  const series: ParsedSeries[] = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!text) continue;
    // "10,6 10,5" -> decimal commas; a comma or semicolon followed by a space separates values.
    const tokens = text.split(/[\s;]+|,(?=\s)/).filter(Boolean).map((t) => t.replace(',', '.'));
    const values = tokens.map(Number);
    if (tokens.some((t) => !/^\d+(\.\d+)?$/.test(t)) || !validateSeries(disciplineId, values).ok) {
      return { ok: false, error: 'invalid', line: i + 1 };
    }
    const sum = round1(values.reduce((a, b) => a + b, 0));
    series.push({
      index: series.length + 1,
      shots: values.map((value) => ({ value })),
      total: cfg.decimal ? values.reduce((a, b) => a + Math.floor(b), 0) : sum,
      totalDecimal: cfg.decimal ? sum : undefined,
    });
  }
  if (series.length === 0) return { ok: false, error: 'empty' };
  const total = series.reduce((a, s) => a + s.total, 0);
  return {
    ok: true,
    result: {
      discipline: cfg.nameSr,
      disciplineId,
      total,
      totalDecimal: cfg.decimal ? round1(series.reduce((a, s) => a + (s.totalDecimal ?? 0), 0)) : undefined,
      series,
    },
  };
}

export interface Preview {
  shots: AlignedShot[];
  countMismatch: number;
}

/** The merged SIUS + SCATT view; with no selection or SCATT file nothing is paired. */
export function buildPreview(
  sius: ParsedSiusResult,
  scatt: ScattData | undefined,
  selection: MatchSelection | undefined,
  ignoredIds: number[],
): Preview {
  const selected = scatt && selection ? selectMatchShots(scatt.shots, selection) : [];
  return alignMatch(sius, selected, ignoredIds);
}
