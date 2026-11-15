import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { disciplineFromSiusName } from '@/lib/domain/disciplines';
import {
  defaultProneRanges,
  firstShotAt,
  isProneProgram,
  mapSiusShots,
  matchShotCount,
  parseProneRanges,
  splitByPositions,
} from '@/lib/sius/map';
import type { SiusShotsResponse } from '@/lib/sius/types';

const fx = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/sius/${name}`, import.meta.url), 'utf8')) as SiusShotsResponse;
const air = fx('air-60-sighters.json');
const x320 = fx('rifle-3x20.json');
const prone = fx('prone-60.json');
const sightersOnly = fx('sighters-only.json');
const publicQual = fx('public-qual.json');

const allShots = (r: ReturnType<typeof mapSiusShots>) => r.series.flatMap((s) => s.shots);
const round1 = (v: number) => Math.round(v * 10) / 10;

describe('mapSiusShots', () => {
  it('air: decimal values, x/y, tMs, 6 series, sighters', () => {
    const r = mapSiusShots(air, { name: '10m Air Rifle' });
    expect(r.disciplineId).toBe('air_rifle');
    expect(r.discipline).toBe('10m Air Rifle');
    expect(r.series).toHaveLength(6);
    expect(r.series[0].index).toBe(1);
    expect(r.series[0].shots[0]).toMatchObject({ value: 10.7, x: -0.08, y: 0.63, tMs: Date.parse('2026-08-19T08:36:52.59Z') });
    expect(r.series[0].shots[0].valueDecimal).toBeUndefined();
    expect(r.sighters?.[0].shots).toHaveLength(4);
    const last = allShots(r).at(-1)!;
    expect(r.reportTime?.getTime()).toBe(last.tMs);
    expect(r.series[0].total).toBe(round1(r.series[0].shots.reduce((a, s) => a + s.value, 0)));
    expect(r.total).toBe(round1(allShots(r).reduce((a, s) => a + s.value, 0)));
  });

  it('3x20: whole value + decimal, positions, 2 series per position, sighters per position', () => {
    const r = mapSiusShots(x320, { name: '50m Rifle 3x20' });
    expect(r.disciplineId).toBe('smallbore_3p');
    expect(r.series.map((s) => s.position)).toEqual(['kneeling', 'kneeling', 'prone', 'prone', 'standing', 'standing']);
    expect(r.series.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.series[0].shots[0]).toMatchObject({ value: 10, inner: true, valueDecimal: 10.6 });
    expect(r.sighters?.map((g) => g.position)).toEqual(['kneeling', 'prone', 'standing']);
    expect(r.sighters?.map((g) => g.shots.length)).toEqual([5, 3, 4]);
    const s1 = r.series[0];
    expect(s1.total).toBe(s1.shots.reduce((a, s) => a + s.value, 0));
    expect(s1.totalDecimal).toBe(round1(s1.shots.reduce((a, s) => a + s.valueDecimal!, 0)));
    expect(r.innerTens).toBe(allShots(r).filter((s) => s.inner).length);
  });

  it('air sighters precede series 1; 3x20 sighters precede 1, 3, 5', () => {
    expect(mapSiusShots(air, { name: '10m Air Rifle' }).sighters?.map((g) => g.beforeSeries)).toEqual([1]);
    expect(mapSiusShots(x320, { name: '50m Rifle 3x20' }).sighters?.map((g) => g.beforeSeries)).toEqual([1, 3, 5]);
  });

  it('score strings with spaces parse ("  9.9")', () => {
    const raw: SiusShotsResponse = {
      type: 'SingleStage',
      sightingShots: [],
      competitionGroups: [{ shots: [{ shotNumber: 1, coordinates: ' 1.5/-2 ', timeStamp: '2026-01-01T10:00:00+00:00', score: '  9.9', scores: ['  9.9'], innerTen: false }] }],
    };
    const r = mapSiusShots(raw, { name: '10m Air Rifle' });
    expect(r.series[0].shots[0]).toMatchObject({ value: 9.9, x: 1.5, y: -2 });
  });

  it('exercise with sighters only → 0 series, sighters kept', () => {
    const r = mapSiusShots(sightersOnly, { name: '10m Air Rifle' });
    expect(r.series).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.sighters?.[0]).toMatchObject({ beforeSeries: 1 });
    expect(r.sighters?.[0].shots).toHaveLength(5);
    expect(matchShotCount(r)).toBe(0);
    expect(firstShotAt(r)).toBeUndefined();
  });

  it('public qualification: 60 decimal shots, no sighters', () => {
    const r = mapSiusShots(publicQual, { name: '10m AIR RIFLE MEN' });
    expect(r.disciplineId).toBe('air_rifle');
    expect(matchShotCount(r)).toBe(60);
    expect(r.sighters ?? []).toEqual([]);
    expect(r.series[0].shots[0]).toMatchObject({ value: 10.1, x: -2.23, y: -0.18 });
    expect(firstShotAt(r)?.toISOString()).toBe('2026-11-03T06:16:23.480Z');
  });

  it('a final keeps decimal values whatever the discipline', () => {
    const r = mapSiusShots(x320, { name: '50m Rifle 3x20', final: true });
    expect(r.series[0].shots[0]).toMatchObject({ value: 10.6 });
    expect(r.series[0].shots[0].valueDecimal).toBeUndefined();
  });
});

describe('prone program', () => {
  it('isProneProgram and discipline', () => {
    expect(isProneProgram('50m Rifle Prone')).toBe(true);
    expect(isProneProgram('50m Rifle Prone 60')).toBe(true);
    expect(isProneProgram('50m Rifle 3x20')).toBe(false);
    expect(disciplineFromSiusName('50m Rifle Prone')).toBe('smallbore_3p');
  });

  it('prone 60 with default ranges → 6 series of 10 with positions, decimals kept, sighters by time', () => {
    const base = mapSiusShots(prone, { name: '50m Rifle Prone' });
    expect(base.series[0].shots[0].valueDecimal).toBeTypeOf('number');
    const p = parseProneRanges(defaultProneRanges(60), 60);
    const r = splitByPositions(base, p.ok ? p.positions : []);
    expect(r.series.map((s) => s.position)).toEqual(['kneeling', 'kneeling', 'prone', 'prone', 'standing', 'standing']);
    expect(r.series.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.sighters?.[0]).toMatchObject({ beforeSeries: 1, position: 'kneeling' });
    // The sighter fired after shot 20 belongs before the prone block.
    expect(r.sighters?.[1]).toMatchObject({ beforeSeries: 3, position: 'prone' });
    expect(r.sighters?.map((g) => g.shots.length)).toEqual([3, 1]);
    expect(allShots(r).map((s) => s.valueDecimal)).toEqual(allShots(base).map((s) => s.valueDecimal));
    expect(r.total).toBe(base.total);
    expect(r.totalDecimal).toBe(base.totalDecimal);
  });

  it('ranges with repeated position, unfinished', () => {
    const base = mapSiusShots(prone, { name: '50m Rifle Prone' });
    const shots46 = allShots(base).slice(0, 46);
    const first46 = { ...base, series: [{ ...base.series[0], shots: shots46 }] };
    const p = parseProneRanges({ kneeling: '1-25, 41-46', prone: '26-40', standing: '' }, 46);
    expect(p.ok).toBe(true);
    const r = splitByPositions(first46, p.ok ? p.positions : []);
    expect(r.series.map((s) => [s.position, s.shots.length])).toEqual([
      ['kneeling', 10], ['kneeling', 10], ['kneeling', 5], ['prone', 10], ['prone', 5], ['kneeling', 6],
    ]);
    expect(r.total).toBe(shots46.reduce((a, s) => a + s.value, 0));
    expect(r.totalDecimal).toBe(round1(shots46.reduce((a, s) => a + s.valueDecimal!, 0)));
  });

  it('all positions empty → plain series of 10 without positions', () => {
    const base = mapSiusShots(prone, { name: '50m Rifle Prone' });
    const p = parseProneRanges({ kneeling: '', prone: '', standing: '' }, 60);
    const r = splitByPositions(base, p.ok ? p.positions : []);
    expect(r.series.map((s) => s.position ?? null)).toEqual([null, null, null, null, null, null]);
  });

  it('ranges reject overlap and gaps', () => {
    expect(parseProneRanges({ kneeling: '1-30', prone: '25-60', standing: '' }, 60)).toEqual({ ok: false, error: 'overlap', shots: [25, 26, 27, 28, 29, 30] });
    expect(parseProneRanges({ kneeling: '1-20', prone: '21-40', standing: '41-58' }, 60)).toEqual({ ok: false, error: 'unassigned', shots: [59, 60] });
    expect(parseProneRanges({ kneeling: '1-70', prone: '', standing: '' }, 60)).toMatchObject({ ok: false, error: 'out_of_range' });
    expect(parseProneRanges({ kneeling: '1-', prone: '', standing: '' }, 60)).toMatchObject({ ok: false, error: 'syntax' });
    expect(parseProneRanges({ kneeling: '20-10', prone: '', standing: '' }, 60)).toMatchObject({ ok: false, error: 'syntax' });
    expect(parseProneRanges({ kneeling: '', prone: '', standing: '' }, 17)).toEqual({ ok: true, positions: Array(17).fill(null) });
    expect(parseProneRanges({ kneeling: '1-5; 7', prone: ' 6 ', standing: '8-10' }, 10)).toMatchObject({ ok: true });
  });

  it('defaultProneRanges', () => {
    expect(defaultProneRanges(60)).toEqual({ kneeling: '1-20', prone: '21-40', standing: '41-60' });
    expect(defaultProneRanges(46)).toEqual({ kneeling: '', prone: '', standing: '' });
  });
});

describe('disciplineFromSiusName', () => {
  it('maps Training Center and Result Service names', () => {
    expect(disciplineFromSiusName('50m 3x20 NOVO FINALE')).toBeUndefined();
    expect(disciplineFromSiusName('10m AIR RIFLE WOMEN')).toBe('air_rifle');
    expect(disciplineFromSiusName('10m Air Pistol')).toBe('air_pistol');
    expect(disciplineFromSiusName('50m Rifle 3x20')).toBe('smallbore_3p');
    expect(disciplineFromSiusName('50m RIFLE 3 POSITIONS MEN')).toBe('smallbore_3p');
    expect(disciplineFromSiusName('50m RIFLE 3 POSITIONS WOMEN')).toBe('smallbore_3p');
  });
});
