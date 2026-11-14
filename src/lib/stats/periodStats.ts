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
  /** `paired`: a SCATT file was matched to the SIUS shots, so a proposed alignment is something to confirm. */
  matches: { alignState: 'proposed' | 'confirmed'; paired?: boolean; series: SeriesSummary[] }[];
  /** Warm-up shots and failed attempts. */
  /** Average heart rate over the match shots, computed when the training was saved. */
  hrAvg: number | null;
  kind?: 'trening' | 'kontrolni' | 'takmicenje';
  stage?: 'slobodno' | 'eliminacije' | 'kvalifikacije' | 'finale';
  place?: string;
  eventName?: string | null;
  /** Start instant (ISO) and the venue zone it is read in. */
  startedAt?: string | null;
  endedAt?: string | null;
  tz?: string;
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

export interface SetStats {
  trainings: number;
  shots: number;
  avgSeries: number | null;
  avgGroupMm: number | null;
  avgHr: number | null;
}

/** Whether a session has a SCATT file paired to its SIUS shots, and whether it has a pulse; the list flags and filters read these. */
export const hasScatt = (t: TrainingSummary) => t.matches.some((m) => m.paired);
export const hasPulse = (t: TrainingSummary) => t.hrAvg !== null;

/** A session's heart rate counts only when its shots are aligned to the clock (not only proposed). */
export const hrCounts = (t: TrainingSummary) => t.hrAvg !== null && !(t.matches.length > 0 && t.matches.every((m) => m.alignState === 'proposed'));

/** Figures over a set of sessions: count, shots (matched series only; hidden SCATT probe shots are not counted), averages. */
export function setStats(trainings: TrainingSummary[]): SetStats {
  const hr = trainings.filter(hrCounts).map((t) => t.hrAvg as number);
  const shots = trainings.reduce(
    (a, t) => a + t.matches.reduce((b, m) => b + m.series.reduce((c, s) => c + s.shotCount, 0), 0),
    0,
  );
  return {
    trainings: trainings.length,
    shots,
    ...averages(trainings),
    avgHr: hr.length === 0 ? null : Math.round(hr.reduce((a, b) => a + b, 0) / hr.length),
  };
}

export interface SessionPoint {
  id: string;
  trainedOn: string;
  name: string;
  /** Sum of every series of the session. */
  total: number | null;
  /** Average over every series of the session. */
  avgSeries: number | null;
  avgGroupMm: number | null;
  hr: number | null;
  /** Series with a score in the session. */
  seriesCount: number;
  /** The discipline's match length in series (6), or null when it has none. */
  matchSeries: number | null;
  /**
   * The session as one match of `matchSeries` series, so sessions of different length compare:
   * the first `matchSeries` series when there are as many or more, the average times `matchSeries` when there are
   * fewer (`projected`), the plain total when the discipline has no match length.
   */
  matchScore: number | null;
  projected: boolean;
}

/** One chart point per session of a discipline, oldest first. */
export function sessionPoints(trainings: TrainingSummary[], discipline: DisciplineId): SessionPoint[] {
  return trainings
    .filter((t) => t.discipline === discipline)
    .sort((a, b) => a.trainedOn.localeCompare(b.trainedOn) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
    .map((t) => {
      const scores = t.matches.flatMap((m) => m.series).map((s) => seriesScore(t.discipline, s)).filter((v): v is number => v !== null);
      const avg = averages([t]);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      const n = DISCIPLINES[t.discipline].referenceMatchSeries;
      const projected = n !== null && scores.length > 0 && scores.length < n;
      const matchScore =
        scores.length === 0 ? null
        : n === null ? round1(sum(scores))
        : projected ? round1((sum(scores) / scores.length) * n)
        : round1(sum(scores.slice(0, n)));
      return {
        id: t.id,
        trainedOn: t.trainedOn,
        name: t.name,
        total: scores.length ? round1(sum(scores)) : null,
        avgSeries: avg.avgSeries,
        avgGroupMm: avg.avgGroupMm,
        hr: hrCounts(t) ? t.hrAvg : null,
        seriesCount: scores.length,
        matchSeries: n,
        matchScore,
        projected,
      };
    });
}

/**
 * Dashboard figures for the period containing `now` (calendar dates in `tz`).
 * Proposed matches count for SIUS-only figures (series scores, groups) but not for
 * the heart-rate average, which depends on the shots being aligned to the clock.
 */
export function periodStats(trainings: TrainingSummary[], period: Period, now: Date, tz: string): PeriodStats {
  const { from, to } = periodRange(period, now, tz);
  const inPeriod = trainings.filter((t) => t.trainedOn >= from && t.trainedOn < to);


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
    ...setStats(inPeriod),
    buckets: keys.map((k) => ({ label: k.label, ...averages(inPeriod.filter((t) => k.match(t.trainedOn))) })),
  };
}
