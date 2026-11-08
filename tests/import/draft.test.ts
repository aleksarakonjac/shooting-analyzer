import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPreview, groupByPosition, parseManualSeries } from '@/lib/import/draft';
import { defaultTrainingName } from '@/lib/import/saveTraining';
import { parseSiusCsv } from '@/lib/parsers/siusCsv';
import { parseSiusPdf } from '@/lib/parsers/siusPdf';
import { readScatt } from '@/lib/parsers/scatt';

const fx = (n: string) => readFileSync(join(__dirname, '../fixtures', n));
const sius = parseSiusCsv(fx('2026-10-21T190309.csv').toString('utf8'));

describe('defaultTrainingName', () => {
  it('is dd.mm. plus the Serbian discipline name', () => {
    expect(defaultTrainingName('2026-11-07', 'air_rifle')).toBe('07.11. Vazdušna puška');
  });
});

describe('groupByPosition', () => {
  it('turns the 3x20 PDF into three position groups of two series', async () => {
    const pdf = await parseSiusPdf(new Uint8Array(fx('50m Rifle 3x20.pdf')));
    const groups = groupByPosition(pdf.series);
    expect(groups.map((g) => g.position)).toEqual(['kneeling', 'prone', 'standing']);
    expect(groups.map((g) => g.series.length)).toEqual([2, 2, 2]);
  });

  it('keeps series without positions in one group', () => {
    const groups = groupByPosition(sius.series);
    expect(groups).toHaveLength(1);
    expect(groups[0].position).toBeUndefined();
    expect(groups[0].series).toHaveLength(8);
  });
});

describe('parseManualSeries', () => {
  it('builds a result from lines of shot values, accepting a decimal comma', () => {
    const r = parseManualSeries('air_rifle', ['10,6 10,5 9,8', '10.0 10.9']);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.series.map((s) => s.shots.map((x) => x.value))).toEqual([[10.6, 10.5, 9.8], [10.0, 10.9]]);
    expect(r.result.series[0].totalDecimal).toBe(30.9);
    expect(r.result.totalDecimal).toBe(51.8);
    expect(r.result.disciplineId).toBe('air_rifle');
  });

  it('accepts a whole-ring discipline and sums it', () => {
    const r = parseManualSeries('air_pistol', ['10 9 8']);
    expect(r.ok && r.result.total).toBe(27);
  });

  it('skips blank lines and rejects an input with no shots', () => {
    expect(parseManualSeries('air_rifle', ['', '  '])).toEqual({ ok: false, error: 'empty' });
  });

  it('names the offending line for an invalid shot value', () => {
    expect(parseManualSeries('air_rifle', ['10.5', '10.55 9.0'])).toEqual({ ok: false, error: 'invalid', line: 2 });
    expect(parseManualSeries('air_pistol', ['10.5'])).toEqual({ ok: false, error: 'invalid', line: 1 });
  });

  it('rejects a series total above the series maximum, but never caps the match', () => {
    expect(parseManualSeries('air_pistol', ['10 10 10 10 10 10 10 10 10 10 10'])).toEqual({
      ok: false,
      error: 'invalid',
      line: 1,
    });
    const many = Array.from({ length: 12 }, () => '10 10 10 10 10 10 10 10 10 10');
    expect(parseManualSeries('air_pistol', many).ok).toBe(true);
  });
});

describe('buildPreview (the two fixtures)', () => {
  it('last 80 aligns with mismatch 0 and the first SIUS shot gets the 50th SCATT shot', async () => {
    const scatt = await readScatt(new Uint8Array(fx('export_2026-10-22_14.11.scatt-expert')));
    const last = buildPreview(sius, scatt, { kind: 'last', n: 80 }, []);
    expect(last.countMismatch).toBe(0);
    expect(last.shots).toHaveLength(80);
    const first = buildPreview(sius, scatt, { kind: 'first', n: 80 }, []);
    expect(first.countMismatch).toBe(0);
    expect(first.shots[0].scatt?.id).not.toBe(last.shots[0].scatt?.id);
  });

  it('without a selection nothing is aligned and the mismatch is the SIUS shot count', async () => {
    const scatt = await readScatt(new Uint8Array(fx('export_2026-10-22_14.11.scatt-expert')));
    const p = buildPreview(sius, scatt, undefined, []);
    expect(p.countMismatch).toBe(80);
    expect(p.shots.every((s) => !s.scatt)).toBe(true);
  });
});
