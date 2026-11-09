import { describe, expect, it } from 'vitest';
import { ringRadiusMm, scoreBand, targetSpec, viewRadiusMm } from '@/lib/report/target';

describe('targetSpec (ISSF dimensions)', () => {
  it('10 m air rifle: ring 1 is 45.5 mm, ring 10 a 0.5 mm dot, 5 mm per ring, black from ring 4', () => {
    const s = targetSpec('air_rifle');
    expect(ringRadiusMm(s, 1)).toBeCloseTo(22.75);
    expect(ringRadiusMm(s, 10)).toBeCloseTo(0.25);
    expect(ringRadiusMm(s, 9)).toBeCloseTo(2.75);
    expect(s.blackMm).toBeCloseTo(30.5);
    expect(ringRadiusMm(s, 4)).toBeCloseTo(15.25); // the aiming mark is ring 4
  });

  it('10 m air pistol: ring 1 is 155.5 mm, ring 10 11.5 mm, black 59.5 mm (ring 7)', () => {
    const s = targetSpec('air_pistol');
    expect(ringRadiusMm(s, 1)).toBeCloseTo(77.75);
    expect(ringRadiusMm(s, 10)).toBeCloseTo(5.75);
    expect(ringRadiusMm(s, 7)).toBeCloseTo(29.75);
    expect(s.blackMm).toBeCloseTo(59.5);
  });

  it('50 m rifle: ring 1 is 154.4 mm, ring 10 10.4 mm, black 112.4 mm (between rings 4 and 3)', () => {
    const s = targetSpec('smallbore_3p');
    expect(ringRadiusMm(s, 1)).toBeCloseTo(77.2);
    expect(ringRadiusMm(s, 10)).toBeCloseTo(5.2);
    expect(s.blackMm).toBeCloseTo(112.4);
    expect(ringRadiusMm(s, 4)).toBeLessThan(s.blackMm / 2);
    expect(ringRadiusMm(s, 3)).toBeGreaterThan(s.blackMm / 2);
  });

  it('25/50 m pistol precision target: ring 1 is 500 mm, ring 10 50 mm', () => {
    const s = targetSpec('smallbore_pistol');
    expect(ringRadiusMm(s, 1)).toBeCloseTo(250);
    expect(ringRadiusMm(s, 10)).toBeCloseTo(25);
  });
});

describe('viewRadiusMm', () => {
  it('shows air rifle rings 5-10 for a normal group and widens for a wide one', () => {
    const s = targetSpec('air_rifle');
    expect(viewRadiusMm(s, 5)).toBeCloseTo(ringRadiusMm(s, 5));
    expect(viewRadiusMm(s, 12)).toBeCloseTo(ringRadiusMm(s, 3)); // 15.6 mm -> ring 3 (17.75)
    expect(viewRadiusMm(s, 40)).toBeCloseTo(ringRadiusMm(s, 1));
  });

  it('zooms a large target to the rings that hold the group, never inside ring 8', () => {
    const s = targetSpec('smallbore_3p');
    expect(viewRadiusMm(s, 4)).toBeCloseTo(ringRadiusMm(s, 8)); // a tight group still shows rings 8-10
    expect(viewRadiusMm(s, 30)).toBeCloseTo(ringRadiusMm(s, 5)); // 30 mm * 1.3 = 39 mm -> ring 5 (37.2 is too small)
    expect(viewRadiusMm(s, 500)).toBeCloseTo(ringRadiusMm(s, 1));
  });
});

describe('scoreBand', () => {
  it('decimal scoring: 10.5 and up, 10.0-10.4, 9.x, below 9', () => {
    expect(scoreBand(10.9, true)).toBe('top');
    expect(scoreBand(10.5, true)).toBe('top');
    expect(scoreBand(10.4, true)).toBe('ten');
    expect(scoreBand(10.0, true)).toBe('ten');
    expect(scoreBand(9.9, true)).toBe('nine');
    expect(scoreBand(8.7, true)).toBe('low');
  });

  it('whole rings: 10, 9, 8, below 8', () => {
    expect(scoreBand(10, false)).toBe('top');
    expect(scoreBand(9, false)).toBe('ten');
    expect(scoreBand(8, false)).toBe('nine');
    expect(scoreBand(7, false)).toBe('low');
  });
});
