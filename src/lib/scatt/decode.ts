/**
 * SCATT Expert `traces.data` blobs: the aim trace of one sighting, as reverse engineered in re/NOTES.md
 * (owner's own licensed program and own data, read for interoperability).
 *
 * blob[0] = 1; then a chained XOR with a 16-byte key; the first plain byte is dropped; two bytes of
 * CRC-16/X-25 over the rest; the rest is Qt qCompress (big-endian length + zlib); inside, a QDataStream:
 * magic, format, version, sample count, flags, then per sample x, y (f32 mm), [angle f32 rad], [trigger i16].
 */

const KEY = Uint8Array.from([0xe3, 0x00, 0xe9, 0x00, 0x34, 0x85, 0x1d, 0x04, 0xf0, 0x95, 0xc0, 0x70, 0x0e, 0x1e, 0xb9, 0xf3]);

export interface TraceSamples {
  /** Aim point, mm from the target centre (x right, y up). */
  x: Float64Array;
  y: Float64Array;
  /** Weapon tilt, radians, when recorded. */
  angle: Float64Array | null;
  /** Trigger pressure, when recorded. */
  trigger: Int16Array | null;
}

/** Qt qChecksum (ISO 3309, CRC-16/X-25). */
export function qChecksum(data: Uint8Array): number {
  let crc = 0xffff;
  for (const b of data) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return ~crc & 0xffff;
}

function decrypt(blob: Uint8Array): Uint8Array {
  if (blob[0] !== 1) throw new Error('Unknown SCATT trace version');
  const out = new Uint8Array(blob.length - 1);
  let prev = 0;
  for (let i = 1; i < blob.length; i++) {
    const c = blob[i];
    out[i - 1] = prev ^ c ^ KEY[(i - 1) % 16];
    prev = c;
  }
  return out;
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeTraceBlob(blob: Uint8Array): Promise<TraceSamples> {
  const plain = decrypt(blob);
  const comp = plain.subarray(3);
  const check = (plain[1] << 8) | plain[2];
  if (qChecksum(comp) !== check) throw new Error('SCATT trace checksum mismatch');
  const length = new DataView(comp.buffer, comp.byteOffset, 4).getUint32(0);
  const d = await inflateZlib(comp.subarray(4));
  if (d.length !== length) throw new Error('SCATT trace length mismatch');
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (v.getInt32(0) !== 0x0a0b0c0d || v.getInt32(4) !== 0x10000010 || v.getInt32(8) !== 2) throw new Error('Unknown SCATT trace format');
  const n = v.getUint16(12);
  const flags = v.getInt8(14);
  const hasAngle = (flags & 1) !== 0;
  const hasTrigger = (flags & 2) !== 0;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const angle = hasAngle ? new Float64Array(n) : null;
  const trigger = hasTrigger ? new Int16Array(n) : null;
  let p = 15;
  for (let i = 0; i < n; i++) {
    x[i] = v.getFloat32(p);
    y[i] = v.getFloat32(p + 4);
    p += 8;
    if (angle) {
      angle[i] = v.getFloat32(p);
      p += 4;
    }
    if (trigger) {
      trigger[i] = v.getInt16(p);
      p += 2;
    }
  }
  if (p !== d.length) throw new Error('SCATT trace size mismatch');
  return { x, y, angle, trigger };
}
