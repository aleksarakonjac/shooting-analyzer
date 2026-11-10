import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TargetNotes, TargetPlot } from '../../src/components/report/TargetPlot';
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
    const out = html(<TargetNotes series={view.series} selected={1} />) + html(<TargetPlot discipline="air_rifle" series={view.series} selected={1} />);
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

  it('draws shot holes at their positions at the pellet size when positions are known', () => {
    const holes = [
      { n: 1, x: 0.5, y: -1, selected: false },
      { n: 2, x: -2, y: 1, selected: true },
    ];
    const out = html(<TargetPlot discipline="air_rifle" series={view.series} selected={1} holes={holes} caliberMm={4.5} />);
    expect(out.match(/class="target__hole[ "]/g)).toHaveLength(2);
    expect(out).toContain('r="2.25"');
    expect(out).toContain('target__hole--sel');
  });

  it('asks for a series when none is selected', () => {
    expect(html(<TargetNotes series={view.series} selected={null} />)).toContain('Izaberite seriju');
  });
});

describe('TargetPlot drift view', () => {
  const view = buildReportView(
    [
      { id: 'a', idx: 1, position: null, total: 104, total_decimal: 104.5, mpi_x: -0.5, mpi_y: -0.4, group_mm: 8, shots: [] },
      { id: 'b', idx: 2, position: null, total: 103, total_decimal: 103.1, mpi_x: 1.2, mpi_y: 0.3, group_mm: 9, shots: [] },
    ],
    'air_rifle',
  );

  it('magnifies the series MPIs on their own scale, each numbered, with the scale stated', () => {
    const out = html(<TargetNotes series={view.series} selected={1} />);
    expect(out).toContain('target__drift');
    expect(out.match(/data-drift=/g)).toHaveLength(2);
    expect(out).toContain('±1.5 mm'); // 1.2 mm * 1.25, rounded up to half a millimetre
  });
});
