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
      expect(t.y[Number(idx)]).toBeCloseTo(-Number(y), 6); // the reference keeps SCATT's y down; ours is y up
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

import { MAX_TRACE_BYTES } from '@/lib/scatt/decode';

/** Encrypts a plain payload the way SCATT stores it (inverse of the chained XOR). */
function encrypt(plain: Uint8Array): Uint8Array {
  const KEY = [0xe3, 0x00, 0xe9, 0x00, 0x34, 0x85, 0x1d, 0x04, 0xf0, 0x95, 0xc0, 0x70, 0x0e, 0x1e, 0xb9, 0xf3];
  const out = new Uint8Array(plain.length + 1);
  out[0] = 1;
  let prev = 0;
  for (let i = 0; i < plain.length; i++) {
    const c = plain[i] ^ prev ^ KEY[i % 16];
    out[i + 1] = c;
    prev = c;
  }
  return out;
}

describe('decodeTraceBlob limits', () => {
  it('refuses a trace that declares more data than any real trace can hold, before inflating it', async () => {
    const comp = new Uint8Array(4 + 8);
    new DataView(comp.buffer).setUint32(0, MAX_TRACE_BYTES + 1);
    const crc = qChecksum(comp);
    const plain = new Uint8Array([0, crc >> 8, crc & 0xff, ...comp]);
    await expect(decodeTraceBlob(encrypt(plain))).rejects.toThrow(/too large/);
  });
});
