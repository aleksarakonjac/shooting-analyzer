import { describe, expect, it } from 'vitest';
import { sessionPoints, setStats, type TrainingSummary } from '@/lib/stats/periodStats';

const s = (idx: number, dec: number, group: number | null) => ({ idx, total: Math.floor(dec), totalDecimal: dec, groupMm: group, shotCount: 10 });
const tr = (over: Partial<TrainingSummary> & { id: string; trainedOn: string }): TrainingSummary => ({
  name: over.id, discipline: 'air_rifle', matches: [], looseShots: 0, hrAvg: null, ...over,
});

const a = tr({ id: 'a', trainedOn: '2026-10-21', matches: [{ alignState: 'confirmed', series: [s(1, 104.5, 8), s(2, 103.5, 10)] }], looseShots: 5, hrAvg: 80 });
const b = tr({ id: 'b', trainedOn: '2026-11-02', matches: [{ alignState: 'proposed', series: [s(1, 105, null)] }], hrAvg: 120 });
const c = tr({ id: 'c', trainedOn: '2026-11-03', discipline: 'air_pistol' });

describe('setStats', () => {
  it('sums sessions and shots and averages series, group and confirmed heart rate over the whole set', () => {
    expect(setStats([a, b])).toEqual({ trainings: 2, shots: 35, avgSeries: 104.3, avgGroupMm: 9, avgHr: 80 });
  });
});

describe('sessionPoints', () => {
  it('gives one point per session of the discipline, oldest first, with match total, average series and group', () => {
    expect(sessionPoints([b, c, a], 'air_rifle')).toEqual([
      { id: 'a', trainedOn: '2026-10-21', name: 'a', total: 208, avgSeries: 104, avgGroupMm: 9, hr: 80 },
      { id: 'b', trainedOn: '2026-11-02', name: 'b', total: 105, avgSeries: 105, avgGroupMm: null, hr: null },
    ]);
  });
});
