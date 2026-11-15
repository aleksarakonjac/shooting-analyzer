// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const charts: unknown[] = [];
vi.mock('../../src/components/report/EChart', () => ({
  EChart: ({ option }: { option: unknown }) => {
    charts.push(option);
    return <div data-testid="chart" />;
  },
}));

import { HrAroundToggle, HrPanel } from '../../src/components/report/HrPanel';
import { buildReportView, type RawSeries } from '../../src/lib/report/viewModel';

afterEach(() => {
  cleanup();
  charts.length = 0;
});

const raw: RawSeries[] = [{ idx: 1, position: null, shots: [{ idx: 1, value: 10, inner: false, direction: null, x: 0, y: 0, tMs: 2000 }] }] as unknown as RawSeries[];
const view = buildReportView(raw, 'air_rifle');
const match = [{ tMs: 1000, bpm: 70 }, { tMs: 3000, bpm: 72 }];
const full = [{ tMs: -1_200_000, bpm: 90 }, ...match, { tMs: 1_300_000, bpm: 65 }];
const props = { hasFile: true, view, selection: { series: null, shot: null }, onSelect: () => {}, tz: 'Europe/Belgrade', group: 'g' };

describe('HrPanel before and after the match', () => {
  it('draws the match only, or the whole file when switched to before and after', () => {
    const hr = { status: 'ready' as const, samples: match, full, fullAvailable: true, match: { fromMs: 1000, toMs: 3000 } };
    const { rerender } = render(<HrPanel {...props} hr={hr} around={false} />);
    expect((charts.at(-1) as { series: { data: unknown[] }[] }).series[0].data).toHaveLength(2);
    rerender(<HrPanel {...props} hr={hr} around />);
    const wide = charts.at(-1) as { series: { data: unknown[]; markArea?: unknown }[] };
    expect(wide.series[0].data).toHaveLength(4);
    expect(wide.series[0].markArea).toBeDefined();
  });

  it('the switch itself is no longer a large button in the panel body', () => {
    render(<HrPanel {...props} hr={{ status: 'ready', samples: match, full, fullAvailable: true, match: { fromMs: 1000, toMs: 3000 } }} around={false} />);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('HrAroundToggle', () => {
  it('is a small switch with a short label and the full name', () => {
    let on = false;
    const { rerender } = render(<HrAroundToggle on={on} onToggle={() => (on = !on)} />);
    const sw = screen.getByRole('switch', { name: 'Pre i posle meča' });
    expect(sw.textContent).toBe('Pre/posle');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    rerender(<HrAroundToggle on={on} onToggle={() => (on = !on)} />);
    expect(screen.getByRole('switch', { name: 'Pre i posle meča' }).getAttribute('aria-checked')).toBe('true');
  });
});
