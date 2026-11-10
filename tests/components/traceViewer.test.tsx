// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceViewer } from '../../src/components/report/TraceViewer';
import { TargetPlot } from '../../src/components/report/TargetPlot';
import { buildReportView } from '../../src/lib/report/viewModel';
import { targetSpec } from '../../src/lib/report/target';
import { buildReplay } from '../../src/lib/scatt/replay';
import { SCATT_TARGETS } from '../../src/lib/scatt/targets';

afterEach(cleanup);
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});

const n = 1000;
const trace = {
  x: Float64Array.from({ length: n }, (_, i) => Math.sin(i / 50)),
  y: Float64Array.from({ length: n }, (_, i) => Math.cos(i / 70)),
  angle: Float64Array.from({ length: n }, () => (2 * Math.PI) / 180),
  trigger: null,
};
const replay = buildReplay(trace, 800, 100);

function viewer(onBack = () => {}) {
  return render(<TraceViewer replay={replay} spec={targetSpec('air_rifle')} target={SCATT_TARGETS.ar10} shotN={4} score="10.4" onBack={onBack} />);
}

describe('TraceViewer', () => {
  it('starts on the whole trace with the shot score, hold circle and tilt', () => {
    viewer();
    expect(screen.getByRole('img', { name: /Putanja · pogodak 4: 10.4/ })).toBeTruthy();
    expect(screen.getByText(/\+1\.00 s od pucnja/)).toBeTruthy();
    expect(screen.getByText('+2.0°')).toBeTruthy();
  });

  it('plays and pauses, and the scrubber moves the time', async () => {
    const user = userEvent.setup();
    viewer();
    await user.click(screen.getByRole('button', { name: /Pusti/ }));
    expect(screen.getByRole('button', { name: /Pauza/ })).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Položaj u putanji' }), { target: { value: String(replay.shot) } });
    expect(screen.getByRole('button', { name: /Pusti/ })).toBeTruthy();
    expect(screen.getByText(/0\.00 s od pucnja/)).toBeTruthy();
  });

  it('shows less after the shot when asked', async () => {
    const user = userEvent.setup();
    viewer();
    await user.click(screen.getByRole('radio', { name: '0,5 s' }));
    expect(screen.getByText(/\+0\.50 s od pucnja/)).toBeTruthy();
  });

  it('zooms ring by ring and fits again', async () => {
    const user = userEvent.setup();
    viewer();
    const ring = () => screen.getByText(/^do prstena \d+$/).textContent;
    const before = ring();
    await user.click(screen.getByRole('button', { name: 'Umanji' }));
    expect(ring()).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Prilagodi' }));
    expect(ring()).toBe(before);
    expect(screen.queryByRole('button', { name: 'Prilagodi' })).toBeNull();
  });

  it('goes back to the series', async () => {
    const user = userEvent.setup();
    const back = vi.fn();
    viewer(back);
    await user.click(screen.getByRole('button', { name: /Nazad na seriju/ }));
    expect(back).toHaveBeenCalledOnce();
  });
});

describe('TargetPlot zoom', () => {
  const view = buildReportView(
    [{ id: 'a', idx: 1, position: null, total: 104, total_decimal: 104.5, mpi_x: -0.5, mpi_y: -0.4, group_mm: 8, shots: [] }],
    'air_rifle',
  );

  it('steps out a ring and back to the fitted view', async () => {
    const user = userEvent.setup();
    const { container } = render(<TargetPlot discipline="air_rifle" series={view.series} selected={1} />);
    const vb = () => container.querySelector('svg')!.getAttribute('viewBox');
    const fitted = vb();
    await user.click(screen.getByRole('button', { name: 'Umanji' }));
    expect(vb()).not.toBe(fitted);
    await user.click(screen.getByRole('button', { name: 'Prilagodi' }));
    expect(vb()).toBe(fitted);
  });

  it('opens a shot from its hole', async () => {
    const user = userEvent.setup();
    const pick = vi.fn();
    const { container } = render(
      <TargetPlot discipline="air_rifle" series={view.series} selected={1} holes={[{ n: 3, x: 1, y: 1, selected: false }]} onPickShot={pick} />,
    );
    await user.click(container.querySelector('[data-shot="3"]')!);
    expect(pick).toHaveBeenCalledWith(3);
  });
});
