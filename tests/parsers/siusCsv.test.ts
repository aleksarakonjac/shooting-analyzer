import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NotSiusCsvError, parseSiusCsv } from '@/lib/parsers/siusCsv';
import { decodeText } from '@/lib/parsers/decode';

const bytes = new Uint8Array(readFileSync(join(__dirname, '../fixtures/2026-10-21T190309.csv')));

function expectSample(r: ReturnType<typeof parseSiusCsv>) {
  expect(r.discipline).toBe('Air Rifle 80');
  expect(r.disciplineId).toBe('air_rifle');
  expect(r.total).toBe(841.1);
  expect(r.innerTens).toBe(73);
  expect(r.series).toHaveLength(8);
  for (const s of r.series) expect(s.shots).toHaveLength(10);
  const s1 = r.series[0];
  expect(s1.index).toBe(1);
  expect(s1.shots.map((s) => s.value)).toEqual([10.6, 10.6, 10.6, 10.5, 10.7, 10.5, 10.0, 10.0, 10.5, 10.5]);
  expect(s1.total).toBe(104.5);
  expect(s1.mpi).toEqual({ x: -0.5, y: -0.4 });
  expect(s1.groupMm).toBe(8.0);
  // 21 Oct 2026 19:03:09 Europe/Belgrade (CEST, UTC+2)
  expect(r.reportTime?.toISOString()).toBe('2026-10-21T17:03:09.000Z');
}

describe('parseSiusCsv', () => {
  it('parses the real sample (original bytes)', () => {
    expectSample(parseSiusCsv(decodeText(bytes)));
  });

  it('parses the same file re-encoded as UTF-8 (symbol becomes a real Ø)', () => {
    const latin = Buffer.from(bytes).toString('latin1');
    const utf8 = new Uint8Array(Buffer.from(latin, 'utf8'));
    expect(Buffer.from(utf8).includes(Buffer.from([0xc3, 0x98]))).toBe(true);
    expectSample(parseSiusCsv(decodeText(utf8)));
  });

  it('parses when the group-size symbol is replaced by garbage', () => {
    const garbled = Buffer.from(bytes).toString('latin1').replaceAll('Ø', '�?');
    expectSample(parseSiusCsv(garbled));
  });

  it('series totals match the sum of shots', () => {
    const r = parseSiusCsv(decodeText(bytes));
    for (const s of r.series) {
      const sum = Math.round(s.shots.reduce((a, b) => a + b.value, 0) * 10) / 10;
      expect(sum).toBe(s.total);
    }
  });
});

describe('decodeText', () => {
  it('decodes valid UTF-8 as UTF-8', () => {
    expect(decodeText(new Uint8Array(Buffer.from('Ø ok', 'utf8')))).toBe('Ø ok');
  });
  it('falls back to windows-1252 when UTF-8 is invalid', () => {
    expect(decodeText(new Uint8Array([0xd8, 0x20, 0x6f, 0x6b]))).toBe('Ø ok');
  });
});

describe('decodeText UTF-16', () => {
  const text = 'Air Rifle 80\r\n,Total:,841.1';
  it('decodes UTF-16 LE with BOM', () => {
    const bytes = new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    expect(decodeText(bytes)).toBe(text);
  });
  it('decodes UTF-16 BE with BOM', () => {
    const le = Buffer.from(text, 'utf16le');
    const be = Buffer.from(le).swap16();
    expect(decodeText(new Uint8Array(Buffer.concat([Buffer.from([0xfe, 0xff]), be])))).toBe(text);
  });
});

describe('parseSiusCsv rejects non-SIUS input', () => {
  it.each([['empty string', ''], ['unrelated CSV', 'a,b,c\n1,2,3'], ['semicolon text', 'a;b;c\n1;2;3']])(
    '%s',
    (_n, input) => {
      expect(() => parseSiusCsv(input)).toThrow(NotSiusCsvError);
    },
  );
});

describe('parseSiusCsv report time options', () => {
  const csv = Buffer.from(bytes).toString('latin1');
  const withDate = (d: string) => csv.replace('21/10/2026 19:03:09', d);

  it('uses the given time zone', () => {
    const r = parseSiusCsv(csv, { tz: 'UTC' });
    expect(r.reportTime?.toISOString()).toBe('2026-10-21T19:03:09.000Z');
  });

  it('does not flag a date whose day exceeds 12 as ambiguous', () => {
    expect(parseSiusCsv(csv).reportTimeAmbiguous).toBe(false);
  });

  it('reads a month-first date when the second number cannot be a month', () => {
    const r = parseSiusCsv(withDate('10/21/2026 19:03:09'));
    expect(r.reportTime?.toISOString()).toBe('2026-10-21T17:03:09.000Z');
    expect(r.reportTimeAmbiguous).toBe(false);
  });

  it('flags 05/11/2026 as ambiguous and defaults to day-first', () => {
    const r = parseSiusCsv(withDate('05/11/2026 19:03:09'));
    expect(r.reportTime?.toISOString()).toBe('2026-11-05T18:03:09.000Z');
    expect(r.reportTimeAmbiguous).toBe(true);
  });

  it('honours an explicit dateOrder', () => {
    const r = parseSiusCsv(withDate('05/11/2026 19:03:09'), { dateOrder: 'mdy' });
    expect(r.reportTime?.toISOString()).toBe('2026-05-11T17:03:09.000Z');
    expect(r.reportTimeAmbiguous).toBe(false);
  });
});
