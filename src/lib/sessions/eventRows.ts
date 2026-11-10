import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import type { SessionStage } from '@/lib/import/saveTraining';

type Num = number | string | null;

/** A session of an event as the event page loads it. */
export interface EventSessionRow {
  id: string;
  name: string;
  discipline: DisciplineId;
  trained_on: string;
  started_at: string | null;
  stage: SessionStage;
  matches: { series: { total: number | null; total_decimal: Num }[] }[];
  finals: { final_shots: { value: Num }[] }[];
}

export interface EventRow {
  id: string;
  name: string;
  discipline: DisciplineId;
  trainedOn: string;
  startedAt: string | null;
  stage: SessionStage;
  /** Match total, or the best recorded final's total on a finale session. */
  total: number | null;
  avgSeries: number | null;
  series: number;
  finals: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** The event's sessions in the order they were shot, each with its result. */
export function eventRows(rows: EventSessionRow[]): EventRow[] {
  return [...rows]
    .sort((a, b) => a.trained_on.localeCompare(b.trained_on) || (a.started_at ?? '').localeCompare(b.started_at ?? ''))
    .map((r) => {
      const dec = DISCIPLINES[r.discipline].decimal;
      const scores = r.matches
        .flatMap((m) => m.series)
        .map((s) => (dec ? (s.total_decimal === null ? s.total : Number(s.total_decimal)) : s.total))
        .filter((v): v is number => v !== null);
      const finalTotals = r.finals.map((f) => round1(f.final_shots.reduce((a, s) => a + Number(s.value), 0)));
      const matchTotal = scores.length ? round1(scores.reduce((a, b) => a + b, 0)) : null;
      return {
        id: r.id,
        name: r.name,
        discipline: r.discipline,
        trainedOn: r.trained_on,
        startedAt: r.started_at,
        stage: r.stage,
        total: matchTotal ?? (finalTotals.length ? Math.max(...finalTotals) : null),
        avgSeries: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        series: scores.length,
        finals: r.finals.length,
      };
    });
}
