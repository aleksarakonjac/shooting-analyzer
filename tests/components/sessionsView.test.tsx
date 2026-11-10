// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// The canvas chart is not under test here.
vi.mock('../../src/components/report/EChart', () => ({ EChart: () => null }));
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SessionsView } from '../../src/components/ShooterDashboard';
import { parseFilters } from '../../src/lib/stats/filters';
import type { TrainingSummary } from '../../src/lib/stats/periodStats';

const now = new Date('2026-11-10T09:00:00Z');
const tr = (id: string, trainedOn: string, over: Partial<TrainingSummary> = {}): TrainingSummary => ({
  id, name: `Sesija ${id}`, trainedOn, discipline: 'air_rifle', hrAvg: null,
  matches: [{ alignState: 'confirmed', series: [{ idx: 1, total: 104, totalDecimal: 104.5, groupMm: 8, shotCount: 10 }] }],
  ...over,
});
const view = (all: TrainingSummary[], search = {}) =>
  render(
    <SessionsView all={all} filters={parseFilters(search, now, 'Europe/Belgrade')} title="Moje sesije" base="/" newHref="/trening/novi" choices={{ places: [], events: [], years: ['2026'] }} />,
  );

afterEach(cleanup);

describe('SessionsView', () => {
  it('leads each row with the weekday and date, then the name, the type and part, and the total', () => {
    view([tr('a', '2026-11-09', { kind: 'takmicenje', stage: 'finale', place: 'Beograd' })]);
    const row = screen.getByRole('link', { name: /Sesija a/ });
    expect(within(row).getByText('pon')).toBeTruthy();
    expect(within(row).getByText('9. 11.')).toBeTruthy();
    for (const tag of ['Vazdušna puška', 'Takmičenje', 'Finale']) expect(within(row).getByText(tag)).toBeTruthy();
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

  it('shows the place but no shot count, group or pulse in the row', () => {
    view([tr('a', '2026-11-09', { place: 'Beograd', hrAvg: 92.4 })]);
    const row = screen.getByRole('link', { name: /Sesija a/ });
    expect(row.textContent).toContain('Beograd');
    expect(row.textContent).not.toContain('8.0');
    expect(row.textContent).not.toContain('92');
  });

  it('groups the list by month and drops the pulse note from the figures', () => {
    view([tr('a', '2026-11-09'), tr('b', '2026-10-30'), tr('c', '2026-10-02')]);
    expect(document.querySelectorAll('.srows__month')).toHaveLength(2);
    expect(screen.getByText('Novembar 2026.')).toBeTruthy();
    expect(screen.getByText('Oktobar 2026.')).toBeTruthy();
    expect(screen.queryByText(/potvrđena poravnanja/)).toBeNull();
  });

  it('lists one page of a long period and offers the next', () => {
    const many = Array.from({ length: 45 }, (_, i) => tr(String(i), `2026-11-${String((i % 9) + 1).padStart(2, '0')}`));
    view(many, { y: '2026' });
    expect(document.querySelectorAll('.srows > li:not(.srows__month)')).toHaveLength(30);
    expect(screen.getByText('30 od 45')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Prikaži još 15' }).getAttribute('href')).toBe('/?y=2026&n=60');
  });

  it('offers older sessions when the recent view has more than one page', () => {
    const many = Array.from({ length: 31 }, (_, i) => tr(String(i), '2026-11-01'));
    view(many);
    expect(document.querySelectorAll('.srows > li:not(.srows__month)')).toHaveLength(30);
    expect(screen.getByRole('link', { name: 'Prikaži starije' }).getAttribute('href')).toBe('/?n=60');
  });

  it('keeps the side panel shut until opened, and toggles it on the client without navigating', () => {
    view([tr('a', '2026-11-09')]);
    const side = () => document.querySelector('[data-panel="side"]');
    expect(side()?.hasAttribute('data-closed')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži brojke i grafik' }));
    expect(side()?.hasAttribute('data-closed')).toBe(false);
    expect(window.location.search).toBe('?s=1');
    fireEvent.click(screen.getByRole('button', { name: 'Sakrij brojke i grafik' }));
    expect(side()?.hasAttribute('data-closed')).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('opens already when the address says so', () => {
    view([tr('a', '2026-11-09')], { s: '1' });
    expect(document.querySelector('[data-panel="side"]')?.hasAttribute('data-closed')).toBe(false);
  });
});
