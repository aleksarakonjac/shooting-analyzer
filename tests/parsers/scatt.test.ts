import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotScattFileError, readScatt } from '@/lib/parsers/scatt';

const file = new Uint8Array(readFileSync(join(__dirname, '../fixtures/export_2026-10-22_14.11.scatt-expert')));

describe('readScatt (sample)', () => {
  it('reads 129 shots, 103 match and 26 probe', async () => {
    const r = await readScatt(file);
    expect(r.shots).toHaveLength(129);
    expect(r.shots.filter((s) => s.flaggedMatch)).toHaveLength(103);
    expect(r.shots.filter((s) => !s.flaggedMatch)).toHaveLength(26);
  });

  it('orders shots by time with exact first and last timestamps', async () => {
    const { shots } = await readScatt(file);
    for (let i = 1; i < shots.length; i++) expect(shots[i].tMs).toBeGreaterThan(shots[i - 1].tMs);
    expect(shots[0].tMs).toBe(1792596598645);
    expect(shots[shots.length - 1].tMs).toBe(1792601678571);
  });

  it('reads session start, distance and caliber', async () => {
    const r = await readScatt(file);
    expect(r.sessionStartMs).toBe(1792596582905);
    expect(r.distanceM).toBe(10);
    expect(r.caliberMm).toBe(4.5);
  });

  it('exposes SCATT shot ids (50 is the first of the last 80)', async () => {
    const { shots } = await readScatt(file);
    expect(shots[0].id).toBe(1);
    expect(shots[shots.length - 80].id).toBe(50);
  });

  it('does not mutate the input bytes', async () => {
    const copy = file.slice();
    await readScatt(file);
    expect(file).toEqual(copy);
  });
});

describe('readScatt (invalid input)', () => {
  it('throws NotScattFileError for random bytes', async () => {
    await expect(readScatt(new Uint8Array(randomBytes(4096)))).rejects.toBeInstanceOf(NotScattFileError);
  });

  it('throws NotScattFileError for a SQLite file without SCATT tables', async () => {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('create table t (x integer)');
    const bytes = db.export();
    db.close();
    await expect(readScatt(bytes)).rejects.toBeInstanceOf(NotScattFileError);
  });
});
