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
    expect(line.data[0].value).toEqual([Date.parse('2026-10-01T00:00:00'), 103.2]);
    // Day ticks only, and at least a day of room on each side of the points.
    const x = sessionsOption(pts, 'rez', true).xAxis;
    expect(x.minInterval).toBe(86_400_000);
    expect(x.min).toBeLessThanOrEqual(Date.parse('2026-10-01T00:00:00') - 86_400_000);
    expect(o.xAxis.type).toBe('time');
  });

  it('plots the heart rate or the group when chosen', () => {
    expect(sessionsOption(pts, 'puls', true).series[0].data.map((d: { id: string }) => d.id)).toEqual(['a']);
    expect(sessionsOption(pts, 'grupa', true).series[0].data.map((d: { value: [number, number] }) => d.value[1])).toEqual([9.1, 7.5]);
  });
});

describe('sessionsOption tooltip', () => {
  it('escapes the session name, which the user typed', () => {
    const o = sessionsOption([{ ...pts[0], name: '<img src=x onerror=alert(1)>' }], 'rez', true);
    const html = o.tooltip.formatter({ data: o.series[0].data[0] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
