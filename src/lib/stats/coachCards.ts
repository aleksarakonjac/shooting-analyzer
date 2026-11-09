import type { DisciplineId } from '@/lib/domain/types';
import { periodRange, periodStats, type TrainingSummary } from './periodStats';

export interface ShooterCard {
  /** Date of the newest training, YYYY-MM-DD. */
  lastTrainedOn: string | null;
  /** Discipline of that newest training; the card compares only this discipline. */
  discipline: DisciplineId | null;
  trainingsThisMonth: number;
  avgSeries: number | null;
  /** This month's average series minus last month's, null when either side is missing. */
  delta: number | null;
}

/** Summary of one shooter for the coach's card: latest date and the monthly trend. */
export function shooterCard(trainings: TrainingSummary[], now: Date, tz: string): ShooterCard {
  const newest = trainings.reduce<TrainingSummary | null>(
    (best, t) => (best === null || t.trainedOn > best.trainedOn ? t : best),
    null,
  );
  if (!newest) return { lastTrainedOn: null, discipline: null, trainingsThisMonth: 0, avgSeries: null, delta: null };

  // Series scores of different disciplines are not comparable.
  const same = trainings.filter((t) => t.discipline === newest.discipline);
  const { from } = periodRange('month', now, tz);
  const lastMonth = new Date(Date.parse(`${from}T12:00:00Z`) - 86_400_000);
  const current = periodStats(same, 'month', now, tz);
  const previous = periodStats(same, 'month', lastMonth, tz);
  const delta =
    current.avgSeries === null || previous.avgSeries === null
      ? null
      : Math.round((current.avgSeries - previous.avgSeries) * 10) / 10;
  return {
    lastTrainedOn: newest.trainedOn,
    discipline: newest.discipline,
    trainingsThisMonth: current.trainings,
    avgSeries: current.avgSeries,
    delta,
  };
}
