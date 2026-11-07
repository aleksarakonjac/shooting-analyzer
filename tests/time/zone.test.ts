import { describe, expect, it } from 'vitest';
import { tzOffsetMs, zonedWallTimeToUtcMs } from '@/lib/time/zone';

const iso = (ms: number) => new Date(ms).toISOString();
const belgrade = (y: number, mo: number, d: number, h: number, mi: number) =>
  iso(zonedWallTimeToUtcMs(y, mo, d, h, mi, 0, 0, 'Europe/Belgrade'));

describe('zonedWallTimeToUtcMs (Europe/Belgrade)', () => {
  it('uses UTC+2 in summer and UTC+1 in winter', () => {
    expect(belgrade(2026, 10, 21, 19, 3)).toBe('2026-10-21T17:03:00.000Z');
    expect(belgrade(2026, 11, 4, 8, 54)).toBe('2026-11-04T07:54:00.000Z');
  });

  it('switches exactly at the 25 Oct 2026 change (03:00 CEST -> 02:00 CET)', () => {
    expect(belgrade(2026, 10, 25, 1, 59)).toBe('2026-10-24T23:59:00.000Z'); // still CEST
    expect(belgrade(2026, 10, 25, 3, 0)).toBe('2026-10-25T02:00:00.000Z'); // CET
  });

  it('resolves the ambiguous 02:30 on 25 Oct to the later (CET) occurrence, deterministically', () => {
    expect(belgrade(2026, 10, 25, 2, 30)).toBe('2026-10-25T01:30:00.000Z');
  });

  it('moves the nonexistent 02:30 on 29 Mar 2026 forward past the gap', () => {
    expect(belgrade(2026, 3, 29, 2, 30)).toBe('2026-03-29T01:30:00.000Z'); // = 03:30 CEST
  });

  it('keeps milliseconds', () => {
    expect(iso(zonedWallTimeToUtcMs(2026, 11, 4, 8, 54, 50, 123, 'Europe/Belgrade'))).toBe('2026-11-04T07:54:50.123Z');
  });
});

describe('tzOffsetMs', () => {
  it('reports the offset in force at an instant', () => {
    expect(tzOffsetMs(Date.UTC(2026, 6, 1), 'Europe/Belgrade')).toBe(2 * 3600_000);
    expect(tzOffsetMs(Date.UTC(2026, 0, 1), 'Europe/Belgrade')).toBe(3600_000);
    expect(tzOffsetMs(Date.UTC(2026, 0, 1), 'UTC')).toBe(0);
  });
});
