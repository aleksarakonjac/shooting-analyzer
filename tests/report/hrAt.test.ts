import { describe, expect, it } from 'vitest';
import { hrAt } from '@/lib/report/hrAt';

const s = [
  { tMs: 1000, bpm: 90 },
  { tMs: 3000, bpm: 100 },
  { tMs: 30000, bpm: 80 },
];

describe('hrAt', () => {
  it('reads a sample exactly and interpolates between close neighbours', () => {
    expect(hrAt(s, 1000)).toBe(90);
    expect(hrAt(s, 2000)).toBe(95);
  });

  it('is null inside a gap longer than 10 s', () => {
    expect(hrAt(s, 15000)).toBeNull();
  });

  it('takes the end sample up to 1 s past either end, nothing further out', () => {
    expect(hrAt(s, 500)).toBe(90);
    expect(hrAt(s, 30900)).toBe(80);
    expect(hrAt(s, -500)).toBeNull();
    expect(hrAt(s, 31500)).toBeNull();
  });

  it('is null with no samples', () => {
    expect(hrAt([], 1000)).toBeNull();
  });
});
