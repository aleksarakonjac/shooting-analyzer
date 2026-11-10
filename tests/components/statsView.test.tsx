// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StatsView } from '../../src/components/StatsView';
import { parseFilters } from '../../src/lib/stats/filters';
import type { TrainingSummary } from '../../src/lib/stats/periodStats';

const now = new Date('2026-11-10T09:00:00Z');
const tr = (id: string, trainedOn: string, dec: number, group: number): TrainingSummary => ({
  id, name: `Sesija ${id}`, trainedOn, discipline: 'air_rifle', hrAvg: null,
  matches: [{ alignState: 'confirmed', series: [{ idx: 1, total: Math.floor(dec), totalDecimal: dec, groupMm: group, shotCount: 10 }] }],
});
const view = (all: TrainingSummary[], chosen: string[] = []) =>
  render(<StatsView all={all} chosen={chosen} filters={parseFilters({}, now, 'Europe/Belgrade')} base="/statistika" choices={{ places: [], events: [], years: ['2026'] }} />);

afterEach(cleanup);

describe('StatsView', () => {
  const two = [tr('a', '2026-11-09', 104, 8), tr('b', '2026-11-02', 106, 7)];

  it('opens as a list with one row per session and its figures', () => {
    view(two);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('Sesija a');
    expect(rows[1].textContent).toContain('104.5'.replace('.5', '.0'));
    expect(screen.getByRole('button', { name: 'Poredi' }).hasAttribute('disabled')).toBe(true);
  });

  it('compares the ticked sessions as columns with the best marked and a delta to the base', () => {
    view(two);
    fireEvent.click(screen.getByRole('checkbox', { name: /Sesija a/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Sesija b/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Poredi (2)' }));
    const table = screen.getAllByRole('table')[0];
    expect(within(table).getByRole('link', { name: '9. 11.' }).getAttribute('href')).toBe('/trening/a');
    expect(Array.from(table.querySelectorAll('td[data-best]')).map((c) => c.textContent)).toEqual(['106.0+2.0', '106.0+2.0', '7.0−1.0']);
    fireEvent.click(screen.getByRole('button', { name: 'Sve sesije' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('blocks sessions of another discipline once one is ticked', () => {
    view([tr('a', '2026-11-09', 104, 8), { ...tr('b', '2026-11-02', 106, 7), discipline: 'smallbore_3p' }]);
    fireEvent.click(screen.getByRole('checkbox', { name: /Sesija a/ }));
    expect(screen.getByRole('checkbox', { name: /Sesija b/ }).hasAttribute('disabled')).toBe(true);
  });

  it('says so when there are no sessions', () => {
    view([]);
    expect(screen.getByText(/Nema sesija/)).toBeTruthy();
  });

  it('opens the comparison straight away for sessions named in the URL', () => {
    view([...two, tr('c', '2026-10-02', 105, 9)], ['b', 'c']);
    expect(screen.queryByRole('link', { name: '9. 11.' })).toBeNull();
    expect(screen.getByRole('link', { name: '2. 11.' })).toBeTruthy();
  });
});
