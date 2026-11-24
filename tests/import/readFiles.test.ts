import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeFile, siusKind, UnknownFileError } from '@/lib/import/readFiles';
import { readScatt } from '@/lib/parsers/scatt';

const bytes = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
const file = (name: string, as = name) => new File([bytes(name) as BlobPart], as);
const SCATT = 'export_2026-10-22_14.11.scatt-expert';
// Node finds the sql.js wasm itself.
const opts = { scatt: {} };

describe('describeFile', () => {
  it('reads what a SIUS .prnx holds', async () => {
    expect(await describeFile(file('2026-11-11T195109.prnx'), 'Europe/Belgrade', opts)).toEqual({
      kind: 'sius_prnx',
      meta: { sius: { discipline: 'Air Rifle 60', total: 628.8, shots: 60, atMs: Date.parse('2026-11-11T18:51:09Z') } },
    });
  });

  it('reads what a SCATT file holds', async () => {
    const data = await readScatt(bytes(SCATT));
    const d = await describeFile(file(SCATT), 'Europe/Belgrade', opts);
    expect(d.kind).toBe('scatt');
    const meta = d.meta as { scatt: { shots: number; startMs: number; endMs: number } };
    expect(meta.scatt.shots).toBe(data.shots.length);
    expect(meta.scatt.startMs).toBe(data.sessionStartMs);
    expect(meta.scatt.endMs).toBe(Math.max(...data.shots.map((s) => s.tMs)));
  });

  it('knows a pulse file, by content and not by name', async () => {
    expect(await describeFile(file('hr-small.tcx', 'x.bin'), 'Europe/Belgrade', opts)).toEqual({ kind: 'tcx', meta: null });
  });

  it('refuses what the inbox does not take', async () => {
    const html = file('2026-11-22T173807.html');
    await expect(describeFile(html, 'Europe/Belgrade', opts)).rejects.toBeInstanceOf(UnknownFileError);
    await expect(describeFile(new File(['hello'], 'x.prnx'), 'Europe/Belgrade', opts)).rejects.toBeInstanceOf(UnknownFileError);
    await expect(describeFile(new File([new Uint8Array([0x1f, 0x8b, 8, 0])], 'x.gz'), 'Europe/Belgrade', opts)).rejects.toBeInstanceOf(UnknownFileError);
  });
});

describe('siusKind', () => {
  it('goes by the name', () => {
    expect(siusKind(new File([], 'a.prnx'))).toBe('sius_prnx');
    expect(siusKind(new File([], 'a.HTM'))).toBe('sius_html');
    expect(siusKind(new File([], 'a.pdf'))).toBe('sius_pdf');
    expect(siusKind(new File([], 'a.csv'))).toBe('sius_csv');
  });
});
