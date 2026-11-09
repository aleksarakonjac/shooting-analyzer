import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetPlot } from '../../src/components/report/TargetPlot';
import { buildReportView } from '../../src/lib/report/viewModel';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('TargetPlot', () => {
  const view = buildReportView(
    [
      { id: 'a', idx: 1, position: null, total: 104, total_decimal: 104.5, mpi_x: -0.5, mpi_y: -0.4, group_mm: 8, shots: [] },
      { id: 'b', idx: 2, position: null, total: 103, total_decimal: 103.1, mpi_x: 1, mpi_y: 0, group_mm: 9, shots: [] },
    ],
    'air_rifle',
  );

  it('states the group and the MPI direction in words, not only by drawing', () => {
    const out = html(<TargetPlot discipline="air_rifle" series={view.series} selected={1} />);
    expect(out).toContain('8.0 mm');
    expect(out).toContain('0.5 mm levo');
    expect(out).toContain('0.4 mm dole');
    expect(out).toContain('role="img"');
  });

  it('draws the selected group and the other series as faint MPI dots, with no invented shot holes', () => {
    const out = html(<TargetPlot discipline="air_rifle" series={view.series} selected={1} />);
    expect(out.match(/target__group/g)).toHaveLength(1);
    expect(out.match(/target__mpi-other/g)).toHaveLength(1);
    expect(out).not.toContain('target__hole');
  });

  it('asks for a series when none is selected', () => {
    expect(html(<TargetPlot discipline="air_rifle" series={view.series} selected={null} />)).toContain('Izaberite seriju');
  });
});

import { TrendChart } from '../../src/components/TrendChart';

describe('TrendChart', () => {
  const buckets = [
    { label: 'pon', value: 100.5 },
    { label: 'uto', value: null },
    { label: 'sre', value: 102 },
  ];
  it('draws a marker only for buckets with data and labels the axis', () => {
    const out = html(<TrendChart title="Prosek serije" buckets={buckets} />);
    expect(out.match(/data-point=/g)).toHaveLength(2);
    expect(out).toContain('pon');
    expect(out).toContain('Prosek serije');
    expect(out).toContain('role="img"');
  });
  it('is an empty state when no bucket has data', () => {
    const out = html(<TrendChart title="Prosek serije" buckets={[{ label: 'pon', value: null }]} />);
    expect(out).toContain('Nema podataka za ovaj period.');
    expect(out).not.toContain('data-point');
  });
});
