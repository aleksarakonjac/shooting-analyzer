import { describe, expect, it } from 'vitest';
import { daysLeft } from '@/lib/trash/daysLeft';

const NOW = new Date('2026-11-09T12:00:00Z');

describe('daysLeft', () => {
  it('counts the whole days until the 30-day purge', () => {
    expect(daysLeft('2026-11-09T11:00:00Z', NOW)).toBe(30);
    expect(daysLeft('2026-11-08T11:00:00Z', NOW)).toBe(29);
    expect(daysLeft('2026-10-12T12:00:00Z', NOW)).toBe(2);
  });

  it('rounds a partial last day up and never goes below zero', () => {
    expect(daysLeft('2026-10-10T13:00:00Z', NOW)).toBe(1);
    expect(daysLeft('2026-10-01T12:00:00Z', NOW)).toBe(0);
  });
});
