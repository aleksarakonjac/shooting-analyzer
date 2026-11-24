// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/inbox/actions', () => ({ discardInboxFileForm: vi.fn(), passInboxFile: vi.fn() }));
const { InboxDay } = await import('../../src/components/inbox/InboxDay');

const base = { shooterId: 's1', path: 'p', createdAt: '2026-11-24T19:00:00Z', meta: null };
const items = [
  { ...base, id: 'a', kind: 'sius_prnx' as const, name: 'report.prnx' },
  { ...base, id: 'b', kind: 'scatt' as const, name: 'trace.scatt-expert' },
  { ...base, id: 'c', kind: 'tcx' as const, name: 'pulse.tcx' },
];
const day = (over = {}) => (
  <InboxDay
    items={items}
    pairs={[{ siusId: 'a', scattId: 'b' }]}
    day="2026-11-24"
    tz="Europe/Belgrade"
    newHref="/strelci/s1/novi"
    sessions={[
      { id: 't1', name: 'Jutro', trainedOn: '2026-11-24', has: { scatt: false, tcx: false, sius: false } },
      { id: 't2', name: 'Juče', trainedOn: '2026-11-23', has: { scatt: true, tcx: false, sius: true } },
    ]}
    passTo={[{ id: 's2', name: 'Boris' }]}
    {...over}
  />
);
const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href');

afterEach(cleanup);

describe('InboxDay', () => {
  it('starts with the proposed pair and follows the choice', () => {
    render(day());
    expect((screen.getByLabelText(/report\.prnx/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/pulse\.tcx/) as HTMLInputElement).checked).toBe(false);
    expect(href('Nova sesija')).toBe('/strelci/s1/novi?inbox=a&inbox=b');
    expect(href(/Jutro/)).toBe('/trening/t1/podaci?inbox=a&inbox=b');
    fireEvent.click(screen.getByLabelText(/trace/));
    fireEvent.click(screen.getByLabelText(/pulse/));
    expect(href('Nova sesija')).toBe('/strelci/s1/novi?inbox=a&inbox=c');
  });

  it('offers nothing to open when nothing is chosen', () => {
    render(day({ pairs: [], }));
    expect(screen.queryByRole('link', { name: 'Nova sesija' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Jutro/ })).toBeNull();
  });

  it('starts with the file the phone just sent, together with its pair', () => {
    render(day({ current: 'b' }));
    expect(href('Nova sesija')).toBe('/strelci/s1/novi?inbox=a&inbox=b');
    cleanup();
    render(day({ current: 'c' }));
    expect(href('Nova sesija')).toBe('/strelci/s1/novi?inbox=c');
  });

  it('starts with the only file there is', () => {
    render(day({ items: [items[2]], pairs: [] }));
    expect(href('Nova sesija')).toBe('/strelci/s1/novi?inbox=c');
  });

  it('says what a session already has of what is chosen', () => {
    render(day());
    expect(screen.getByRole('link', { name: /Juče/ }).textContent).toContain('ima SCATT');
    expect(screen.getByRole('link', { name: /Jutro/ }).textContent).not.toContain('ima');
  });

  it('switches between several pairs', () => {
    const more = [...items, { ...base, id: 'd', kind: 'sius_prnx' as const, name: 'second.prnx' }, { ...base, id: 'e', kind: 'scatt' as const, name: 'second.scatt-expert' }];
    render(day({ items: more, pairs: [{ siusId: 'a', scattId: 'b' }, { siusId: 'd', scattId: 'e' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'second.prnx + second.scatt-expert' }));
    expect(href('Nova sesija')).toBe('/strelci/s1/novi?inbox=d&inbox=e');
  });

  it('passes a file only to the given people, and to nobody when there are none', () => {
    render(day());
    expect([...screen.getAllByLabelText('Prebaci strelcu')[0].querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Prebaci strelcu', 'Boris']);
    cleanup();
    render(day({ passTo: [] }));
    expect(screen.queryByLabelText('Prebaci strelcu')).toBeNull();
  });
});
