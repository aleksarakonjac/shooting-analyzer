import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { alignMatch, proposeSelection, selectMatchShots } from '@/lib/alignment/align';
import { decodeText } from '@/lib/parsers/decode';
import { parseSiusCsv } from '@/lib/parsers/siusCsv';
import { readScatt, type ScattShot } from '@/lib/parsers/scatt';
import type { ParsedSiusResult } from '@/lib/domain/types';

const fx = (n: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', n)));

let sius: ParsedSiusResult;
let all: ScattShot[];

beforeAll(async () => {
  sius = parseSiusCsv(decodeText(fx('2026-10-21T190309.csv')));
  all = (await readScatt(fx('export_2026-10-22_14.11.scatt-expert'))).shots;
});

const belgradeClock = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ms));

describe('selectMatchShots', () => {
  it('last 80 starts at shot id 50, 18:00:36 Belgrade', () => {
    const r = selectMatchShots(all, { kind: 'last', n: 80 });
    expect(r).toHaveLength(80);
    expect(r[0].id).toBe(50);
    expect(belgradeClock(r[0].tMs)).toBe('18:00:36');
  });

  it('first 80 returns the first 80 shots', () => {
    const r = selectMatchShots(all, { kind: 'first', n: 80 });
    expect(r).toHaveLength(80);
    expect(r[0].id).toBe(1);
    expect(r[79].id).toBe(80);
  });

  it('from shot 50, n 80 equals last 80', () => {
    expect(selectMatchShots(all, { kind: 'from', fromShotId: 50, n: 80 })).toEqual(
      selectMatchShots(all, { kind: 'last', n: 80 }),
    );
  });

  it('returns what exists when n is too large, and [] for an unknown start shot', () => {
    expect(selectMatchShots(all, { kind: 'last', n: 500 })).toHaveLength(129);
    expect(selectMatchShots(all, { kind: 'from', fromShotId: 9999, n: 5 })).toEqual([]);
    expect(selectMatchShots([], { kind: 'last', n: 5 })).toEqual([]);
  });

  it('does not mutate its input', () => {
    const copy = all.slice();
    selectMatchShots(all, { kind: 'last', n: 10 });
    expect(all).toEqual(copy);
  });
});

describe('alignMatch', () => {
  it('80 SIUS shots vs last 80 SCATT shots: mismatch 0, in order', () => {
    const sel = selectMatchShots(all, { kind: 'last', n: 80 });
    const r = alignMatch(sius, sel, []);
    expect(r.countMismatch).toBe(0);
    expect(r.shots).toHaveLength(80);
    expect(r.shots.map((s) => s.order)).toEqual(Array.from({ length: 80 }, (_, i) => i + 1));
    expect(r.shots[0].sius.value).toBe(10.6);
    expect(r.shots[0].scatt?.id).toBe(50);
    expect(r.shots[79].scatt?.id).toBe(129);
  });

  it('103 selected shots give countMismatch -23 and the first 80 are mapped', () => {
    const sel = selectMatchShots(all, { kind: 'last', n: 103 });
    const r = alignMatch(sius, sel, []);
    expect(r.countMismatch).toBe(-23);
    expect(r.shots).toHaveLength(80);
  });

  it('ignoring 3 of 83 selected shots gives mismatch 0 and skips them without breaking order', () => {
    const sel = selectMatchShots(all, { kind: 'last', n: 83 });
    const ignored = [sel[5].id, sel[40].id, sel[70].id];
    const r = alignMatch(sius, sel, ignored);
    expect(r.countMismatch).toBe(0);
    const used = r.shots.map((s) => s.scatt!.id);
    for (const id of ignored) expect(used).not.toContain(id);
    expect(used).toEqual([...used].sort((a, b) => a - b));
  });

  it('fewer SCATT than SIUS shots leaves the tail unmatched with a positive mismatch', () => {
    const sel = selectMatchShots(all, { kind: 'last', n: 78 });
    const r = alignMatch(sius, sel, []);
    expect(r.countMismatch).toBe(2);
    expect(r.shots).toHaveLength(80);
    expect(r.shots[78].scatt).toBeUndefined();
    expect(r.shots[79].scatt).toBeUndefined();
  });
});

describe('proposeSelection', () => {
  it('proposes last N where N is the SIUS shot count', () => {
    expect(proposeSelection(sius, all)).toEqual({ kind: 'last', n: 80 });
  });
});

describe('clock change on 2026-10-25 (Review Focus 3)', () => {
  // 02:00-03:00 local happens twice: CEST (UTC+2) then CET (UTC+1).
  const base = Date.UTC(2026, 9, 25, 0, 0, 0); // 02:00 CEST
  const shots: ScattShot[] = [
    { id: 4, tMs: base + 105 * 60_000, flaggedMatch: true }, // 02:45 CET (second pass)
    { id: 2, tMs: base + 45 * 60_000, flaggedMatch: true }, // 02:45 CEST
    { id: 1, tMs: base + 15 * 60_000, flaggedMatch: true }, // 02:15 CEST
    { id: 3, tMs: base + 75 * 60_000, flaggedMatch: true }, // 02:15 CET (wall clock goes backwards)
  ];

  it('orders by absolute time, not wall-clock', () => {
    const r = selectMatchShots(shots, { kind: 'first', n: 4 });
    expect(r.map((s) => s.id)).toEqual([1, 2, 3, 4]);
    expect(selectMatchShots(shots, { kind: 'last', n: 2 }).map((s) => s.id)).toEqual([3, 4]);
    expect(selectMatchShots(shots, { kind: 'from', fromShotId: 2, n: 2 }).map((s) => s.id)).toEqual([2, 3]);
  });

  it('keeps alignment order across the change', () => {
    const small: ParsedSiusResult = {
      discipline: 'Air Rifle 80', total: 0,
      series: [{ index: 1, total: 0, shots: [{ value: 10 }, { value: 9 }, { value: 8 }, { value: 7 }] }],
    };
    const r = alignMatch(small, selectMatchShots(shots, { kind: 'first', n: 4 }), []);
    expect(r.shots.map((s) => s.scatt!.id)).toEqual([1, 2, 3, 4]);
    expect(r.countMismatch).toBe(0);
  });
});
