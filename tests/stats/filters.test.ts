import { describe, expect, it } from 'vitest';
import { filtersHref, parseFilters } from '@/lib/stats/filters';

const now = new Date('2026-11-10T09:00:00Z');
const tz = 'Europe/Belgrade';

describe('parseFilters', () => {
  it('defaults to the recent sessions with no other filter and the result chart', () => {
    expect(parseFilters({}, now, tz)).toEqual({
      quick: 'recent', from: null, to: null, discipline: null, kind: null, stage: null, place: null, event: null, chart: 'rez',
    });
  });

  it('turns a quick period into its date range', () => {
    expect(parseFilters({ p: 'month' }, now, tz)).toMatchObject({ quick: 'month', from: '2026-11-01', to: '2026-12-01' });
    expect(parseFilters({ p: 'year' }, now, tz)).toMatchObject({ from: '2026-01-01', to: '2027-01-01' });
  });

  it('takes an explicit range (end inclusive) over a quick period', () => {
    expect(parseFilters({ p: 'week', od: '2026-10-01', do: '2026-10-31' }, now, tz)).toMatchObject({
      quick: 'range', from: '2026-10-01', to: '2026-11-01',
    });
  });

  it('keeps only known values for the choice filters', () => {
    const f = parseFilters({ d: 'air_rifle', v: 'takmicenje', deo: 'finale', m: ' Beograd ', e: '00000000-0000-0000-0000-000000000001', g: 'puls' }, now, tz);
    expect(f).toMatchObject({ discipline: 'air_rifle', kind: 'takmicenje', stage: 'finale', place: 'Beograd', event: '00000000-0000-0000-0000-000000000001', chart: 'puls' });
    const bad = parseFilters({ d: 'x', v: 'x', deo: 'x', e: 'drop table', g: 'x', od: '2026-13-45' }, now, tz);
    expect(bad).toMatchObject({ discipline: null, kind: null, stage: null, event: null, chart: 'rez', quick: 'recent' });
  });
});

describe('filtersHref', () => {
  it('writes only what differs from the default, with a patch applied', () => {
    const f = parseFilters({ d: 'air_rifle' }, now, tz);
    expect(filtersHref('/', f, { chart: 'grupa' })).toBe('/?d=air_rifle&g=grupa');
    expect(filtersHref('/strelci/x', parseFilters({}, now, tz), {})).toBe('/strelci/x');
    expect(filtersHref('/', parseFilters({ od: '2026-10-01', do: '2026-10-31' }, now, tz), { kind: 'trening' })).toBe('/?od=2026-10-01&do=2026-10-31&v=trening');
  });

  it('switching to a quick period drops an explicit range', () => {
    const f = parseFilters({ od: '2026-10-01', do: '2026-10-31', m: 'Novi Sad' }, now, tz);
    expect(filtersHref('/', f, { quick: 'week' })).toBe('/?p=week&m=Novi+Sad');
  });
});
