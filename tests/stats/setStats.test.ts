import { describe, expect, it } from 'vitest';
import { sessionPoints, setStats, type TrainingSummary } from '@/lib/stats/periodStats';

const s = (idx: number, dec: number, group: number | null) => ({ idx, total: Math.floor(dec), totalDecimal: dec, groupMm: group, shotCount: 10 });
const tr = (over: Partial<TrainingSummary> & { id: string; trainedOn: string }): TrainingSummary => ({
  name: over.id, discipline: 'air_rifle', matches: [], hrAvg: null, ...over,
});

const a = tr({ id: 'a', trainedOn: '2026-10-21', matches: [{ alignState: 'confirmed', series: [s(1, 104.5, 8), s(2, 103.5, 10)] }], hrAvg: 80 });
const b = tr({ id: 'b', trainedOn: '2026-11-02', matches: [{ alignState: 'proposed', series: [s(1, 105, null)] }], hrAvg: 120 });
const c = tr({ id: 'c', trainedOn: '2026-11-03', discipline: 'air_pistol' });

describe('setStats', () => {
  it('sums sessions and shots and averages series, group and confirmed heart rate over the whole set', () => {
    expect(setStats([a, b])).toEqual({ trainings: 2, shots: 30, avgSeries: 104.3, avgGroupMm: 9, avgHr: 80 });
  });
});

describe('sessionPoints', () => {
  it('gives one point per session of the discipline, oldest first, with match total, average series and group', () => {
    expect(sessionPoints([b, c, a], 'air_rifle')).toEqual([
      { id: 'a', trainedOn: '2026-10-21', name: 'a', total: 208, avgSeries: 104, avgGroupMm: 9, hr: 80, seriesCount: 2, matchSeries: 6, matchScore: 624, projected: true },
      { id: 'b', trainedOn: '2026-11-02', name: 'b', total: 105, avgSeries: 105, avgGroupMm: null, hr: null, seriesCount: 1, matchSeries: 6, matchScore: 630, projected: true },
    ]);
  });

  it('scores a longer session on its first six series and a shorter one as its average times six', () => {
    const eight = tr({ id: 'e', trainedOn: '2026-11-04', matches: [{ alignState: 'confirmed', series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => s(i, 100 + i, null)) }] });
    const [p] = sessionPoints([eight], 'air_rifle');
    expect(p).toMatchObject({ seriesCount: 8, total: 836, matchScore: 621, projected: false, avgSeries: 104.5 });
    const four = tr({ id: 'f', trainedOn: '2026-11-05', matches: [{ alignState: 'confirmed', series: [s(1, 104, null), s(2, 105, null), s(3, 103, null), s(4, 106.1, null)] }] });
    expect(sessionPoints([four], 'air_rifle')[0]).toMatchObject({ seriesCount: 4, total: 418.1, matchScore: 627.2, projected: true });
  });

  it('keeps the plain total for a discipline without a match length', () => {
    const tp = tr({ id: 'g', trainedOn: '2026-11-06', discipline: 'smallbore_3p', matches: [{ alignState: 'confirmed', series: [s(1, 95, null), s(2, 97, null)] }] });
    expect(sessionPoints([tp], 'smallbore_3p')[0]).toMatchObject({ matchSeries: null, matchScore: 192, projected: false });
  });
});
