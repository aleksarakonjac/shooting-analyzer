import { describe, expect, it } from 'vitest';
import { boardRows } from '@/lib/report/sighters';
import { buildReportView } from '@/lib/report/viewModel';

const s = (idx: number) => ({ idx });

describe('boardRows', () => {
  it('air: one Proba row before series 1', () => {
    expect(boardRows([1, 2, 3, 4, 5, 6].map(s), [{ beforeSeries: 1 }])).toEqual([
      { kind: 'sighters', group: 0 },
      ...[1, 2, 3, 4, 5, 6].map((idx) => ({ kind: 'series', idx })),
    ]);
  });
  it('3x20: a Proba row before each position', () => {
    const rows = boardRows([1, 2, 3, 4, 5, 6].map(s), [{ beforeSeries: 1 }, { beforeSeries: 3 }, { beforeSeries: 5 }]);
    expect(rows.map((r) => (r.kind === 'series' ? `s${r.idx}` : `p${r.group}`))).toEqual(['p0', 's1', 's2', 'p1', 's3', 's4', 'p2', 's5', 's6']);
  });
  it('no sighters → series only; sighters-only exercise → one Proba row', () => {
    expect(boardRows([s(1)], [])).toEqual([{ kind: 'series', idx: 1 }]);
    expect(boardRows([], [{ beforeSeries: 1 }])).toEqual([{ kind: 'sighters', group: 0 }]);
  });
  it('a group whose series does not exist goes at the end', () => {
    expect(boardRows([s(1)], [{ beforeSeries: 4 }])).toEqual([{ kind: 'series', idx: 1 }, { kind: 'sighters', group: 0 }]);
  });
});

describe('buildReportView with decimals and sighters', () => {
  const raw = [{ id: 'a', idx: 1, position: 'kneeling' as const, total: 20, total_decimal: 20.9, mpi_x: null, mpi_y: null, group_mm: null, shots: [
    { idx: 1, value: 10, value_decimal: 10.6, inner: true, t_ms: 1000 },
    { idx: 2, value: 10, value_decimal: '10.3', inner: false, t_ms: 2000 },
  ] }];
  const sighters = [{ before_series: 1, position: 'kneeling' as const, idx: 1, value: '9', value_decimal: '9.4', inner: false, t_ms: 500 }];

  it('carries the decimal next to whole values, totals use the whole values', () => {
    const v = buildReportView(raw, 'smallbore_3p', undefined, sighters);
    expect(v.series[0].shots.map((x) => [x.value, x.valueDecimal])).toEqual([[10, 10.6], [10, 10.3]]);
    expect(v.total).toBe(20);
    expect(v.shotCount).toBe(2);
  });
  it('groups sighters by the series they precede, outside totals and shot numbers', () => {
    const v = buildReportView(raw, 'smallbore_3p', undefined, sighters);
    expect(v.sighters).toEqual([{ beforeSeries: 1, position: 'kneeling', shots: [{ idx: 1, value: 9, valueDecimal: 9.4, inner: false, tMs: 500 }] }]);
    expect(v.series[0].shots[0].n).toBe(1);
  });
  it('without sighters the view has none', () => {
    expect(buildReportView(raw, 'smallbore_3p').sighters).toEqual([]);
  });
});
