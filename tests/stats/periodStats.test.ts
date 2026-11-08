import { describe, expect, it } from 'vitest';
import { periodRange, periodStats, type TrainingSummary } from '@/lib/stats/periodStats';

const TZ = 'Europe/Belgrade';

const series = (idx: number, total: number, dec: number | null, group: number | null, shots = 10) => ({
  idx,
  total,
  totalDecimal: dec,
  groupMm: group,
  shotCount: shots,
});

const training = (over: Partial<TrainingSummary> & { trainedOn: string }): TrainingSummary => ({
  id: over.trainedOn,
  name: over.trainedOn,
  discipline: 'air_rifle',
  matches: [],
  looseShots: 0,
  hrAvg: null,
  ...over,
});

const NOW = new Date('2026-10-28T10:00:00Z'); // Wednesday 28 Oct 2026, 11:00 Belgrade

describe('periodStats', () => {
  it('has zero counts and null averages for no trainings', () => {
    const s = periodStats([], 'month', NOW, TZ);
    expect(s).toMatchObject({ trainings: 0, shots: 0, avgSeries: null, avgGroupMm: null, avgHr: null });
    expect(s.buckets).toHaveLength(31);
    expect(s.buckets.every((b) => b.avgSeries === null && b.avgGroupMm === null)).toBe(true);
  });

  it('counts the shots of two trainings in one month (match shots plus warm-up and attempts)', () => {
    const a = training({
      trainedOn: '2026-10-21',
      matches: [{ alignState: 'confirmed', series: [series(1, 104, 104.5, 8.0), series(2, 103, 103.7, 10.0)] }],
      looseShots: 49,
    });
    const b = training({
      trainedOn: '2026-10-05',
      matches: [{ alignState: 'proposed', series: [series(1, 100, 101.3, 12.0, 8)] }],
    });
    const s = periodStats([a, b], 'month', NOW, TZ);
    expect(s.trainings).toBe(2);
    expect(s.shots).toBe(10 + 10 + 49 + 8);
    expect(s.avgSeries).toBe(103.2); // (104.5 + 103.7 + 101.3) / 3, decimal discipline
    expect(s.avgGroupMm).toBe(10); // (8 + 10 + 12) / 3
  });

  it('uses whole-ring totals for a whole-ring discipline', () => {
    const t = training({
      trainedOn: '2026-10-21',
      discipline: 'air_pistol',
      matches: [{ alignState: 'confirmed', series: [series(1, 95, null, null), series(2, 97, null, null)] }],
    });
    expect(periodStats([t], 'month', NOW, TZ).avgSeries).toBe(96);
  });

  it('ignores trainings outside the period', () => {
    const s = periodStats([training({ trainedOn: '2026-09-30', looseShots: 5 })], 'month', NOW, TZ);
    expect(s.trainings).toBe(0);
    expect(s.shots).toBe(0);
  });

  it('includes proposed matches in avgSeries but not in the heart-rate average', () => {
    const proposed = training({
      trainedOn: '2026-10-21',
      matches: [{ alignState: 'proposed', series: [series(1, 100, 100.0, null)] }],
      hrAvg: 150,
    });
    const confirmed = training({
      trainedOn: '2026-10-22',
      matches: [{ alignState: 'confirmed', series: [series(1, 100, 104.0, null)] }],
      hrAvg: 90,
    });
    const s = periodStats([proposed, confirmed], 'month', NOW, TZ);
    expect(s.avgSeries).toBe(102);
    expect(s.avgHr).toBe(90);
  });

  it('averages heart rate over trainings with a value and is null when none has one', () => {
    const a = training({ trainedOn: '2026-10-21', matches: [{ alignState: 'confirmed', series: [] }], hrAvg: 80 });
    const b = training({ trainedOn: '2026-10-22', matches: [{ alignState: 'confirmed', series: [] }], hrAvg: 100 });
    const c = training({ trainedOn: '2026-10-23', matches: [{ alignState: 'confirmed', series: [] }] });
    expect(periodStats([a, b, c], 'month', NOW, TZ).avgHr).toBe(90);
    expect(periodStats([c], 'month', NOW, TZ).avgHr).toBeNull();
  });

  it('week boundaries follow the Belgrade calendar, not UTC', () => {
    // 23:30 UTC on Sunday 1 Nov 2026 is already Monday 2 Nov, 00:30 in Belgrade.
    const now = new Date('2026-11-01T23:30:00Z');
    const sunday = training({ trainedOn: '2026-11-01', looseShots: 1 });
    const monday = training({ trainedOn: '2026-11-02', looseShots: 2 });
    const s = periodStats([sunday, monday], 'week', now, TZ);
    expect(s.trainings).toBe(1);
    expect(s.shots).toBe(2);
    expect(periodStats([sunday, monday], 'week', now, 'UTC').trainings).toBe(1);
    expect(periodStats([sunday, monday], 'week', now, 'UTC').shots).toBe(1);
  });

  it('makes seven daily buckets for a week, per-day buckets for a month and twelve monthly buckets for a year', () => {
    expect(periodStats([], 'week', NOW, TZ).buckets).toHaveLength(7);
    expect(periodStats([], 'month', NOW, TZ).buckets).toHaveLength(31);
    expect(periodStats([], 'year', NOW, TZ).buckets).toHaveLength(12);
  });

  it('puts a training into its bucket with the bucket averages', () => {
    const t = training({
      trainedOn: '2026-10-28',
      matches: [{ alignState: 'confirmed', series: [series(1, 100, 104.0, 6.0), series(2, 100, 102.0, 8.0)] }],
    });
    const s = periodStats([t], 'week', NOW, TZ);
    expect(s.buckets[2]).toMatchObject({ avgSeries: 103, avgGroupMm: 7 }); // Mon=0, Tue=1, Wed=2
    expect(s.buckets[0].avgSeries).toBeNull();
  });
});

describe('periodRange', () => {
  it('gives inclusive first and exclusive end dates', () => {
    expect(periodRange('week', NOW, TZ)).toEqual({ from: '2026-10-26', to: '2026-11-02' });
    expect(periodRange('month', NOW, TZ)).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(periodRange('year', NOW, TZ)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
  });
});
