import { describe, expect, it } from 'vitest';
import { overviewHits } from '@/lib/report/overview';

const shot = (n: number, series: number) => ({ n, series });
const shots = [shot(1, 1), shot(2, 1), shot(3, 1), shot(4, 2), shot(5, 2)];

describe('overviewHits', () => {
  it('a selected shot: only that shot, fully visible, and no scope selected', () => {
    const r = overviewHits(shots, { scope: 'match', series: 1, shot: 2 });
    expect(r.mode).toBe('shot');
    expect(r.hits.map((h) => [h.n, h.alpha])).toEqual([[2, 1]]);
  });

  it('series: that series only, later shots more visible, the last fully', () => {
    const r = overviewHits(shots, { scope: 'series', series: 1, shot: null });
    expect(r.mode).toBe('series');
    expect(r.hits.map((h) => h.n)).toEqual([1, 2, 3]);
    const a = r.hits.map((h) => h.alpha);
    expect(a[0]).toBeLessThan(a[1]);
    expect(a[1]).toBeLessThan(a[2]);
    expect(a[2]).toBe(1);
    expect(a[0]).toBeGreaterThanOrEqual(0.25);
  });

  it('match: every shot in shooting order, faded by order across the match', () => {
    const r = overviewHits(shots, { scope: 'match', series: 1, shot: null });
    expect(r.mode).toBe('match');
    expect(r.hits.map((h) => h.n)).toEqual([1, 2, 3, 4, 5]);
    expect(r.hits.at(-1)!.alpha).toBe(1);
    expect(r.hits[0].alpha).toBeLessThan(r.hits[4].alpha);
  });

  it('series scope without a series falls back to the match', () => {
    expect(overviewHits(shots, { scope: 'series', series: null, shot: null }).mode).toBe('match');
  });

  it('a single hit in view is fully visible', () => {
    expect(overviewHits([shot(7, 3)], { scope: 'series', series: 3, shot: null }).hits[0].alpha).toBe(1);
  });
});
