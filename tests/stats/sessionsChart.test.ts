import { describe, expect, it } from 'vitest';
import { sessionsOption } from '@/lib/stats/trendChart';
import type { SessionPoint } from '@/lib/stats/periodStats';

const p = (id: string, trainedOn: string, avgSeries: number | null, hr: number | null, g: number | null): SessionPoint => ({
  id, trainedOn, name: id, total: avgSeries === null ? null : avgSeries * 6, avgSeries, avgGroupMm: g, hr,
});
const pts = [p('a', '2026-10-01', 103.2, 80, 9.1), p('b', '2026-10-08', null, null, null), p('c', '2026-10-09', 104.8, null, 7.5)];

describe('sessionsOption', () => {
  it('plots the average series per session on dates, skipping sessions without a score', () => {
    const o = sessionsOption(pts, 'rez', true);
    const line = o.series[0];
    expect(line.data.map((d: { id: string }) => d.id)).toEqual(['a', 'c']);
    expect(line.data[0].value).toEqual(['2026-10-01', 103.2]);
    expect(o.xAxis.type).toBe('time');
  });

  it('plots the heart rate or the group when chosen', () => {
    expect(sessionsOption(pts, 'puls', true).series[0].data.map((d: { id: string }) => d.id)).toEqual(['a']);
    expect(sessionsOption(pts, 'grupa', true).series[0].data.map((d: { value: [string, number] }) => d.value[1])).toEqual([9.1, 7.5]);
  });
});
