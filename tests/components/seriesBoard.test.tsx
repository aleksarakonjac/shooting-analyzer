// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('opens every series into its shots with one control, and closes them again', async () => {
    const user = userEvent.setup();
    render(<SeriesBoard view={view} selection={{ series: null, shot: null }} onSelect={() => {}} tz="Europe/Belgrade" />);
    expect(screen.queryAllByRole('table')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Prikaži sve pogotke' }));
    expect(screen.getAllByRole('table')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Sakrij pogotke' }));
    expect(screen.queryAllByRole('table')).toHaveLength(0);
  });
});
