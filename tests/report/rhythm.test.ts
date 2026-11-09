import { describe, expect, it } from 'vitest';
import { shotRhythm } from '@/lib/report/rhythm';
import { buildReportView } from '@/lib/report/viewModel';

const s = (idx: number, times: (number | null)[]) => ({
  id: `s${idx}`, idx, position: null, total: 30, total_decimal: 30, mpi_x: null, mpi_y: null, group_mm: null,
  shots: times.map((t, i) => ({ idx: i + 1, value: 10, inner: false, t_ms: t })),
});

describe('shotRhythm', () => {
  it('gives the seconds since the previous timed shot, with mean and spread inside series only', () => {
    const view = buildReportView([s(1, [0, 40_000, 90_000]), s(2, [400_000, 430_000])], 'air_rifle');
    const r = shotRhythm(view);
    expect(r.points.map((p) => [p.n, p.seconds, p.afterBreak])).toEqual([
      [2, 40, false],
      [3, 50, false],
      [4, 310, true],
      [5, 30, false],
    ]);
    expect(r.meanS).toBe(40);
    expect(r.sdS).toBeCloseTo(8.165, 2);
  });

  it('skips shots without a time and is empty with fewer than two', () => {
    const view = buildReportView([s(1, [0, null, 60_000])], 'air_rifle');
    expect(shotRhythm(view).points.map((p) => [p.n, p.seconds])).toEqual([[3, 60]]);
    expect(shotRhythm(buildReportView([s(1, [0])], 'air_rifle'))).toEqual({ points: [], meanS: null, sdS: null });
  });
});

import { rhythmOption } from '@/lib/report/charts';

describe('rhythmOption', () => {
  const view = buildReportView([s(1, [0, 40_000, 90_000]), s(2, [400_000, 430_000])], 'air_rifle');
  const opt = rhythmOption(shotRhythm(view), { series: null, shot: null });

  it('draws one bar per in-series gap and leaves the break between series out', () => {
    const bars = opt.series.find((x: { type: string }) => x.type === 'bar');
    expect(bars.data.map((d: { n: number }) => d.n)).toEqual([2, 3, 5]);
  });

  it('marks the mean gap', () => {
    const bars = opt.series.find((x: { type: string }) => x.type === 'bar');
    expect(bars.markLine.data[0].yAxis).toBe(40);
  });
});
