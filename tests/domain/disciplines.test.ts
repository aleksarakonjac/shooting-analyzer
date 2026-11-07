import { describe, expect, it } from 'vitest';
import {
  DISCIPLINES,
  disciplineFromSiusName,
  validateSeries,
  validateShot,
} from '@/lib/domain/disciplines';

describe('disciplineFromSiusName', () => {
  it.each([
    ['Air Rifle 80', 'air_rifle'],
    ['50m Rifle 3x20', 'smallbore_3p'],
    ['50m Rifle 3x40', 'smallbore_3p'],
    ['10m Air Pistol 60', 'air_pistol'],
    ['25m Pistol', 'smallbore_pistol'],
    ['50m Pistol', 'smallbore_pistol'],
  ])('%s -> %s', (name, id) => {
    expect(disciplineFromSiusName(name)).toBe(id);
  });

  it('returns undefined for an unknown name', () => {
    expect(disciplineFromSiusName('Nepoznato')).toBeUndefined();
  });
});

describe('DISCIPLINES', () => {
  it('marks only 3x20 rifle as positions-based', () => {
    expect(DISCIPLINES.smallbore_3p.hasPositions).toBe(true);
    expect(DISCIPLINES.air_rifle.hasPositions).toBe(false);
    expect(DISCIPLINES.air_pistol.hasPositions).toBe(false);
    expect(DISCIPLINES.smallbore_pistol.hasPositions).toBe(false);
  });

  it('carries Serbian names', () => {
    expect(DISCIPLINES.air_rifle.nameSr).toBe('Vazdušna puška');
    expect(DISCIPLINES.smallbore_3p.nameSr).toBe('MK puška trostav');
    expect(DISCIPLINES.air_pistol.nameSr).toBe('Vazdušni pištolj');
    expect(DISCIPLINES.smallbore_pistol.nameSr).toBe('MK pištolj');
  });

  it('follows spec 6a scoring rules', () => {
    expect(DISCIPLINES.air_rifle).toMatchObject({ decimal: true, maxShot: 10.9, maxSeries: 109.0 });
    for (const d of ['smallbore_3p', 'air_pistol', 'smallbore_pistol'] as const) {
      expect(DISCIPLINES[d]).toMatchObject({ decimal: false, maxShot: 10, maxSeries: 100 });
    }
  });

  it('keeps referenceMatchSeries as display reference only', () => {
    expect(DISCIPLINES.air_rifle.referenceMatchSeries).toBe(6);
    expect(DISCIPLINES.air_pistol.referenceMatchSeries).toBe(6);
    expect(DISCIPLINES.smallbore_pistol.referenceMatchSeries).toBe(6);
    expect(DISCIPLINES.smallbore_3p.referenceMatchSeries).toBeNull();
  });
});

describe('validateShot', () => {
  it('air rifle: decimal up to 10.9, one decimal', () => {
    expect(validateShot('air_rifle', 10.9)).toBe(true);
    expect(validateShot('air_rifle', 0)).toBe(true);
    expect(validateShot('air_rifle', 11.0)).toBe(false);
    expect(validateShot('air_rifle', 10.55)).toBe(false);
    expect(validateShot('air_rifle', -0.1)).toBe(false);
  });

  it('smallbore 3p: whole rings 0..10', () => {
    expect(validateShot('smallbore_3p', 10)).toBe(true);
    expect(validateShot('smallbore_3p', 0)).toBe(true);
    expect(validateShot('smallbore_3p', 10.5)).toBe(false);
    expect(validateShot('smallbore_3p', 11)).toBe(false);
  });

  it('rejects NaN and Infinity', () => {
    expect(validateShot('air_pistol', NaN)).toBe(false);
    expect(validateShot('air_rifle', Infinity)).toBe(false);
  });
});

describe('validateSeries', () => {
  it('accepts ten tens for air pistol', () => {
    expect(validateSeries('air_pistol', Array(10).fill(10))).toEqual({ ok: true });
  });

  it('rejects a series total over the series maximum', () => {
    const r = validateSeries('air_pistol', [...Array(10).fill(10), 1]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('rejects a series containing an invalid shot', () => {
    const r = validateSeries('air_rifle', [10.6, 11.2]);
    expect(r.ok).toBe(false);
  });

  it('accepts a real air rifle series (104.5)', () => {
    expect(
      validateSeries('air_rifle', [10.6, 10.6, 10.6, 10.5, 10.7, 10.5, 10.0, 10.0, 10.5, 10.5]).ok,
    ).toBe(true);
  });

  it('never caps match totals: 8 air-pistol series totalling 780 all pass', () => {
    const sums = [97, 97, 97, 97, 98, 98, 98, 98];
    expect(sums.reduce((a, b) => a + b, 0)).toBe(780);
    for (const s of sums) {
      // ten whole-ring shots summing to s: (s-90) nines lifted to tens
      const shots = [...Array(s - 90).fill(10), ...Array(10 - (s - 90)).fill(9)];
      expect(shots.reduce((a: number, b: number) => a + b, 0)).toBe(s);
      expect(validateSeries('air_pistol', shots).ok).toBe(true);
    }
  });
});
