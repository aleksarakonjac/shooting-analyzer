import { describe, expect, it } from 'vitest';
import { bestIndex, deltaTo, MAX_COMPARE, pickCompared, sessionMetrics } from '@/lib/stats/compare';
import type { TrainingSummary } from '@/lib/stats/periodStats';

const s = (idx: number, dec: number, group: number | null, shots = 10) => ({ idx, total: Math.floor(dec), totalDecimal: dec, groupMm: group, shotCount: shots });
const tr = (id: string, over: Partial<TrainingSummary> = {}): TrainingSummary => ({
  id, name: id, trainedOn: '2026-11-01', discipline: 'air_rifle', hrAvg: null,
  matches: [{ alignState: 'confirmed', series: [s(1, 104.5, 8), s(2, 106, 10)] }], ...over,
});

describe('sessionMetrics', () => {
  it('sums, averages and picks best and worst series', () => {
    const m = sessionMetrics(tr('a', { hrAvg: 91.6, startedAt: '2026-11-01T17:00:00Z', endedAt: '2026-11-01T18:02:00Z' }));
    expect(m).toMatchObject({ total: 210.5, avgSeries: 105.3, bestSeries: 106, worstSeries: 104.5, groupMm: 9, hr: 92, shots: 20, durationMin: 62 });
    expect(m.series).toEqual([104.5, 106]);
  });
  it('leaves what is missing empty, and ignores a pulse that is only proposed', () => {
    const m = sessionMetrics(tr('a', { hrAvg: 90, matches: [{ alignState: 'proposed', series: [] }] }));
    expect(m).toMatchObject({ total: null, avgSeries: null, groupMm: null, hr: null, durationMin: null, shots: 0 });
  });
  it('uses whole scores for a whole-ring discipline', () => {
    const m = sessionMetrics(tr('a', { discipline: 'smallbore_3p', matches: [{ alignState: 'confirmed', series: [s(1, 98.7, null)] }] }));
    expect(m.total).toBe(98);
  });
});

describe('bestIndex and deltaTo', () => {
  it('finds the best, lowest for groups, none on a tie or a lone value', () => {
    expect(bestIndex([1, 3, 2])).toBe(1);
    expect(bestIndex([8, 7.6, null], true)).toBe(1);
    expect(bestIndex([5, 5])).toBeNull();
    expect(bestIndex([5, null])).toBeNull();
  });
  it('measures against the base', () => {
    expect(deltaTo(625.4, 620.1)).toBe(-5.3);
    expect(deltaTo(null, 1)).toBeNull();
  });
});

describe('pickCompared', () => {
  const all = ['a', 'b', 'c', 'd', 'e'].map((id) => tr(id));
  it('defaults to the newest four', () => {
    expect(pickCompared(all, []).sessions.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('takes the named sessions in list order, one discipline, at most the maximum', () => {
    const mixed = [tr('a'), tr('p', { discipline: 'air_pistol' }), tr('b')];
    const r = pickCompared(mixed, ['a', 'p', 'b']);
    expect(r.sessions.map((t) => t.id)).toEqual(['a', 'b']);
    expect(r.dropped).toBe(1);
    const many = Array.from({ length: 9 }, (_, i) => tr(String(i)));
    expect(pickCompared(many, many.map((t) => t.id)).sessions).toHaveLength(MAX_COMPARE);
  });
});
