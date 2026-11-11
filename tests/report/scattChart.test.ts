import { describe, expect, it } from 'vitest';
import { scattMetricOption } from '@/lib/report/charts';
import { buildReportView } from '@/lib/report/viewModel';
import type { ShotAnalysis } from '@/lib/scatt/analysis';

const view = buildReportView(
  [{ id: 'a', idx: 1, position: null, total: 30, total_decimal: 30.6, mpi_x: null, mpi_y: null, group_mm: null,
    shots: [1, 2, 3].map((i) => ({ idx: i, value: 10.2, inner: false, t_ms: i * 1000, scatt_shot_id: i === 2 ? null : 100 + i })) }],
  'air_rifle',
);
const a = (id: number, speed250: number, hold10Abs: number): ShotAnalysis => ({
  shotId: id, traceId: 1, match: true, missed: false, x: 0, y: 0, score: 10, aimingMs: 5000, shotMs: 0,
  metrics: { speed: 9, speedX: 5, speedY: 5, speed250, aapX: 0, aapY: 0, boxW: 1, boxH: 1, holdCircleD: 2, hold10Abs, hold10Rel: 90, hold9Abs: 100, hold9Rel: 100, hold8Abs: 100, hold8Rel: 100, breachFromAap: 0.3 },
});
const byShot = new Map([[101, a(101, 8.5, 92)], [103, a(103, 12, 70)]]);

describe('scattMetricOption', () => {
  it('draws one bar per shot that has SCATT metrics, by shot number', () => {
    const o = scattMetricOption(view, byShot, 'speed250', { series: null, shot: null });
    expect(o.xAxis.data).toEqual(['1', '3']);
    expect(o.series[0].data.map((d: { value: [string, number] }) => d.value[1])).toEqual([8.5, 12]);
  });

  it('caps the hold share at 100 %', () => {
    const o = scattMetricOption(view, byShot, 'hold10Abs', { series: null, shot: null });
    expect(o.yAxis.max).toBe(100);
  });
});

import { coordinationOption, shotSpeedOption, type TracePick } from '@/lib/report/charts';
import type { Replay } from '@/lib/scatt/replay';
import { SCATT_TARGETS } from '@/lib/scatt/targets';

describe('over-time charts for several shots', () => {
  // Two shots with different amounts of trace before and after the shot.
  const replay = (before: number, after: number): Replay => ({
    rate: 100,
    x: Array.from({ length: before + after + 1 }, (_, i) => i * 0.01),
    y: Array.from({ length: before + after + 1 }, () => 0.2),
    angle: null,
    shot: before,
    segments: [],
    hold: { x: 0, y: 0, r: 1 },
  });
  const picks: TracePick[] = [
    { r: replay(300, 150), n: 1, selected: false },
    { r: replay(80, 40), n: 2, selected: true },
  ];

  it('aligns shots of different lengths on one time grid without failing', () => {
    const o = coordinationOption(picks, SCATT_TARGETS.ar10, 5, 1);
    expect(o.series).toHaveLength(1); // the mean over the shots, not one line per shot
    expect(o.series[0].name).toBe('Prosek');
    const s = shotSpeedOption(picks, 5, 1);
    // Only the time the recordings really cover is drawn: 3 s before (the longer shot has 3 s, the other 0.8 s) up to the 1 s asked for after.
    expect(s.xAxis.min).toBeCloseTo(-3, 1);
    expect(s.xAxis.max).toBe(1);
  });
});
