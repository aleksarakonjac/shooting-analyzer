import { describe, expect, it } from 'vitest';
import { hrStats, matchTotal, offsetDirection, shotWindow, zoneShiftMs } from '@/lib/report/derive';

describe('offsetDirection', () => {
  it('names the side for each axis (+X right, +Y up) and drops a zero axis', () => {
    expect(offsetDirection({ x: -0.5, y: -0.4 })).toEqual({ x: { mm: 0.5, side: 'left' }, y: { mm: 0.4, side: 'down' } });
    expect(offsetDirection({ x: 1.25, y: 0 })).toEqual({ x: { mm: 1.3, side: 'right' }, y: { mm: 0, side: null } });
    expect(offsetDirection({ x: 0.04, y: 2 }).x.side).toBeNull(); // rounds to 0.0 at one decimal
  });
});

describe('matchTotal', () => {
  it('sums decimal series with one-decimal precision', () => {
    const series = [{ total: 104, total_decimal: 104.5 }, { total: 103, total_decimal: 103.7 }];
    expect(matchTotal(series, true)).toBe(208.2);
  });
  it('sums whole-ring series and treats a missing total as 0', () => {
    expect(matchTotal([{ total: 98, total_decimal: null }, { total: null, total_decimal: null }], false)).toBe(98);
    expect(matchTotal([], true)).toBe(0);
  });
});

describe('hrStats', () => {
  it('is null for no samples (shown as "nema pulsa")', () => {
    expect(hrStats([])).toBeNull();
  });
  it('gives rounded average, min, max and count', () => {
    expect(hrStats([{ tMs: 1, bpm: 80 }, { tMs: 2, bpm: 91 }, { tMs: 3, bpm: 100 }])).toEqual({ avg: 90, min: 80, max: 100, count: 3 });
  });
});

describe('shotWindow', () => {
  it('pads the first and last shot time and ignores missing times', () => {
    expect(shotWindow([null, 100_000, 160_000, null], 30_000)).toEqual({ fromMs: 70_000, toMs: 190_000 });
  });
  it('is null when no shot has a time (SIUS-only training)', () => {
    expect(shotWindow([null, undefined], 30_000)).toBeNull();
  });
});

describe('zoneShiftMs', () => {
  it('is the difference of the first samples after reinterpretation', () => {
    expect(zoneShiftMs([{ tMs: 5_000, bpm: 1 }], [{ tMs: 3_605_000, bpm: 1 }])).toBe(3_600_000);
  });
  it('is 0 when either side is empty', () => {
    expect(zoneShiftMs([], [{ tMs: 1, bpm: 1 }])).toBe(0);
  });
});
