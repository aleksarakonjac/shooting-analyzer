import { describe, expect, it } from 'vitest';
import { buildTcx, tcxFileName } from '../../src/lib/googleHealth/tcx';
import { parseTcx } from '../../src/lib/parsers/tcx';

const t0 = Date.UTC(2026, 10, 13, 15, 13, 34);

describe('buildTcx', () => {
  it('round trips through parseTcx with explicit UTC offsets', () => {
    const samples = [
      { tMs: t0, bpm: 70 },
      { tMs: t0 + 2000, bpm: 72 },
      { tMs: t0 + 3500, bpm: 75 },
    ];
    const parsed = parseTcx(buildTcx(samples));
    expect(parsed.samples).toEqual(samples);
    expect(parsed.missingOffset).toBe(false);
  });

  it('sorts samples and drops duplicate times', () => {
    const parsed = parseTcx(buildTcx([{ tMs: t0 + 1000, bpm: 80 }, { tMs: t0, bpm: 70 }, { tMs: t0, bpm: 71 }]));
    expect(parsed.samples).toEqual([{ tMs: t0, bpm: 70 }, { tMs: t0 + 1000, bpm: 80 }]);
  });

  it('throws on empty input', () => {
    expect(() => buildTcx([])).toThrow();
  });
});

describe('tcxFileName', () => {
  it('names the file by the first sample in the given zone', () => {
    expect(tcxFileName(Date.UTC(2026, 10, 13, 15, 13), 'Europe/Belgrade')).toBe('google-health-2026-11-13-1613.tcx');
  });
});
