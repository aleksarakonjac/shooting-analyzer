import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTraceBlob, qChecksum } from '@/lib/scatt/decode';
import { readScattTraces } from '@/lib/parsers/scatt';

const file = new Uint8Array(readFileSync(join(__dirname, '../fixtures/export_2026-10-22_14.11.scatt-expert')));
const expected = readFileSync(join(__dirname, '../fixtures/scatt/traces_expected.csv'), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => l.split(','));

describe('qChecksum', () => {
  it('is CRC-16/X-25 (check value of "123456789" is 0x906E)', () => {
    expect(qChecksum(new TextEncoder().encode('123456789'))).toBe(0x906e);
  });
});

describe('SCATT traces (sample file)', () => {
  it('decodes every trace: 262 traces, 190735 samples, 129 shots', async () => {
    const r = await readScattTraces(file);
    expect(r.sampleRate).toBe(100);
    expect(r.traces.size).toBe(262);
    let n = 0;
    for (const t of r.traces.values()) n += t.x.length;
    expect(n).toBe(190735);
    expect(r.shots).toHaveLength(129);
  });

  it('gives the same first samples as the reference decoder', async () => {
    const r = await readScattTraces(file);
    for (const [tid, , idx, x, y, angle] of expected) {
      const t = r.traces.get(Number(tid))!;
      expect(t.x[Number(idx)]).toBeCloseTo(Number(x), 6);
      expect(t.y[Number(idx)]).toBeCloseTo(Number(y), 6);
      expect(t.angle![Number(idx)]).toBeCloseTo(Number(angle), 9);
    }
  });

  it('refuses a blob whose checksum does not match', async () => {
    const r = await readScattTraces(file);
    const blob = r.rawBlob(1)!.slice();
    blob[blob.length - 1] ^= 0xff;
    await expect(decodeTraceBlob(blob)).rejects.toThrow(/checksum/);
  });
});
