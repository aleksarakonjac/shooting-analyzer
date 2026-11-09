import { describe, expect, it } from 'vitest';
import { hrCoverage } from '@/lib/report/derive';

const samples = [0, 10_000, 20_000, 30_000, 400_000].map((tMs) => ({ tMs, bpm: 90 }));

describe('hrCoverage', () => {
  it('counts the samples inside the shot window (with the offset applied)', () => {
    expect(hrCoverage(samples, [5_000, 25_000], 0)).toEqual({ inside: 4, total: 5 }); // window 5 s .. 25 s widened by 60 s
  });

  it('finds none when the clock is off by hours', () => {
    expect(hrCoverage(samples, [5_000, 25_000], 3 * 3600_000)).toEqual({ inside: 0, total: 5 });
  });

  it('is null when no shot has a time', () => {
    expect(hrCoverage(samples, [null, null], 0)).toBeNull();
  });
});
