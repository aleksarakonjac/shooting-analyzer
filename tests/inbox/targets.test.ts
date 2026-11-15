import { describe, expect, it } from 'vitest';
import { orderTargets } from '../../src/lib/inbox/targets';
import { hasScatt, type TrainingSummary } from '../../src/lib/stats/periodStats';

const s = (id: string, trainedOn: string, paired: boolean): TrainingSummary => ({
  id,
  name: id,
  trainedOn,
  discipline: 'air_rifle',
  hrAvg: null,
  matches: [{ alignState: 'proposed', paired, series: [] }],
} as TrainingSummary);

describe('orderTargets', () => {
  it('puts same-day sessions still missing the data first, then other missing, then the rest', () => {
    const list = [s('today-has', '2026-11-14', true), s('old-missing', '2026-11-10', false), s('today-missing', '2026-11-14', false), s('old-has', '2026-11-09', true)];
    const out = orderTargets(list, '2026-11-14', hasScatt);
    expect(out.map((t) => t.id)).toEqual(['today-missing', 'old-missing', 'today-has', 'old-has']);
    expect(out.map((t) => t.has)).toEqual([false, false, true, true]);
  });
});
