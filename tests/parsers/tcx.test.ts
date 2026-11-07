import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hrWindow, parseTcx, reinterpretAsZone } from '@/lib/parsers/tcx';

const read = (n: string) => readFileSync(join(__dirname, '../fixtures', n), 'utf8');
const real = read('4740240563405875576.tcx');
const small = read('hr-small.tcx');

const EMPTY = `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Other"><Lap><Track></Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

describe('parseTcx (real Fitbit sample)', () => {
  it('reads 1472 samples with expected bpm range', () => {
    const { samples } = parseTcx(real);
    expect(samples).toHaveLength(1472);
    expect(samples[0].bpm).toBe(95);
    expect(Math.min(...samples.map((s) => s.bpm))).toBe(74);
    expect(Math.max(...samples.map((s) => s.bpm))).toBe(120);
  });

  it('honours the written +03:00 offset', () => {
    const { samples, startLocalAsWritten } = parseTcx(real);
    expect(new Date(samples[0].tMs).toISOString()).toBe('2026-11-04T05:54:50.000Z');
    expect(startLocalAsWritten.startsWith('2026-11-04T08:54:50')).toBe(true);
  });

  it('is sorted ascending', () => {
    const { samples } = parseTcx(real);
    for (let i = 1; i < samples.length; i++) expect(samples[i].tMs).toBeGreaterThanOrEqual(samples[i - 1].tMs);
  });
});

describe('reinterpretAsZone (wrong offset label, Review Focus 6)', () => {
  it('treats 08:54:50 as Belgrade local time (UTC+1 in November)', () => {
    const s = reinterpretAsZone(real, 'Europe/Belgrade');
    expect(s).toHaveLength(1472);
    expect(new Date(s[0].tMs).toISOString()).toBe('2026-11-04T07:54:50.000Z');
  });

  it('ignores the written offset entirely', () => {
    const s = reinterpretAsZone(small, 'UTC');
    expect(new Date(s[0].tMs).toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });
});

describe('parseTcx edge cases (Review Focus 5)', () => {
  it('skips trackpoints without heart rate and sorts', () => {
    const { samples } = parseTcx(small);
    expect(samples.map((s) => s.bpm)).toEqual([70, 80, 90, 100]);
  });

  it('returns empty samples for a file with zero trackpoints', () => {
    const r = parseTcx(EMPTY);
    expect(r.samples).toEqual([]);
    expect(r.startLocalAsWritten).toBe('');
  });

  it('skips zero-bpm samples', () => {
    const xml = small.replace('<Value>80</Value>', '<Value>0</Value>');
    expect(parseTcx(xml).samples.map((s) => s.bpm)).toEqual([70, 90, 100]);
  });
});

describe('hrWindow', () => {
  const { samples } = parseTcx(small);
  const t0 = samples[0].tMs;

  it('selects samples inside [from, to]', () => {
    expect(hrWindow(samples, t0 + 3000, t0 + 9000, 0).map((s) => s.bpm)).toEqual([80, 90]);
  });

  it('applies the clock offset: corrected time = tMs + offsetMs', () => {
    // offset -5000: sample at t0+9000 becomes t0+4000 (in window), t0+3000 becomes t0-2000 (out)
    const w = hrWindow(samples, t0, t0 + 5000, -5000);
    expect(w.map((s) => s.bpm)).toEqual([90]);
    expect(w[0].tMs).toBe(t0 + 4000);
  });

  it('returns [] for an empty array or a window with no samples', () => {
    expect(hrWindow([], 0, 1000, 0)).toEqual([]);
    expect(hrWindow(samples, t0 + 100000, t0 + 200000, 0)).toEqual([]);
  });
});

describe('parseTcx without a UTC offset', () => {
  const noOffset = small.replaceAll('+01:00', '');

  it('treats offset-less times as UTC (never the device zone) and flags it', () => {
    const r = parseTcx(noOffset);
    expect(new Date(r.samples[0].tMs).toISOString()).toBe('2026-11-04T10:00:00.000Z');
    expect(r.missingOffset).toBe(true);
  });

  it('does not flag files that carry an offset', () => {
    expect(parseTcx(real).missingOffset).toBe(false);
  });
});

describe('startLocalAsWritten', () => {
  it('is the written time of the earliest sample, even when the file is unsorted', () => {
    expect(parseTcx(small).startLocalAsWritten).toBe('2026-11-04T10:00:00.000+01:00');
  });
});
