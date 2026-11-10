// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// The canvas chart is not under test here.
vi.mock('../../src/components/report/EChart', () => ({ EChart: () => null }));
import { render, screen, within } from '@testing-library/react';
import { SessionsView } from '../../src/components/ShooterDashboard';
import { parseFilters } from '../../src/lib/stats/filters';
import type { TrainingSummary } from '../../src/lib/stats/periodStats';

const now = new Date('2026-11-10T09:00:00Z');
const tr = (id: string, trainedOn: string, over: Partial<TrainingSummary> = {}): TrainingSummary => ({
  id, name: `Sesija ${id}`, trainedOn, discipline: 'air_rifle', looseShots: 0, hrAvg: null,
  matches: [{ alignState: 'confirmed', series: [{ idx: 1, total: 104, totalDecimal: 104.5, groupMm: 8, shotCount: 10 }] }],
  ...over,
});
const view = (all: TrainingSummary[], search = {}) =>
  render(
    <SessionsView all={all} filters={parseFilters(search, now, 'Europe/Belgrade')} title="Moje sesije" base="/" newHref="/trening/novi" choices={{ places: [], events: [] }} />,
  );

describe('SessionsView', () => {
  it('leads each row with the weekday and date, then the name, the type and part, and the total', () => {
    view([tr('a', '2026-11-09', { kind: 'takmicenje', stage: 'finale', place: 'Beograd' })]);
    const row = screen.getByRole('link', { name: /Sesija a/ });
    expect(within(row).getByText('pon')).toBeTruthy();
    expect(within(row).getByText('9. 11.')).toBeTruthy();
    expect(row.textContent).toContain('Takmičenje, Finale');
    expect(row.textContent).toContain('Beograd');
    expect(row.textContent).toContain('104.5');
  });

  it('says there are no sessions yet, or none for the filters', () => {
    const a = view([]);
    expect(screen.getByText('Još nema sesija.')).toBeTruthy();
    a.unmount();
    view([], { v: 'takmicenje' });
    expect(screen.getByText('Nema sesija za izabrane filtere.')).toBeTruthy();
  });
});
