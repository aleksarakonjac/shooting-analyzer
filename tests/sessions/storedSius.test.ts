import { describe, expect, it } from 'vitest';
import { siusFromStored } from '@/lib/sessions/storedSius';

describe('siusFromStored', () => {
  it('rebuilds the result from stored series and shots, in order, with decimal totals', () => {
    const r = siusFromStored(
      [
        { idx: 2, position: null, total: 103, total_decimal: '103.4', mpi_x: null, mpi_y: null, group_mm: null,
          shots: [{ idx: 2, value: '10.1', inner: false, direction: null, x: null, y: null }, { idx: 1, value: 9.9, inner: false, direction: null, x: null, y: null }] },
        { idx: 1, position: null, total: 104, total_decimal: 104.5, mpi_x: '0.2', mpi_y: -0.1, group_mm: 8, shots: [] },
      ],
      'air_rifle',
    );
    expect(r.disciplineId).toBe('air_rifle');
    expect(r.series.map((s) => s.index)).toEqual([1, 2]);
    expect(r.series[0]).toMatchObject({ total: 104.5, totalDecimal: 104.5, mpi: { x: 0.2, y: -0.1 }, groupMm: 8, shots: [] });
    expect(r.series[1].shots.map((s) => s.value)).toEqual([9.9, 10.1]);
    expect(r.totalDecimal).toBe(207.9);
  });

  it('uses whole-ring totals for whole-ring disciplines', () => {
    const r = siusFromStored([{ idx: 1, position: 'kneeling', total: 95, total_decimal: null, mpi_x: null, mpi_y: null, group_mm: null, shots: [] }], 'smallbore_3p');
    expect(r.series[0]).toMatchObject({ total: 95, position: 'kneeling' });
    expect(r.total).toBe(95);
  });
});
