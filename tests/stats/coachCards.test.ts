import { describe, expect, it } from 'vitest';
import { shooterCard } from '@/lib/stats/coachCards';
import type { TrainingSummary } from '@/lib/stats/periodStats';

const TZ = 'Europe/Belgrade';
const NOW = new Date('2026-10-28T10:00:00Z');

const training = (trainedOn: string, total: number, over: Partial<TrainingSummary> = {}): TrainingSummary => ({
  id: trainedOn,
  name: trainedOn,
  trainedOn,
  discipline: 'air_rifle',
  matches: [
    { alignState: 'confirmed', series: [{ idx: 1, total: Math.floor(total), totalDecimal: total, groupMm: 8, shotCount: 10 }] },
  ],
  looseShots: 0,
  hrAvg: null,
  ...over,
});

describe('shooterCard', () => {
  it('is empty for a shooter without trainings', () => {
    expect(shooterCard([], NOW, TZ)).toEqual({
      lastTrainedOn: null,
      discipline: null,
      trainingsThisMonth: 0,
      avgSeries: null,
      delta: null,
    });
  });

  it('takes the latest date and discipline, this month average, and the change against last month', () => {
    const card = shooterCard(
      [training('2026-10-21', 104), training('2026-10-07', 102), training('2026-09-15', 100)],
      NOW,
      TZ,
    );
    expect(card.lastTrainedOn).toBe('2026-10-21');
    expect(card.discipline).toBe('air_rifle');
    expect(card.trainingsThisMonth).toBe(2);
    expect(card.avgSeries).toBe(103);
    expect(card.delta).toBe(3); // 103 - 100
  });

  it('has no change when last month has no trainings', () => {
    const card = shooterCard([training('2026-10-21', 104)], NOW, TZ);
    expect(card.avgSeries).toBe(104);
    expect(card.delta).toBeNull();
  });

  it('compares only trainings of the latest discipline', () => {
    const card = shooterCard(
      [training('2026-10-21', 104), training('2026-10-02', 380, { discipline: 'smallbore_3p' }), training('2026-09-20', 100)],
      NOW,
      TZ,
    );
    expect(card.discipline).toBe('air_rifle');
    expect(card.trainingsThisMonth).toBe(1);
    expect(card.delta).toBe(4);
  });

  it('handles January (previous month is December of last year)', () => {
    const card = shooterCard([training('2027-01-10', 105), training('2026-12-10', 100)], new Date('2027-01-20T10:00:00Z'), TZ);
    expect(card.delta).toBe(5);
  });
});
