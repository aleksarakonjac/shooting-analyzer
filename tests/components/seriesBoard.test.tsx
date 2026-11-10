// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeriesBoard } from '../../src/components/report/SeriesBoard';
import { buildReportView } from '../../src/lib/report/viewModel';

const shots = (base: number) => Array.from({ length: 3 }, (_, i) => ({ idx: i + 1, value: base + i / 10, inner: false, t_ms: null }));
const view = buildReportView(
  [
    { id: 'a', idx: 1, position: null, total: 31, total_decimal: 30.3, mpi_x: null, mpi_y: null, group_mm: null, shots: shots(10) },
    { id: 'b', idx: 2, position: null, total: 30, total_decimal: 29.3, mpi_x: null, mpi_y: null, group_mm: null, shots: shots(9.7) },
  ],
  'air_rifle',
);

describe('SeriesBoard', () => {
  it('shows every series with its shots, or only the selected one when collapsed', () => {
    const { rerender } = render(<SeriesBoard view={view} selection={{ series: null, shot: null }} onSelect={() => {}} tz="Europe/Belgrade" />);
    expect(screen.getAllByRole('table')).toHaveLength(2);
    rerender(<SeriesBoard expanded={false} view={view} selection={{ series: null, shot: null }} onSelect={() => {}} tz="Europe/Belgrade" />);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    rerender(<SeriesBoard expanded={false} view={view} selection={{ series: 2, shot: null }} onSelect={() => {}} tz="Europe/Belgrade" />);
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });
});
