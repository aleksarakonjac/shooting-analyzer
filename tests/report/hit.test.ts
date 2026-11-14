import { describe, expect, it } from 'vitest';
import { arrowAngle, correctHit, radiusBand } from '@/lib/report/hit';
import { decimalScore } from '@/lib/scatt/display';
import { SCATT_TARGETS } from '@/lib/scatt/targets';

const ar = SCATT_TARGETS.ar10;

describe('radiusBand', () => {
  it('gives a 0.25 mm band per tenth on the air rifle target', () => {
    expect(radiusBand(10.6, true, ar)).toEqual({ lo: expect.closeTo(0.75, 6), hi: expect.closeTo(1.0, 6) });
    expect(radiusBand(10.9, true, ar)).toEqual({ lo: 0, hi: expect.closeTo(0.25, 6) });
    expect(radiusBand(9.0, true, ar)!.hi).toBeCloseTo(5.0, 6);
    expect(radiusBand(9.0, true, ar)!.lo).toBeCloseTo(4.75, 6);
  });

  it('agrees with decimalScore everywhere inside a band', () => {
    for (let v = 1.0; v <= 10.9; v = Math.round((v + 0.1) * 10) / 10) {
      const b = radiusBand(v, true, ar)!;
      const mid = (b.lo + b.hi) / 2;
      expect(decimalScore(mid, 0, ar.rings, ar.caliber)).toBeCloseTo(v, 6);
    }
  });

  it('matches the SIUS portal table for 10 m air rifle (score = 11 - distance / 2.5, distance in 0.25 mm steps)', () => {
    for (let i = 1; i <= 100; i++) {
      const d = i * 0.25;
      const score = Math.round((11 - d / 2.5) * 10) / 10;
      const b = radiusBand(score, true, ar)!;
      expect(d).toBeLessThanOrEqual(b.hi + 1e-9);
      expect(d).toBeGreaterThan(b.lo - 1e-9);
    }
  });

  it('matches the SIUS portal table for 10 m air pistol (0.8 mm per tenth)', () => {
    const ap = SCATT_TARGETS.ap10;
    for (let i = 1; i <= 100; i++) {
      const d = Math.round(i * 0.8 * 10) / 10;
      const score = Math.round((11 - i / 10) * 10) / 10;
      const b = radiusBand(score, true, ap)!;
      expect(d).toBeLessThanOrEqual(b.hi + 1e-9);
      expect(d).toBeGreaterThan(b.lo - 1e-9);
      expect(decimalScore(d - 1e-9, 0, ap.rings, ap.caliber)).toBeCloseTo(score, 6);
    }
  });

  it('gives the whole ring for whole-ring scores and nothing for a miss', () => {
    const sb = SCATT_TARGETS.sbr50;
    expect(radiusBand(10, false, sb)).toEqual({ lo: 0, hi: 8 });
    expect(radiusBand(9, false, sb)).toEqual({ lo: 8, hi: 16 });
    expect(radiusBand(0, false, sb)).toBeNull();
  });
});

describe('arrowAngle', () => {
  it('reads the eight SIUS arrows', () => {
    expect([...'→↗↑↖←↙↓↘'].map((a) => arrowAngle(a))).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(arrowAngle('')).toBeNull();
    expect(arrowAngle(null)).toBeNull();
  });
});

describe('correctHit', () => {
  it('leaves a hit that SIUS agrees with', () => {
    const c = correctHit({ x: 0, y: 0.9 }, 10.6, true, ar, '↑');
    expect(c.movedMm).toBeCloseTo(0, 9);
    expect(c.turned).toBe(false);
  });

  it('pulls the distance into the SIUS band along the SCATT direction', () => {
    // SCATT read 10.2 (r = 2.1) up; SIUS scored 10.6 (r in 0.75..1.0).
    const c = correctHit({ x: 0, y: 2.1 }, 10.6, true, ar, '↑');
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(1.0, 6);
    expect(c.turned).toBe(false);
  });

  it('turns to the arrow when SCATT points elsewhere', () => {
    // SCATT says right, SIUS arrow says down-left.
    const c = correctHit({ x: 1.0, y: 0 }, 10.6, true, ar, '↙');
    expect(Math.atan2(c.y, c.x) * (180 / Math.PI)).toBeCloseTo(-135, 6);
    expect(Math.hypot(c.x, c.y)).toBeCloseTo(1.0, 6);
    expect(c.turned).toBe(true);
  });

  it('keeps the SCATT direction when there is no arrow', () => {
    const c = correctHit({ x: 1.5, y: 0 }, 10.6, true, ar);
    expect(c.y).toBeCloseTo(0, 6);
    expect(c.x).toBeCloseTo(1.0, 6);
  });

  it('says how sure the direction is', () => {
    expect(correctHit({ x: 0, y: 0.9 }, 10.6, true, ar, '↑').confidence).toBe('verified');
    expect(correctHit({ x: 0, y: 0.9 }, 10.6, true, ar).confidence).toBe('scatt-only');
    expect(correctHit({ x: 1.0, y: 0 }, 10.6, true, ar, '↙').confidence).toBe('arrow-only');
  });
});
