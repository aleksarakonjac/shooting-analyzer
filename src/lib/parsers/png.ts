/** The report's arrows are 24 px; nothing larger is decoded. */
const MAX_PX = 128;
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Exactly `size` bytes of a zlib stream, or null when it holds fewer. Reading stops there, whatever follows. */
async function inflate(data: Uint8Array, size: number): Promise<Uint8Array | null> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const out = new Uint8Array(size);
  let at = 0;
  while (at < size) {
    const { done, value } = await reader.read();
    if (done) return null;
    const part = value.subarray(0, size - at);
    out.set(part, at);
    at += part.length;
  }
  await reader.cancel().catch(() => {});
  return out;
}

const paeth = (a: number, b: number, c: number) => {
  const pa = Math.abs(b - c);
  const pb = Math.abs(a - c);
  const pc = Math.abs(a + b - 2 * c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * The RGBA pixels of a small PNG (8-bit RGBA, not interlaced, which is what SIUS writes), or null for any other file.
 * Decoded here and not by the browser so that it also runs in Node, and gives the same pixels everywhere.
 */
export async function decodeSmallPng(png: Uint8Array): Promise<{ width: number; height: number; data: Uint8Array } | null> {
  if (png.length < 33 || SIGNATURE.some((b, i) => png[i] !== b)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const [depth, color, , , interlace] = png.subarray(24, 29);
  if (!(width > 0 && width <= MAX_PX && height > 0 && height <= MAX_PX) || depth !== 8 || color !== 6 || interlace !== 0) return null;

  const idat: Uint8Array[] = [];
  for (let at = 8; at + 12 <= png.length; ) {
    const size = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (type === 'IEND') break;
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + size));
    at += 12 + size;
  }
  const packed = new Uint8Array(idat.reduce((a, c) => a + c.length, 0));
  let end = 0;
  for (const c of idat) {
    packed.set(c, end);
    end += c.length;
  }

  const stride = width * 4;
  let raw: Uint8Array | null;
  try {
    raw = await inflate(packed, (stride + 1) * height);
  } catch {
    return null;
  }
  if (!raw) return null;
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const left = x >= 4 ? data[i - 4] : 0;
      const up = y > 0 ? data[i - stride] : 0;
      const corner = x >= 4 && y > 0 ? data[i - stride - 4] : 0;
      const guess =
        filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, corner) : 0;
      data[i] = raw[y * (stride + 1) + 1 + x] + guess;
    }
  }
  return { width, height, data };
}
