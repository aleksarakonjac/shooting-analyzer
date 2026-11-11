// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceViewer } from '../../src/components/report/TraceViewer';
import { ReplaySettingsProvider, ReplaySettingsSection } from '../../src/components/report/replaySettings';
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
    expect(screen.getByRole('slider', { name: 'Položaj u putanji' }).getAttribute('aria-valuetext')).toMatch(/^1\.00 s od pucnja/);
    expect(screen.getByText('+2.0°')).toBeTruthy();
  });

  it('plays and pauses, and the scrubber moves the time', async () => {
    const user = userEvent.setup();
    viewer();
    await user.click(screen.getByRole('button', { name: /Pusti/ }));
    expect(screen.getByRole('button', { name: /Pauza/ })).toBeTruthy();
    fireEvent.change(screen.getByRole('slider', { name: 'Položaj u putanji' }), { target: { value: String(replay.shot) } });
    expect(screen.getByRole('button', { name: /Pusti/ })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Položaj u putanji' }).getAttribute('aria-valuetext')).toMatch(/0\.00 s od pucnja/);
  });

  it('shows less after the shot when asked', async () => {
    render(
      <ReplaySettingsProvider>
        <ReplaySettingsSection />
        <TraceViewer replay={replay} spec={targetSpec('air_rifle')} target={SCATT_TARGETS.ar10} shotN={4} score="10.4" onBack={() => {}} />
      </ReplaySettingsProvider>,
    );
    fireEvent.change(screen.getByLabelText('Posle pucnja'), { target: { value: '0.5' } });
    expect(screen.getByRole('slider', { name: 'Položaj u putanji' }).getAttribute('aria-valuetext')).toMatch(/^0\.50 s od pucnja/);
  });

  it('zooms smoothly with the wheel and fits again', async () => {
    const user = userEvent.setup();
    viewer();
    const ring = () => screen.getByRole('status').getAttribute('aria-label');
    const before = ring();
    fireEvent.wheel(screen.getByRole('img', { name: /hold|zadržavanja/i }), { deltaY: 400 });
    expect(ring()).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(ring()).toBe(before);
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('goes back to the series', async () => {
    const user = userEvent.setup();
    const back = vi.fn();
    viewer(back);
    await user.click(screen.getByRole('button', { name: /Nazad/ }));
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
    fireEvent.wheel(container.querySelector('svg')!, { deltaY: 400 });
    expect(vb()).not.toBe(fitted);
    await user.click(screen.getByRole('button', { name: 'Reset' }));
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
