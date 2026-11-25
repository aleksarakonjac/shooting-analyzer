import type { ParsedSiusResult } from '@/lib/domain/types';
import { readArrow } from './arrow';
import { decodeSmallPng } from './png';
import { PAGE_STRIDE, parseReportLabels, type Arrow, type Label, type SiusReportOptions } from './siusReport';

/**
 * SIUS print-preview file (.prnx): the report as the SIUS software lays it out for printing, a gzip-compressed
 * XML of positioned labels (a DevExpress "PreviewSerializer"). See siusReport.ts for how the numbers are read back.
 */
export class NotSiusPrnxError extends Error {
  constructor(message = 'Not a SIUS .prnx report') {
    super(message);
    this.name = 'NotSiusPrnxError';
  }
}

/** A report is a few hundred KB of XML; far more than this inflated means a crafted file. */
const MAX_XML_BYTES = 64 * 1024 * 1024;

async function gunzipText(data: Uint8Array): Promise<string> {
  if (data[0] !== 0x1f || data[1] !== 0x8b) throw new NotSiusPrnxError();
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_XML_BYTES) {
        await reader.cancel();
        throw new NotSiusPrnxError('The .prnx file is too large when unpacked');
      }
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.length;
    }
    return new TextDecoder('utf-8').decode(all);
  } catch (e) {
    if (e instanceof NotSiusPrnxError) throw e;
    throw new NotSiusPrnxError();
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hex, name) =>
    name ? ENTITIES[name.toLowerCase()] : String.fromCodePoint(dec ? Number(dec) : parseInt(hex, 16)),
  );

/** Every label brick of the preview with its text and place, pages stacked in order. */
function readLabels(xml: string): Label[] {
  const labels: Label[] = [];
  const pages = xml.split(/<Page\d+[ >]/);
  // pages[0] is the header before the first page.
  pages.slice(1).forEach((body, page) => {
    for (const m of body.matchAll(/<Item\d+\s+BrickType="Label"((?:[^>"]|"[^"]*")*)>/g)) {
      const attrs = m[1];
      const text = /\sText="([^"]*)"/.exec(attrs);
      const rect = /\sRect="([^"]*)"/.exec(attrs);
      if (!text || !rect) continue;
      const [x, y] = rect[1].split(',').map(Number);
      if (![x, y].every(Number.isFinite)) continue;
      labels.push({ text: unescapeXml(text[1]).trim(), x, y: page * PAGE_STRIDE + y });
    }
  });
  return labels;
}

/** An arrow is 30 units wide and about 400 bytes; the targets and logos are far larger. */
const MAX_ARROW_UNITS = 60;
const MAX_ARROW_BASE64 = 20_000;

/** The direction arrows of the preview: small PNG pictures inside the file, next to their shots. */
async function readArrows(xml: string): Promise<Arrow[]> {
  const found: Promise<Arrow | null>[] = [];
  xml.split(/<Page\d+[ >]/).slice(1).forEach((body, page) => {
    for (const [, attrs, base64] of body.matchAll(/<Item\d+\s((?:[^>"]|"[^"]*")*)>\s*<ImageEntry\s+ImageSource="img,([^"]*)"/g)) {
      const rect = /\sRect="([^"]*)"/.exec(attrs);
      if (!rect || base64.length > MAX_ARROW_BASE64) continue;
      const [x, y, w, h] = rect[1].split(',').map(Number);
      if (![x, y].every(Number.isFinite) || !(w <= MAX_ARROW_UNITS && h <= MAX_ARROW_UNITS)) continue;
      found.push(readArrowPng(base64).then((direction) => (direction ? { x: x + w / 2, y: page * PAGE_STRIDE + y + h / 2, direction } : null)));
    }
  });
  return (await Promise.all(found)).filter((a): a is Arrow => a !== null);
}

async function readArrowPng(base64: string): Promise<string | null> {
  try {
    const img = await decodeSmallPng(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    return img && readArrow(img.data, img.width, img.height);
  } catch {
    return null;
  }
}

/** The layout logic on the preview's XML (exported so it can be tested without compressing a file). */
export function parsePrnxXml(xml: string, opts: SiusReportOptions = {}, arrows: Arrow[] = []): ParsedSiusResult {
  const result = parseReportLabels(readLabels(xml), opts, arrows);
  if (!result) throw new NotSiusPrnxError();
  return result;
}

/** Reads a SIUS .prnx file (works in the browser and in Node 18+). */
export async function parseSiusPrnx(data: Uint8Array, opts: SiusReportOptions = {}): Promise<ParsedSiusResult> {
  const xml = await gunzipText(data);
  // Without its arrows a report is still a result.
  return parsePrnxXml(xml, opts, await readArrows(xml).catch(() => []));
}

/** True when the bytes are a gzip stream, which is how a .prnx starts. */
export const looksLikePrnx = (bytes: Uint8Array, name = '') => /\.prnx$/i.test(name) || (bytes[0] === 0x1f && bytes[1] === 0x8b);
