// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const sel0 = { series: null, shot: null };
const props = { view, selection: sel0, onSelect: () => {}, onToggle: () => {}, tz: 'Europe/Belgrade' };
const open = (ids: number[]) => new Set(ids);
const tables = () => screen.queryAllByRole('table');

describe('SeriesBoard', () => {
  it('opens exactly the series it is given, and keeps the closed ones out of the accessibility tree', () => {
    // jsdom has no scrollIntoView, which the board calls for the selected shot.
    Element.prototype.scrollIntoView = () => {};
    const { rerender } = render(<SeriesBoard {...props} openIds={open([1, 2])} />);
    expect(tables()).toHaveLength(2);
    rerender(<SeriesBoard {...props} openIds={open([])} />);
    expect(tables()).toHaveLength(0);
    rerender(<SeriesBoard {...props} openIds={open([2])} />);
    expect(tables()).toHaveLength(1);
    // Closed panels stay mounted (so they can animate) but inert.
    expect(document.querySelectorAll('.board__panel[data-open]')).toHaveLength(1);
    expect(document.querySelectorAll('.board__panel[inert]')).toHaveLength(1);
  });

  it('keeps the selection marked while every series is closed', () => {
    cleanup();
    render(<SeriesBoard {...props} selection={{ series: 2, shot: 5 }} openIds={open([])} />);
    expect(tables()).toHaveLength(0);
    expect(document.querySelector('.board__row[aria-current="true"]')).not.toBeNull();
  });

  it('reports which series row was pressed', () => {
    cleanup();
    const pressed: number[] = [];
    render(<SeriesBoard {...props} onToggle={(i) => pressed.push(i)} openIds={open([1, 2])} />);
    fireEvent.click(document.querySelectorAll('.board__row')[1]);
    expect(pressed).toEqual([2]);
  });

  it('shows how long a series took: from the previous series\' last shot to its own last shot', () => {
    cleanup();
    const timed = (idx: number, ts: number[]) => ({
      id: `t${idx}`, idx, position: null, total: 30, total_decimal: 30, mpi_x: null, mpi_y: null, group_mm: null,
      shots: ts.map((t, i) => ({ idx: i + 1, value: 10, inner: false, t_ms: t })),
    });
    const v = buildReportView([timed(1, [0, 30_000, 60_000]), timed(2, [100_000, 150_000, 200_000]), timed(3, [])], 'air_rifle');
    render(<SeriesBoard {...props} view={v} openIds={open([])} />);
    const durs = [...document.querySelectorAll('.board__dur')].map((e) => e.textContent);
    // Series 1 has nothing before it, so first to last shot (60 s); series 2 ends 140 s after series 1's last shot; series 3 has no times.
    expect(durs).toEqual(['1:00', '2:20']);
  });

  it('times the first series from the SCATT match start when there is one', () => {
    cleanup();
    const sh = (idx: number, t: number, scatt_shot_id: number) => ({ idx, value: 10, inner: false, t_ms: t, scatt_shot_id });
    const v = buildReportView(
      [{ id: 'a', idx: 1, position: null, total: 30, total_decimal: 30, mpi_x: null, mpi_y: null, group_mm: null, shots: [sh(1, 1_100_000, 1), sh(2, 1_160_000, 2)] }],
      'air_rifle',
    );
    const scatt = new Map([[1, { shotMs: 1_100_000 }], [2, { shotMs: 1_160_000 }]]) as never;
    render(<SeriesBoard {...props} view={v} scatt={scatt} matchStartMs={1_000_000} openIds={open([])} />);
    // Match start to the last shot: 160 s.
    expect([...document.querySelectorAll('.board__dur')].map((e) => e.textContent)).toEqual(['2:40']);
  });
});
