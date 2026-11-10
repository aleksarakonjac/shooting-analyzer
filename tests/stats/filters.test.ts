import { describe, expect, it } from 'vitest';
import { filtersHref, parseFilters } from '@/lib/stats/filters';

const now = new Date('2026-11-10T09:00:00Z');
const tz = 'Europe/Belgrade';

describe('parseFilters', () => {
  it('defaults to the recent sessions with no other filter and the result chart', () => {
    expect(parseFilters({}, now, tz)).toEqual({
      quick: 'recent', year: null, month: null, from: null, to: null, discipline: null, kind: null, stage: null, place: null, event: null, chart: 'rez', side: false, limit: 30,
    });
  });

  it('turns a year, or a month of a year, into its date range', () => {
    expect(parseFilters({ y: '2026', mo: '11' }, now, tz)).toMatchObject({ quick: 'period', year: '2026', month: '11', from: '2026-11-01', to: '2026-12-01' });
    expect(parseFilters({ y: '2025' }, now, tz)).toMatchObject({ year: '2025', month: null, from: '2025-01-01', to: '2026-01-01' });
    expect(parseFilters({ y: '2025', mo: '12' }, now, tz)).toMatchObject({ from: '2025-12-01', to: '2026-01-01' });
    expect(parseFilters({ mo: '3' }, now, tz)).toMatchObject({ year: '2026', month: '03', from: '2026-03-01', to: '2026-04-01' });
    expect(parseFilters({ y: 'abc', mo: '13' }, now, tz).quick).toBe('recent');
  });

  it('takes an explicit range (end inclusive) over a quick period', () => {
    expect(parseFilters({ y: '2026', od: '2026-10-01', do: '2026-10-31' }, now, tz)).toMatchObject({
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

  it('keeps the side panel open across other changes and writes it only when open', () => {
    const f = parseFilters({ s: '1', d: 'air_rifle' }, now, tz);
    expect(f.side).toBe(true);
    expect(filtersHref('/', f, { chart: 'puls' })).toBe('/?d=air_rifle&g=puls&s=1');
    expect(filtersHref('/', f, { side: false })).toBe('/?d=air_rifle');
  });

  it('writes a year and month', () => {
    expect(filtersHref('/', parseFilters({ y: '2026', mo: '4' }, now, tz), {})).toBe('/?y=2026&mo=04');
  });

  it('reads the list size, clamped to at least one page', () => {
    expect(parseFilters({ n: '90' }, now, tz).limit).toBe(90);
    expect(parseFilters({ n: '5' }, now, tz).limit).toBe(30);
    expect(parseFilters({ n: 'x' }, now, tz).limit).toBe(30);
  });

  it('keeps a longer list across a chart switch, and starts it over on any other change', () => {
    const f = parseFilters({ y: '2026', n: '60' }, now, tz);
    expect(filtersHref('/', f, { chart: 'puls' })).toBe('/?y=2026&g=puls&n=60');
    expect(filtersHref('/', f, { limit: 90 })).toBe('/?y=2026&n=90');
    expect(filtersHref('/', f, { discipline: 'air_rifle' })).toBe('/?y=2026&d=air_rifle');
  });
});
