import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSiusPdf, parseSiusTokens, UnrecognisedLayoutError } from '@/lib/parsers/siusPdf';

const pdf = new Uint8Array(readFileSync(join(__dirname, '../fixtures/50m Rifle 3x20.pdf')));

// Valid one-page PDF with no text at all.
const EMPTY_PDF = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R/Size 4>>\n%%EOF\n',
);

describe('parseSiusPdf (50m Rifle 3x20 sample)', () => {
  it('reads the match header', async () => {
    const r = await parseSiusPdf(pdf);
    expect(r.discipline).toBe('50m Rifle 3x20');
    expect(r.disciplineId).toBe('smallbore_3p');
    expect(r.total).toBe(590);
    expect(r.innerTens).toBe(38);
    expect(r.totalDecimal).toBe(617.3);
    // 02.10.2026 11:03 Europe/Belgrade (CEST, UTC+2)
    expect(r.reportTime?.toISOString()).toBe('2026-10-02T09:03:00.000Z');
  });

  it('groups six series by position, ten shots each', async () => {
    const r = await parseSiusPdf(pdf);
    expect(r.series).toHaveLength(6);
    expect(r.series.map((s) => s.position)).toEqual([
      'kneeling', 'kneeling', 'prone', 'prone', 'standing', 'standing',
    ]);
    for (const s of r.series) expect(s.shots).toHaveLength(10);
  });

  it('reads kneeling series 1 fully', async () => {
    const s = (await parseSiusPdf(pdf)).series[0];
    expect(s.total).toBe(99);
    expect(s.totalDecimal).toBe(103.2);
    expect(s.mpi).toEqual({ x: -0.45, y: -0.44 });
    expect(s.shots[0]).toEqual({ value: 10, inner: true, direction: '↑' });
    expect(s.shots[1]).toEqual({ value: 9, direction: '↗' });
  });

  it('series totals equal the sum of shot values', async () => {
    for (const s of (await parseSiusPdf(pdf)).series) {
      expect(s.shots.reduce((a, b) => a + b.value, 0)).toBe(s.total);
    }
  });
});

describe('parseSiusPdf (unrecognised)', () => {
  it('throws UnrecognisedLayoutError for a PDF without series blocks', async () => {
    await expect(parseSiusPdf(EMPTY_PDF)).rejects.toBeInstanceOf(UnrecognisedLayoutError);
  });
});

describe('parseSiusTokens', () => {
  it('keeps decimal shot values and their direction', () => {
    const r = parseSiusTokens(['50m Rifle 3x20', 'Kneeling', 'Series: 1', '10.3 \u2191', '9.8x \u2198', 'Total:', '20 20.1']);
    expect(r.series[0].shots).toEqual([
      { value: 10.3, direction: '\u2191' },
      { value: 9.8, inner: true, direction: '\u2198' },
    ]);
  });

  it('a zero-total series does not swallow later tokens such as the page footer', () => {
    const r = parseSiusTokens([
      '50m Rifle 3x20', 'Prone', 'Series: 1', '0 \u2193', '0 \u2190', 'Total:', '0 0.0',
      'MPI [mm]:', 'X 1.5', 'Y -2.0', 'Shots 2', '02.10.2026 12:52', '1/2',
    ]);
    expect(r.series[0].shots).toHaveLength(2);
    expect(r.series[0].total).toBe(0);
    expect(r.series[0].mpi).toEqual({ x: 1.5, y: -2.0 });
  });
});
