import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cloudPickTarget, prefillSession, restoreCloudResult } from '@/lib/sius/formPrefill';
import { mapSiusShots, parseProneRanges, splitByPositions } from '@/lib/sius/map';
import { siusFromStored } from '@/lib/sessions/storedSius';
import type { SiusShotsResponse } from '@/lib/sius/types';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/sius/${name}`, import.meta.url), 'utf8')) as SiusShotsResponse;

const session = { name: 'ISSF WCh Doha Vazdušna puška Kvalifikacije', eventName: 'ISSF World Championship', place: 'Doha, Qatar', date: '2026-11-03', stage: 'kvalifikacije' as const };

describe('prefillSession', () => {
  it('competition pick fills only empty name', () => {
    expect(prefillSession({ name: 'Moj naziv', eventName: '', place: '', dateTouched: false }, session)).toEqual({
      eventName: 'ISSF World Championship', place: 'Doha, Qatar', trainedOn: '2026-11-03', stage: 'kvalifikacije',
    });
    expect(prefillSession({ name: '  ', eventName: 'Moj događaj', place: 'Beograd', dateTouched: true }, session)).toEqual({
      name: 'ISSF WCh Doha Vazdušna puška Kvalifikacije', stage: 'kvalifikacije',
    });
  });
  it('the competition’s zone always comes along', () => {
    expect(prefillSession({ name: 'x', eventName: 'y', place: 'z', dateTouched: true }, { ...session, stage: null, tz: 'Asia/Qatar' })).toEqual({ tz: 'Asia/Qatar' });
  });
  it('a part without a known stage leaves the stage alone', () => {
    expect(prefillSession({ name: 'x', eventName: 'y', place: 'z', dateTouched: true }, { ...session, stage: null })).toEqual({});
  });
});

describe('cloudPickTarget', () => {
  it('final part picked in qualification session goes to the finale view', () => {
    expect(cloudPickTarget('kvalifikacije', 'finale')).toBe('final');
    expect(cloudPickTarget('finale', undefined)).toBe('final');
    expect(cloudPickTarget('kvalifikacije', 'kvalifikacije')).toBe('match');
    expect(cloudPickTarget('slobodno', null)).toBe('match');
  });
});

describe('restoreCloudResult', () => {
  it('3x20: re-reads the stored JSON with decimals, times and sighters', () => {
    const raw = fx('rifle-3x20.json');
    const stored = mapSiusShots(raw, { name: '50m Rifle 3x20' });
    const r = restoreCloudResult(raw, 'smallbore_3p', stored)!;
    expect(r.series.map((s) => s.position)).toEqual(stored.series.map((s) => s.position));
    expect(r.series[0].shots[0]).toMatchObject({ value: 10, valueDecimal: 10.6, tMs: expect.any(Number) });
    expect(r.sighters).toHaveLength(3);
  });

  it('prone program: the stored split is put back on the re-read shots', () => {
    const raw = fx('prone-60.json');
    const base = mapSiusShots(raw, { name: '50m Rifle Prone' });
    const p = parseProneRanges({ kneeling: '1-25, 41-60', prone: '26-40', standing: '' }, 60);
    const split = splitByPositions(base, p.ok ? p.positions : []);
    // What the edit page rebuilds from the database: series and positions, no times or decimals.
    const fromDb = siusFromStored(
      split.series.map((s) => ({ idx: s.index, position: s.position ?? null, total: s.total, total_decimal: null, mpi_x: null, mpi_y: null, group_mm: null, shots: s.shots.map((x, i) => ({ idx: i + 1, value: x.value, inner: !!x.inner, direction: null, x: null, y: null })) })),
      'smallbore_3p',
    );
    const r = restoreCloudResult(raw, 'smallbore_3p', fromDb)!;
    expect(r.series.map((s) => [s.position, s.shots.length])).toEqual(split.series.map((s) => [s.position, s.shots.length]));
    expect(r.sighters?.map((g) => g.beforeSeries)).toEqual(split.sighters?.map((g) => g.beforeSeries));
    expect(r.series[0].shots[0].valueDecimal).toBeTypeOf('number');
  });

  it('stored shot count differs (edited by hand) → the stored result is kept as it is', () => {
    const raw = fx('prone-60.json');
    const stored = { ...mapSiusShots(raw, { name: '50m Rifle Prone' }), series: [] };
    expect(restoreCloudResult(raw, 'smallbore_3p', stored)).toBe(stored);
  });
});

describe('restoreCloudResult without a stored match', () => {
  it('returns null (a final kept in finals has no match to restore)', () => {
    expect(restoreCloudResult(fx('public-qual.json'), 'air_rifle', null)).toBeNull();
  });
});

