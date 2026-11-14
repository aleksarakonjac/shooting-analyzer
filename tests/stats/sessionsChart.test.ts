import { describe, expect, it } from 'vitest';
import { scoreAxis, sessionsOption } from '@/lib/stats/trendChart';
import type { SessionPoint } from '@/lib/stats/periodStats';

const p = (id: string, trainedOn: string, avgSeries: number | null, hr: number | null, g: number | null): SessionPoint => ({
  id, trainedOn, name: id, total: avgSeries === null ? null : avgSeries * 6, avgSeries, avgGroupMm: g, hr,
  seriesCount: avgSeries === null ? 0 : 6, matchSeries: 6, matchScore: avgSeries === null ? null : avgSeries * 6, projected: false,
});
const pts = [p('a', '2026-10-01', 103.2, 80, 9.1), p('b', '2026-10-08', null, null, null), p('c', '2026-10-09', 104.8, null, 7.5)];

describe('sessionsOption', () => {
  it('plots the total score per session on dates, skipping sessions without a score', () => {
    const o = sessionsOption(pts, 'rez', true);
    const line = o.series[0];
    expect(line.data.map((d: { id: string }) => d.id)).toEqual(['a', 'c']);
    expect(line.data[0].value).toEqual([Date.parse('2026-10-01T00:00:00'), 103.2 * 6]);
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

describe('scoreAxis', () => {
  it('spans at least 6 points around close scores, labelled every point with a 0.5 grid', () => {
    expect(scoreAxis([628.9, 632.9])).toEqual({ min: 627, max: 634, interval: 1 });
    const y = sessionsOption([p('a', '2026-10-01', 628.9 / 6, null, null), p('b', '2026-10-02', 632.9 / 6, null, null)], 'rez', true).yAxis;
    expect(y.minorSplitNumber).toBe(2);
    expect(y.minorSplitLine.show).toBe(true);
  });
  it('widens the step for a wide spread', () => {
    expect(scoreAxis([590, 630])?.interval).toBe(10);
  });
});

describe('sessionsOption tooltip', () => {
  it('shows the six-series score with the real total and average, and how a short session was estimated', () => {
    const long: SessionPoint = { ...pts[0], seriesCount: 8, total: 836, avgSeries: 104.5, matchScore: 621 };
    const short: SessionPoint = { ...pts[0], id: 's', seriesCount: 4, total: 418.1, avgSeries: 104.5, matchScore: 627.2, projected: true };
    const o = sessionsOption([long, short], 'rez', true);
    const [hl, hs] = o.series[0].data.map((d: unknown) => o.tooltip.formatter({ data: d }));
    expect(hl).toContain('Rezultat (prvih 6 serija): 621.0');
    expect(hl).toContain('Ukupno (8 serija): 836.0');
    expect(hl).toContain('Prosek serije (8): 104.5');
    expect(hs).toContain('Procena za 6 serija: 627.2');
    expect(hs).toContain('Ukupno (4 serije): 418.1');
    expect(hs).toContain('Računato: 104.53 × 6 = 627.2');
    // the estimate is drawn as a hollow ring
    expect(o.series[0].data[1].itemStyle.borderWidth).toBe(2);
  });

  it('escapes the session name, which the user typed', () => {
    const o = sessionsOption([{ ...pts[0], name: '<img src=x onerror=alert(1)>' }], 'rez', true);
    const html = o.tooltip.formatter({ data: o.series[0].data[0] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
