import { describe, expect, it } from 'vitest';
import { eventRows, type EventSessionRow } from '@/lib/sessions/eventRows';

const row = (over: Partial<EventSessionRow> & { id: string }): EventSessionRow => ({
  name: over.id, discipline: 'air_rifle', trained_on: '2026-11-07', started_at: null, stage: 'slobodno',
  matches: [], finals: [], ...over,
});

describe('eventRows', () => {
  it('orders the sessions by day and start, with the match total and series average, and a final by its total', () => {
    const out = eventRows([
      row({ id: 'fin', trained_on: '2026-11-08', started_at: '2026-11-08T15:00:00Z', stage: 'finale',
        finals: [{ final_shots: [{ value: 10.5 }, { value: '10.1' }] }] }),
      row({ id: 'kv', trained_on: '2026-11-08', started_at: '2026-11-08T09:00:00Z', stage: 'kvalifikacije',
        matches: [{ series: [{ total: 104, total_decimal: 104.6 }, { total: 105, total_decimal: '105.2' }] }] }),
      row({ id: 'el', trained_on: '2026-11-07', stage: 'eliminacije', matches: [{ series: [{ total: 103, total_decimal: 103 }] }] }),
    ]);
    expect(out.map((r) => [r.id, r.total, r.avgSeries, r.series])).toEqual([
      ['el', 103, 103, 1],
      ['kv', 209.8, 104.9, 2],
      ['fin', 20.6, null, 0],
    ]);
  });

  it('uses whole rings for disciplines without decimals and has no total when nothing was shot', () => {
    const out = eventRows([
      row({ id: 'p', discipline: 'air_pistol', matches: [{ series: [{ total: 95, total_decimal: null }, { total: 96, total_decimal: null }] }] }),
      row({ id: 'e' }),
    ]);
    expect(out.map((r) => [r.id, r.total])).toEqual([['p', 191], ['e', null]]);
  });
});
