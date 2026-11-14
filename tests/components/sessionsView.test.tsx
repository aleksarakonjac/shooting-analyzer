// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
beforeEach(() => window.sessionStorage.clear());

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
    expect(document.querySelectorAll('.smonth')).toHaveLength(2);
    expect(screen.getByText('Novembar 2026.')).toBeTruthy();
    expect(screen.getByText('Oktobar 2026.')).toBeTruthy();
    expect(screen.queryByText(/potvrđena poravnanja/)).toBeNull();
  });

  it('gives every month its own column headings and a session count', () => {
    view([tr('a', '2026-11-09'), tr('b', '2026-10-30'), tr('c', '2026-10-02')]);
    const months = Array.from(document.querySelectorAll('.smonth'));
    for (const m of months) expect(within(m as HTMLElement).getByRole('button', { name: 'Rezultat' })).toBeTruthy();
    expect(within(months[0] as HTMLElement).getByText('1 sesija')).toBeTruthy();
    expect(within(months[1] as HTMLElement).getByText('2 sesije')).toBeTruthy();
  });

  it('folds a month away and brings it back', () => {
    view([tr('a', '2026-11-09'), tr('b', '2026-10-30')]);
    const oct = screen.getByRole('button', { name: /Oktobar 2026/ });
    const body = () => document.getElementById(oct.getAttribute('aria-controls')!)!;
    expect(oct.getAttribute('aria-expanded')).toBe('true');
    expect(body().getAttribute('data-open')).toBe('true');
    fireEvent.click(oct);
    // The rows stay in the page while the fold plays; the body is inert and flagged closed.
    expect(oct.getAttribute('aria-expanded')).toBe('false');
    expect(body().getAttribute('data-open')).toBe('false');
    expect(body().hasAttribute('inert')).toBe(true);
    expect(body().hasAttribute('data-moving')).toBe(true);
    const nov = screen.getByRole('button', { name: /Novembar 2026/ });
    expect(document.getElementById(nov.getAttribute('aria-controls')!)!.hasAttribute('inert')).toBe(false);
    fireEvent.click(oct);
    expect(body().getAttribute('data-open')).toBe('true');
    expect(body().hasAttribute('inert')).toBe(false);
  });

  it('sorts the rows inside every month by the clicked column, and flips on a second click', () => {
    const rows = (month: number) => Array.from(document.querySelectorAll('.smonth')[month].querySelectorAll('.srow__title')).map((e) => e.textContent);
    const mk = (id: string, day: string, total: number) => tr(id, day, { matches: [{ alignState: 'confirmed', series: [{ idx: 1, total, totalDecimal: total, groupMm: 8, shotCount: 10 }] }] });
    view([mk('a', '2026-11-09', 90), mk('b', '2026-11-08', 99), mk('c', '2026-10-05', 80), mk('d', '2026-10-04', 95)]);
    expect(rows(0)).toEqual(['Sesija a', 'Sesija b']);
    fireEvent.click(within(document.querySelectorAll('.smonth')[0] as HTMLElement).getByRole('button', { name: 'Rezultat' }));
    expect(rows(0)).toEqual(['Sesija b', 'Sesija a']);
    expect(rows(1)).toEqual(['Sesija d', 'Sesija c']);
    fireEvent.click(within(document.querySelectorAll('.smonth')[0] as HTMLElement).getByRole('button', { name: /Rezultat/ }));
    expect(rows(0)).toEqual(['Sesija a', 'Sesija b']);
  });

  it('marks missing SCATT and pulse beside the session name, and only asks to confirm a paired alignment', () => {
    view([
      tr('a', '2026-11-09'),
      tr('b', '2026-11-08', { hrAvg: 90, matches: [{ alignState: 'proposed', paired: true, series: [{ idx: 1, total: 100, totalDecimal: 100, groupMm: 8, shotCount: 10 }] }] }),
    ]);
    const a = screen.getByRole('link', { name: /Sesija a/ });
    expect(within(a.querySelector('.srow__name') as HTMLElement).getByText('Bez SCATT-a')).toBeTruthy();
    expect(within(a.querySelector('.srow__name') as HTMLElement).getByText('Bez pulsa')).toBeTruthy();
    expect(within(a).queryByText('Potvrdi spoj')).toBeNull();
    const b = screen.getByRole('link', { name: /Sesija b/ });
    expect(within(b).getByText('Potvrdi spoj')).toBeTruthy();
    expect(within(b).queryByText('Bez SCATT-a')).toBeNull();
    expect(within(b).queryByText('Bez pulsa')).toBeNull();
  });

  it('remembers its address, sort and folded months for a report to close back to', () => {
    view([tr('a', '2026-11-09'), tr('b', '2026-10-30')], { y: '2026', sc: '0' });
    expect(window.sessionStorage.getItem('sessions:list-url')).toBe('/?y=2026&sc=0');
    fireEvent.click(screen.getByRole('button', { name: /Oktobar 2026/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Rezultat' })[0]);
    expect(JSON.parse(window.sessionStorage.getItem('sessions:list-view')!)).toEqual({ sort: { key: 'total', dir: 'desc' }, folded: ['2026-10'] });
    cleanup();
    view([tr('a', '2026-11-09'), tr('b', '2026-10-30')], { y: '2026', sc: '0' });
    expect(screen.getByRole('button', { name: /Oktobar 2026/ }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: /Novembar 2026/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('lists one page of a long period and offers the next', () => {
    const many = Array.from({ length: 45 }, (_, i) => tr(String(i), `2026-11-${String((i % 9) + 1).padStart(2, '0')}`));
    view(many, { y: '2026' });
    expect(document.querySelectorAll('.srows > li')).toHaveLength(30);
    expect(screen.getByText('30 od 45')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Prikaži još 15' }).getAttribute('href')).toBe('/?y=2026&n=60');
  });

  it('offers older sessions when the recent view has more than one page', () => {
    const many = Array.from({ length: 31 }, (_, i) => tr(String(i), '2026-11-01'));
    view(many);
    expect(document.querySelectorAll('.srows > li')).toHaveLength(30);
    expect(screen.getByRole('link', { name: 'Prikaži starije' }).getAttribute('href')).toBe('/?n=60');
  });

  it('keeps the side panel shut until opened, and toggles it on the client without navigating', () => {
    view([tr('a', '2026-11-09')]);
    const side = () => document.querySelector('[data-panel="side"]');
    expect(side()?.hasAttribute('data-closed')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži učinak' }));
    expect(side()?.hasAttribute('data-closed')).toBe(false);
    expect(window.location.search).toBe('?s=1');
    fireEvent.click(screen.getByRole('button', { name: 'Sakrij učinak' }));
    expect(side()?.hasAttribute('data-closed')).toBe(true);
    expect(window.location.search).toBe('');
  });

  it('opens already when the address says so', () => {
    view([tr('a', '2026-11-09')], { s: '1' });
    expect(document.querySelector('[data-panel="side"]')?.hasAttribute('data-closed')).toBe(false);
  });
});
