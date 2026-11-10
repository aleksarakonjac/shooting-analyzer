import type { DisciplineId } from '@/lib/domain/types';
import type { TrainingSummary } from './periodStats';

/** The PostgREST select that yields what `toSummary` needs. */
export const SUMMARY_SELECT =
  'id,name,trained_on,discipline,shooter_id,kind,stage,place,started_at,tz,events(name),' +
  'matches(align_state,series(idx,total,total_decimal,group_mm,shots(count))),' +
  'loose_shots(count),hr_samples_ref(avg_bpm)';

export interface SummaryRow {
  id: string;
  name: string;
  trained_on: string;
  discipline: DisciplineId;
  shooter_id: string;
  kind?: TrainingSummary['kind'];
  stage?: TrainingSummary['stage'];
  place?: string;
  started_at?: string | null;
  tz?: string;
  events?: { name: string } | null;
  matches: {
    align_state: 'proposed' | 'confirmed';
    series: {
      idx: number;
      total: number | null;
      total_decimal: number | null;
      group_mm: number | null;
      shots: { count: number }[];
    }[];
  }[];
  loose_shots: { count: number }[];
  hr_samples_ref: { avg_bpm: number | null } | { avg_bpm: number | null }[] | null;
}

export const toSummary = (r: SummaryRow): TrainingSummary => {
  const ref = Array.isArray(r.hr_samples_ref) ? r.hr_samples_ref[0] : r.hr_samples_ref;
  return {
    id: r.id,
    name: r.name,
    trainedOn: r.trained_on,
    discipline: r.discipline,
    looseShots: r.loose_shots[0]?.count ?? 0,
    hrAvg: ref?.avg_bpm ?? null,
    kind: r.kind,
    stage: r.stage,
    place: r.place,
    eventName: r.events?.name ?? null,
    startedAt: r.started_at ?? null,
    tz: r.tz,
    matches: r.matches.map((m) => ({
      alignState: m.align_state,
      series: m.series.map((s) => ({
        idx: s.idx,
        total: s.total,
        totalDecimal: s.total_decimal === null ? null : Number(s.total_decimal),
        groupMm: s.group_mm === null ? null : Number(s.group_mm),
        shotCount: s.shots[0]?.count ?? 0,
      })),
    })),
  };
};
