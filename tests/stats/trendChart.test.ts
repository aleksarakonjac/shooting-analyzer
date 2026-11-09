import { describe, expect, it } from 'vitest';
import { trendOption } from '@/lib/stats/trendChart';

const buckets = [
  { label: 'sep', avgSeries: 103.2, avgGroupMm: 9.1 },
  { label: 'okt', avgSeries: null, avgGroupMm: null },
  { label: 'nov', avgSeries: 105.1, avgGroupMm: 7.7 },
];

describe('trendOption', () => {
  const o = trendOption(buckets, true);

  it('puts the bucket labels on the x axis, gives empty buckets no point and draws the line across them', () => {
    expect(o.xAxis.data).toEqual(['sep', 'okt', 'nov']);
    const series = o.series.find((s: { name: string }) => s.name === 'Prosek serije');
    expect(series.data).toEqual([103.2, null, 105.1]);
    expect(series.connectNulls).toBe(true);
  });

  it('draws the average group as bars on a second axis in millimetres', () => {
    const group = o.series.find((s: { name: string }) => s.name === 'Prosečna grupa');
    expect(group.type).toBe('bar');
    expect(group.yAxisIndex).toBe(1);
    expect(group.data).toEqual([9.1, null, 7.7]);
    expect(o.yAxis[1].name).toBe('mm');
  });

  it('has a legend for both series', () => {
    expect(o.legend.data).toEqual(['Prosek serije', 'Prosečna grupa']);
  });
});
