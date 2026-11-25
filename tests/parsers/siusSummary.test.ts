// The SIUS "Summary" report printed as PDF and exported as HTML: the same session in two files.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSiusPdf } from '@/lib/parsers/siusPdf';
import { looksLikeSiusHtml, NotSiusHtmlError, parseSiusHtml } from '@/lib/parsers/siusHtml';
import { scattTargetFor } from '@/lib/scatt/targets';
import { siusHitPoint } from '@/lib/report/hit';
import type { ParsedSiusResult } from '@/lib/domain/types';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
const pdf = fixture('2026-11-22T173807.pdf');
const htmlBytes = fixture('2026-11-22T173807.html');
const html = new TextDecoder().decode(htmlBytes);

const SHOTS = [
  [10.3, 10.4, 10.8, 10.4, 10.3, 10.6, 10.8, 10.5, 10.9, 10.2],
  [10.3, 10.1, 10.2, 10.6, 10.6, 10.3, 10.8, 10.6, 10.8, 10.7],
  [10.3, 10.6, 10.5, 10.5, 10.8, 10.6, 10.9, 10.7, 10.6, 10.7],
  [10.5, 10.6, 10.8, 10.5, 10.4, 9.9, 10.4, 10.2, 10.4, 10.4],
  [10.5, 10.7, 10.6, 10.7, 10.4, 10.4, 10.4, 10.7, 10.7, 10.3],
  [10.5, 10.3, 10.6, 10.5, 10.5, 10.6, 10.8, 10.6, 10.8, 10.8],
  [10.5, 10.2, 10.4, 10.4, 10.7, 10.3, 9.7, 10.4, 10.7, 10.5],
  [10.5, 10.6, 10.7, 10.5, 10.8, 10.5, 10.5, 10.2, 10.6, 10.5],
];

describe.each<[string, () => Promise<ParsedSiusResult>]>([
  ['PDF', () => parseSiusPdf(pdf)],
  ['HTML', async () => parseSiusHtml(html)],
])('SIUS summary report as %s', (_, parse) => {
  it('reads the header', async () => {
    const r = await parse();
    expect(r.discipline).toBe('Air Rifle 80');
    expect(r.disciplineId).toBe('air_rifle');
    expect(r.total).toBe(841.1);
    expect(r.innerTens).toBe(77);
    // 22/11/2026 17:38:06 Europe/Belgrade (CET, UTC+1)
    expect(r.reportTime?.toISOString()).toBe('2026-11-22T16:38:06.000Z');
    expect(r.reportTimeAmbiguous).toBe(false);
  });

  it('reads every shot in shooting order, over both pages', async () => {
    const r = await parse();
    expect(r.series.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.series.map((s) => s.shots.map((x) => x.value))).toEqual(SHOTS);
  });

  it('reads series totals, MPI and group size', async () => {
    const r = await parse();
    expect(r.series.map((s) => s.total)).toEqual([105.2, 105.0, 106.2, 104.1, 105.4, 106.0, 103.8, 105.4]);
    expect(r.series[0].mpi).toEqual({ x: 0.2, y: -0.2 });
    expect(r.series[6].mpi).toEqual({ x: -0.7, y: 0.1 });
    expect(r.series.map((s) => s.groupMm)).toEqual([7.7, 8.3, 7.0, 8.0, 7.4, 7.2, 8.8, 7.4]);
  });
});

describe('SIUS summary PDF, shot directions', () => {
  it('reads the arrow next to each shot', async () => {
    const r = await parseSiusPdf(pdf);
    expect(r.series[0].shots.map((s) => s.direction![0]).join('')).toBe('→↖↙↙↘→↓↖↓↘');
    for (const s of r.series) for (const x of s.shots) expect(x.direction).toMatch(/^[→↗↑↖←↙↓↘]\d{1,3}$/);
  });

  it('the arrows put each series where the report says its MPI is', async () => {
    const tg = scattTargetFor('air_rifle');
    for (const s of (await parseSiusPdf(pdf)).series) {
      const pts = s.shots.map((x) => siusHitPoint({ value: x.value, x: null, y: null, direction: x.direction ?? null }, true, tg)!);
      // The MPI is printed to a tenth and the scores to a tenth of a ring, which is what is left of the difference.
      expect(Math.abs(pts.reduce((a, p) => a + p.x, 0) / 10 - s.mpi!.x)).toBeLessThan(0.1);
      expect(Math.abs(pts.reduce((a, p) => a + p.y, 0) / 10 - s.mpi!.y)).toBeLessThan(0.1);
    }
  });

  it('reads the report time in the given zone', async () => {
    const r = await parseSiusPdf(pdf, { tz: 'UTC' });
    expect(r.reportTime?.toISOString()).toBe('2026-11-22T17:38:06.000Z');
  });
});

describe('SIUS summary HTML', () => {
  it('has no shot directions: the arrows are pictures outside the file', () => {
    for (const s of parseSiusHtml(html).series) for (const x of s.shots) expect(x.direction).toBeUndefined();
  });

  it('rejects a page that is not a report', () => {
    expect(() => parseSiusHtml('<html><body><table><tr><td>Hello</td></tr></table></body></html>')).toThrow(NotSiusHtmlError);
  });

  it('knows an HTML file by its name or its first tag', () => {
    expect(looksLikeSiusHtml(htmlBytes)).toBe(true);
    expect(looksLikeSiusHtml(new Uint8Array(), 'x.HTM')).toBe(true);
    expect(looksLikeSiusHtml(new TextEncoder().encode('Results,,\nAir Rifle 60'), 'x.csv')).toBe(false);
    expect(looksLikeSiusHtml(pdf, 'x.pdf')).toBe(false);
  });
});
