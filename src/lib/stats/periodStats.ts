import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';

export type Period = 'week' | 'month' | 'year';

export interface SeriesSummary {
  idx: number;
  total: number | null;
  totalDecimal: number | null;
  groupMm: number | null;
  shotCount: number;
}

export interface TrainingSummary {
  id: string;
  name: string;
  /** Local calendar date, YYYY-MM-DD. */
  trainedOn: string;
  discipline: DisciplineId;
  matches: { alignState: 'proposed' | 'confirmed'; series: SeriesSummary[] }[];
  /** Warm-up shots and failed attempts. */
  looseShots: number;
  /** Average heart rate over the match shots, computed when the training was saved. */
  hrAvg: number | null;
}

export interface Bucket {
  label: string;
  avgSeries: number | null;
  avgGroupMm: number | null;
}

export interface PeriodStats {
  trainings: number;
  shots: number;
  avgSeries: number | null;
  avgGroupMm: number | null;
  avgHr: number | null;
  buckets: Bucket[];
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ['pon', 'uto', 'sre', 'čet', 'pet', 'sub', 'ned'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];

const round1 = (v: number) => Math.round(v * 10) / 10;
const mean = (xs: number[]): number | null => (xs.length === 0 ? null : round1(xs.reduce((a, b) => a + b, 0) / xs.length));

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const asDay = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Today's calendar date in `tz`, as YYYY-MM-DD. */
function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

/** First day (inclusive) and day after the last (exclusive) of the period containing `now` in `tz`. */
export function periodRange(period: Period, now: Date, tz: string): { from: string; to: string } {
  const today = localDate(now, tz);
  const [y, m] = today.split('-').map(Number);
  if (period === 'year') return { from: `${y}-01-01`, to: `${y + 1}-01-01` };
  if (period === 'month') {
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: next };
  }
  const day = asDay(today);
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return { from: iso(day - sinceMonday * DAY_MS), to: iso(day + (7 - sinceMonday) * DAY_MS) };
}

const seriesScore = (d: DisciplineId, s: SeriesSummary): number | null =>
  DISCIPLINES[d].decimal ? (s.totalDecimal ?? s.total) : s.total;

function averages(trainings: TrainingSummary[]): { avgSeries: number | null; avgGroupMm: number | null } {
  const scores: number[] = [];
  const groups: number[] = [];
  for (const t of trainings) {
    for (const m of t.matches) {
      for (const s of m.series) {
        const v = seriesScore(t.discipline, s);
        if (v !== null) scores.push(v);
        if (s.groupMm !== null) groups.push(s.groupMm);
      }
    }
  }
  return { avgSeries: mean(scores), avgGroupMm: mean(groups) };
}

/**
 * Dashboard figures for the period containing `now` (calendar dates in `tz`).
 * Proposed matches count for SIUS-only figures (series scores, groups) but not for
 * the heart-rate average, which depends on the shots being aligned to the clock.
 */
export function periodStats(trainings: TrainingSummary[], period: Period, now: Date, tz: string): PeriodStats {
  const { from, to } = periodRange(period, now, tz);
  const inPeriod = trainings.filter((t) => t.trainedOn >= from && t.trainedOn < to);

  const hr = inPeriod
    .filter((t) => t.hrAvg !== null && !(t.matches.length > 0 && t.matches.every((m) => m.alignState === 'proposed')))
    .map((t) => t.hrAvg as number);
  const shots = inPeriod.reduce(
    (a, t) => a + t.looseShots + t.matches.reduce((b, m) => b + m.series.reduce((c, s) => c + s.shotCount, 0), 0),
    0,
  );

  // Buckets: days for a week or month, months for a year.
  const keys: { label: string; match: (date: string) => boolean }[] = [];
  if (period === 'year') {
    const year = from.slice(0, 4);
    MONTHS.forEach((label, i) => keys.push({ label, match: (d) => d.startsWith(`${year}-${String(i + 1).padStart(2, '0')}-`) }));
  } else {
    for (let day = asDay(from); day < asDay(to); day += DAY_MS) {
      const date = iso(day);
      const label = period === 'week' ? WEEKDAYS[keys.length] : String(Number(date.slice(8)));
      keys.push({ label, match: (d) => d === date });
    }
  }

  return {
    trainings: inPeriod.length,
    shots,
    ...averages(inPeriod),
    avgHr: hr.length === 0 ? null : Math.round(hr.reduce((a, b) => a + b, 0) / hr.length),
    buckets: keys.map((k) => ({ label: k.label, ...averages(inPeriod.filter((t) => k.match(t.trainedOn))) })),
  };
}

/**
 * Buckets of the current period that are not in the future (a month on the 9th shows days 1-9),
 * so a chart does not spend most of its width on days that have not happened. A month never shows
 * fewer than seven days.
 */
export function pastBuckets<B>(buckets: B[], period: Period, now: Date, tz: string): B[] {
  const today = localDate(now, tz);
  const [, m, d] = today.split('-').map(Number);
  const index =
    period === 'year' ? m : period === 'month' ? Math.max(d, 7) : ((new Date(asDay(today)).getUTCDay() + 6) % 7) + 1;
  return buckets.slice(0, Math.min(buckets.length, index));
}
