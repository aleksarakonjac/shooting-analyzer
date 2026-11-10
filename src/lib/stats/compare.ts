import { DISCIPLINES } from '@/lib/domain/disciplines';
import { hrCounts, type TrainingSummary } from './periodStats';

/** Most sessions the comparison shows side by side. */
export const MAX_COMPARE = 6;

export interface SessionMetrics {
  id: string;
  total: number | null;
  avgSeries: number | null;
  bestSeries: number | null;
  worstSeries: number | null;
  groupMm: number | null;
  hr: number | null;
  shots: number;
  durationMin: number | null;
  /** Series scores in order, for the expandable breakdown. */
  series: (number | null)[];
  /** Group size (mm) of each series, same order. */
  seriesGroups: (number | null)[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The comparable figures of one session; series scores follow the discipline (decimal or whole). */
export function sessionMetrics(t: TrainingSummary): SessionMetrics {
  const dec = DISCIPLINES[t.discipline].decimal;
  const series = t.matches.flatMap((m) => m.series).sort((a, b) => a.idx - b.idx);
  const scores = series.map((s) => (dec ? (s.totalDecimal ?? s.total) : s.total));
  const have = scores.filter((v): v is number => v !== null);
  const groups = series.map((s) => s.groupMm).filter((g): g is number => g !== null);
  const dur = t.startedAt && t.endedAt ? (Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 60_000 : null;
  return {
    id: t.id,
    total: have.length ? round1(have.reduce((a, b) => a + b, 0)) : null,
    avgSeries: have.length ? round1(have.reduce((a, b) => a + b, 0) / have.length) : null,
    bestSeries: have.length ? Math.max(...have) : null,
    worstSeries: have.length ? Math.min(...have) : null,
    groupMm: groups.length ? round1(groups.reduce((a, b) => a + b, 0) / groups.length) : null,
    hr: hrCounts(t) ? Math.round(t.hrAvg as number) : null,
    shots: series.reduce((a, s) => a + s.shotCount, 0),
    durationMin: dur !== null && dur > 0 ? Math.round(dur) : null,
    series: scores,
    seriesGroups: series.map((x) => x.groupMm),
  };
}

/** Index of the best value (highest, or lowest when `lowerIsBetter`); null when fewer than two have a value or all tie. */
export function bestIndex(values: (number | null)[], lowerIsBetter = false): number | null {
  const have = values.filter((v): v is number => v !== null);
  if (have.length < 2) return null;
  const best = lowerIsBetter ? Math.min(...have) : Math.max(...have);
  if (have.every((v) => v === best)) return null;
  return values.indexOf(best);
}

/** Difference to the first (base) value, rounded to one decimal; null when either is missing. */
export const deltaTo = (base: number | null, v: number | null): number | null =>
  base === null || v === null ? null : round1(v - base);

/**
 * The sessions to compare: those named in `ids` that are in `all` (in list order), else the newest
 * `fallback`. Only one discipline is compared, that of the first; `dropped` counts the others.
 */
export function pickCompared(all: TrainingSummary[], ids: string[], fallback = 4): { sessions: TrainingSummary[]; dropped: number } {
  const wanted = ids.length ? all.filter((t) => ids.includes(t.id)) : all.slice(0, fallback);
  const first = wanted[0];
  const same = first ? wanted.filter((t) => t.discipline === first.discipline) : [];
  const sessions = same.slice(0, MAX_COMPARE);
  return { sessions, dropped: wanted.length - sessions.length };
}
