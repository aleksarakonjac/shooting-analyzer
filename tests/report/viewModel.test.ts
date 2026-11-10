import { describe, expect, it } from 'vitest';
import { buildReportView, type RawSeries } from '@/lib/report/viewModel';
import { hrOption, rolling, timelineOption } from '@/lib/report/charts';

const raw: RawSeries[] = [
  { id: 'b', idx: 2, position: null, total: 103, total_decimal: 103.7, mpi_x: 1.2, mpi_y: -0.5, group_mm: 9.1,
    shots: [{ idx: 2, value: 9.8, inner: false, t_ms: 4000 }, { idx: 1, value: 10.6, inner: true, t_ms: 3000 }] },
  { id: 'a', idx: 1, position: null, total: 104, total_decimal: 104.5, mpi_x: null, mpi_y: null, group_mm: null,
    shots: [{ idx: 1, value: 10.2, inner: false, t_ms: 1000 }, { idx: 2, value: 10.5, inner: true, t_ms: null }] },
];

describe('buildReportView', () => {
  const v = buildReportView(raw, 'air_rifle');

  it('orders series and numbers the shots through the match', () => {
    expect(v.series.map((s) => s.idx)).toEqual([1, 2]);
    expect(v.series[1].shots.map((s) => s.n)).toEqual([3, 4]);
    expect(v.series[1].shots[0].value).toBe(10.6);
    expect(v.series[1]).toMatchObject({ firstShot: 3, lastShot: 4, total: 103.7, groupMm: 9.1, mpi: { x: 1.2, y: -0.5 } });
    expect(v.series[0].mpi).toBeNull();
  });

  it('sums the total, counts shots and timed shots, and bands each shot', () => {
    expect(v.total).toBe(208.2);
    expect(v.shotCount).toBe(4);
    expect(v.timedShots).toBe(3);
    expect(v.series[0].shots[1].band).toBe('top');
  });
});

describe('timelineOption', () => {
  const v = buildReportView(raw, 'air_rifle');

  it('plots timed shots only, shades one band per series and marks the selected shot', () => {
    const o = timelineOption(v, { series: 2, shot: 3 }, 'Europe/Belgrade');
    const shots = o.series[0].data;
    expect(shots).toHaveLength(3);
    expect(shots.find((d: { n: number }) => d.n === 3).symbolSize).toBeGreaterThan(shots.find((d: { n: number }) => d.n === 1).symbolSize);
    expect(o.series[0].markArea.data).toHaveLength(2);
    expect(o.dataZoom.length).toBeGreaterThan(0);
    expect(o.yAxis[0].name).toBe('Pogodak');
    expect(o.yAxis).toHaveLength(1);
  });

  it('overlays the heart rate on a second axis when there is one', () => {
    const o = timelineOption(v, { series: 1, shot: null }, 'Europe/Belgrade', [{ tMs: 900, bpm: 80 }, { tMs: 4100, bpm: 84 }]);
    expect(o.yAxis).toHaveLength(2);
    expect(o.yAxis[1].name).toBe('otk/min');
    const hr = o.series.find((s: { name: string }) => s.name === 'Puls');
    expect(hr.yAxisIndex).toBe(1);
    // The heart rate sits in the lower third: its axis reaches far above the highest value.
    expect(o.yAxis[1].max).toBeGreaterThanOrEqual(84 + 2 * (84 - 80));
    expect(o.yAxis[1].min).toBeLessThanOrEqual(80);
    // Labels only inside the heart-rate band.
    expect(o.yAxis[1].axisLabel.formatter(82)).toBe('82');
    expect(o.yAxis[1].axisLabel.formatter(100)).toBe('');
  });

  it('starts the score axis just below the lowest shot', () => {
    const o = timelineOption(v, { series: 1, shot: null }, 'Europe/Belgrade');
    expect(o.yAxis[0].min).toBe(9.7); // lowest timed shot 9.8, a tenth below it
    expect(o.yAxis[0].interval).toBe(0.1);
  });
});

describe('hrOption', () => {
  const v = buildReportView(raw, 'air_rifle');
  const hr = [{ tMs: 900, bpm: 80 }, { tMs: 2900, bpm: 82 }, { tMs: 4100, bpm: 84 }];

  it('puts every timed shot on the heart-rate curve, at the heart rate of that moment', () => {
    const o = hrOption(hr, v, { series: 1, shot: null }, 'Europe/Belgrade');
    expect(o.series[0].data).toEqual([[900, 80], [2900, 82], [4100, 84]]);
    const shots = o.series.find((s: { name: string }) => s.name === 'Pogoci');
    expect(shots.data.map((d: { n: number; value: [number, number] }) => [d.n, d.value[1]])).toEqual([[1, 80.1], [3, 82.2], [4, 83.8]]);
  });

  it('draws a marker line only for the selected shot, and the selected shot large', () => {
    expect(hrOption(hr, v, { series: 1, shot: null }, 'Europe/Belgrade').series[0].markLine.data).toHaveLength(0);
    const o = hrOption(hr, v, { series: 2, shot: 3 }, 'Europe/Belgrade');
    expect(o.series[0].markLine.data).toHaveLength(1);
    const shots = o.series.find((s: { name: string }) => s.name === 'Pogoci');
    const big = shots.data.find((d: { n: number }) => d.n === 3);
    expect(big.symbolSize).toBeGreaterThan(shots.data.find((d: { n: number }) => d.n === 1).symbolSize);
  });
});

describe('rolling', () => {
  it('averages the trailing window', () => {
    const s = [0, 1000, 2000, 20000].map((tMs, i) => ({ tMs, bpm: [90, 100, 110, 80][i] }));
    expect(rolling(s, 15000)).toEqual([[0, 90], [1000, 95], [2000, 100], [20000, 80]]);
  });
});
