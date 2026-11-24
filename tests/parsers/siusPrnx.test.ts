import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { siusHitPoint } from '@/lib/report/hit';
import { scattTargetFor } from '@/lib/scatt/targets';
import { NotSiusPrnxError, looksLikePrnx, parsePrnxXml, parseSiusPrnx } from '@/lib/parsers/siusPrnx';

const bytes = new Uint8Array(readFileSync(join(__dirname, '../fixtures/2026-11-11T195109.prnx')));

describe('parseSiusPrnx', () => {
  it('reads the real sample: six series of ten, totals, MPI and group size', async () => {
    const r = await parseSiusPrnx(bytes);
    expect(r.discipline).toBe('Air Rifle 60');
    expect(r.disciplineId).toBe('air_rifle');
    expect(r.total).toBe(628.8);
    expect(r.innerTens).toBe(55);
    expect(r.series).toHaveLength(6);
    for (const s of r.series) expect(s.shots).toHaveLength(10);
    expect(r.series.map((s) => s.total)).toEqual([104.0, 104.7, 106.2, 105.4, 103.9, 104.6]);
    const s1 = r.series[0];
    expect(s1.index).toBe(1);
    // Shots run left to right on the page, as in the CSV report.
    expect(s1.shots.map((s) => s.value)).toEqual([10.6, 10.4, 10.6, 10.4, 10.1, 10.6, 10.4, 10.2, 10.2, 10.5]);
    expect(s1.shots.reduce((a, s) => a + s.value, 0)).toBeCloseTo(s1.total, 5);
    expect(s1.mpi).toEqual({ x: -0.2, y: 0.3 });
    expect(s1.groupMm).toBe(7.8);
    expect(r.series[5].mpi).toEqual({ x: -0.1, y: 0.2 });
    // 11/11/2026 19:51:09 Europe/Belgrade (CET, UTC+1)
    expect(r.reportTime?.toISOString()).toBe('2026-11-11T18:51:09.000Z');
    expect(r.reportTimeAmbiguous).toBe(false);
  });

  it('reads the measured direction of every shot; the two dead-centre 10.9 have a blank arrow', async () => {
    const shots = (await parseSiusPrnx(bytes)).series.flatMap((s) => s.shots);
    expect(shots.filter((s) => /^[→↗↑↖←↙↓↘]\d{1,3}$/.test(s.direction ?? ''))).toHaveLength(58);
    expect(shots.filter((s) => s.direction === '•').map((s) => s.value)).toEqual([10.9, 10.9]);
  });

  it('the arrows put each series where the report says its MPI is', async () => {
    const tg = scattTargetFor('air_rifle');
    for (const s of (await parseSiusPrnx(bytes)).series) {
      const pts = s.shots.map((x) => siusHitPoint({ value: x.value, x: null, y: null, direction: x.direction ?? null }, true, tg)!);
      expect(Math.abs(pts.reduce((a, p) => a + p.x, 0) / 10 - s.mpi!.x)).toBeLessThan(0.1);
      expect(Math.abs(pts.reduce((a, p) => a + p.y, 0) / 10 - s.mpi!.y)).toBeLessThan(0.1);
    }
  });

  it('a broken arrow picture leaves the shot without a direction', async () => {
    const xml = new TextDecoder().decode(gunzipSync(bytes)).replace(/ImageSource="img,iVBOR[^"]{300,700}"/, 'ImageSource="img,iVBORw0KGgoAAAA"');
    const r = await parseSiusPrnx(new Uint8Array(gzipSync(xml)));
    expect(r.total).toBe(628.8);
    expect(r.series.flatMap((s) => s.shots).filter((s) => !s.direction)).toHaveLength(1);
  });

  it('does not touch the bytes it is given', async () => {
    const copy = bytes.slice();
    await parseSiusPrnx(copy);
    expect(copy).toEqual(bytes);
  });

  it('rejects files that are not gzip, or hold no report', async () => {
    await expect(parseSiusPrnx(new TextEncoder().encode('Series 1: 10.0'))).rejects.toBeInstanceOf(NotSiusPrnxError);
    const empty = new Uint8Array(gzipSync('<PreviewSerializer><Page1></Page1></PreviewSerializer>'));
    await expect(parseSiusPrnx(empty)).rejects.toBeInstanceOf(NotSiusPrnxError);
  });

  it('takes the day first unless the numbers say otherwise, and flags a guess', () => {
    const xml = (date: string) =>
      `<P><Page1><Item1 BrickType="Label" Text="${date}" Rect="0,0,10,10" /><Item2 BrickType="Label" Text="Air Rifle 60" Rect="0,20,10,10" />` +
      `<Item3 BrickType="Label" Text="Series 1:" Rect="0,100,10,10" /><Item4 BrickType="Label" Text="10.1" Rect="50,100,10,10" /></Page1></P>`;
    expect(parsePrnxXml(xml('21/10/2026 19:03:09')).reportTimeAmbiguous).toBe(false);
    const swapped = parsePrnxXml(xml('10/21/2026 19:03:09'));
    expect(swapped.reportTime?.toISOString()).toBe('2026-10-21T17:03:09.000Z');
    expect(parsePrnxXml(xml('03/04/2026 10:00:00')).reportTimeAmbiguous).toBe(true);
  });

  it('knows a .prnx by its name or its gzip header', () => {
    expect(looksLikePrnx(new Uint8Array([1, 2]), 'x.PRNX')).toBe(true);
    expect(looksLikePrnx(bytes)).toBe(true);
    expect(looksLikePrnx(new TextEncoder().encode('a,b'), 'x.csv')).toBe(false);
  });
});
