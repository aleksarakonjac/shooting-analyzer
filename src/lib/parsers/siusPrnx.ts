import { disciplineFromSiusName } from '@/lib/domain/disciplines';
import type { ParsedSeries, ParsedSiusResult, Position } from '@/lib/domain/types';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

/**
 * SIUS print-preview file (.prnx): the report as the SIUS software lays it out for printing, a gzip-compressed
 * XML of positioned labels (a DevExpress "PreviewSerializer"). The numbers are read back from where each label sits:
 * a value is the label on the same row as its caption, shots are the numbers on the row of "Series N:" from left to right.
 */
export class NotSiusPrnxError extends Error {
  constructor(message = 'Not a SIUS .prnx report') {
    super(message);
    this.name = 'NotSiusPrnxError';
  }
}

const REPORT_TZ = 'Europe/Belgrade';
const NUM = /^-?\d+(?:\.\d+)?$/;
const POSITIONS: Record<string, Position> = { Kneeling: 'kneeling', Prone: 'prone', Standing: 'standing' };
/** A report is a few hundred KB of XML; far more than this inflated means a crafted file. */
const MAX_XML_BYTES = 64 * 1024 * 1024;
/** Labels whose rows are the same line are at most this far apart (report units). */
const ROW_TOLERANCE = 6;
/** Pages are stacked so a label's order is its page first, then its place on the page. */
const PAGE_STRIDE = 1_000_000;

export interface SiusPrnxOptions {
  /** Time zone of the laptop that wrote the report (default Europe/Belgrade). */
  tz?: string;
  /** Order of day and month in the report time. Detected from the numbers when omitted. */
  dateOrder?: 'dmy' | 'mdy';
}

interface Label {
  text: string;
  x: number;
  y: number;
  w: number;
}

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
      const [x, y, w] = rect[1].split(',').map(Number);
      if (![x, y, w].every(Number.isFinite)) continue;
      labels.push({ text: unescapeXml(text[1]).trim(), x, y: page * PAGE_STRIDE + y, w });
    }
  });
  return labels;
}

const sameRow = (a: Label, b: Label) => Math.abs(a.y - b.y) <= ROW_TOLERANCE;

/** The label right of `caption` on its row (the nearest one), when it passes `test`. */
function valueOf(labels: Label[], caption: Label, test: (t: string) => boolean = () => true): Label | undefined {
  return labels
    .filter((l) => l !== caption && sameRow(l, caption) && l.x > caption.x && test(l.text))
    .sort((a, b) => a.x - b.x)[0];
}

function parseReportTime(labels: Label[], opts: SiusPrnxOptions): { time: Date; ambiguous: boolean } | undefined {
  for (const l of labels) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(l.text);
    if (!m) continue;
    const [a, b, y, h, mi, s] = m.slice(1).map(Number);
    let order = opts.dateOrder;
    let ambiguous = false;
    if (!order) {
      if (a > 12) order = 'dmy';
      else if (b > 12) order = 'mdy';
      else {
        order = 'dmy';
        ambiguous = a !== b;
      }
    }
    const [d, mo] = order === 'dmy' ? [a, b] : [b, a];
    return { time: new Date(zonedWallTimeToUtcMs(y, mo, d, h, mi, s, 0, opts.tz ?? REPORT_TZ)), ambiguous };
  }
  return undefined;
}

/** The layout logic on the preview's XML (exported so it can be tested without compressing a file). */
export function parsePrnxXml(xml: string, opts: SiusPrnxOptions = {}): ParsedSiusResult {
  const labels = readLabels(xml);
  const byText = (re: RegExp) => labels.find((l) => re.test(l.text));

  const discipline = labels.find((l) => disciplineFromSiusName(l.text))?.text ?? '';
  const heads = labels
    .filter((l) => /^Series (\d+):$/.test(l.text))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (!discipline || heads.length === 0) throw new NotSiusPrnxError();

  const positions = labels.filter((l) => l.text in POSITIONS).sort((a, b) => a.y - b.y);

  const series: ParsedSeries[] = heads.map((head, i) => {
    const end = heads[i + 1]?.y ?? Infinity;
    // Everything that belongs to this series sits under its caption, in the same column, before the next series.
    const block = labels.filter((l) => l.y >= head.y - ROW_TOLERANCE && l.y < end - ROW_TOLERANCE && Math.abs(l.x - head.x) <= ROW_TOLERANCE);
    const shots = labels
      .filter((l) => sameRow(l, head) && l.x > head.x && NUM.test(l.text))
      .sort((a, b) => a.x - b.x)
      .map((l) => ({ value: Number(l.text) }));
    const total = block.find((l) => l.text === 'Series total:');
    const mpi = block.find((l) => l.text === 'MPI:');
    const group = block.find((l) => l.text === 'Group size:');
    const totalText = total && valueOf(labels, total, (t) => NUM.test(t))?.text;
    const mpiText = mpi && valueOf(labels, mpi)?.text;
    const groupText = group && valueOf(labels, group)?.text;
    const mpiM = mpiText ? /X:\s*(-?\d+(?:\.\d+)?)\s*mm;?\s*Y:\s*(-?\d+(?:\.\d+)?)/i.exec(mpiText) : null;
    const groupM = groupText ? /(\d+(?:\.\d+)?)\s*mm/i.exec(groupText) : null;
    const position = positions.filter((p) => p.y < head.y).at(-1);
    return {
      index: i + 1,
      ...(position ? { position: POSITIONS[position.text] } : {}),
      shots,
      total: totalText ? Number(totalText) : 0,
      ...(mpiM ? { mpi: { x: Number(mpiM[1]), y: Number(mpiM[2]) } } : {}),
      ...(groupM ? { groupMm: Number(groupM[1]) } : {}),
    };
  });
  const usable = series.filter((s) => s.shots.length > 0);
  if (usable.length === 0) throw new NotSiusPrnxError();
  usable.forEach((s, i) => {
    s.index = i + 1;
  });

  const totalCaption = byText(/^Total:$/);
  const tensCaption = byText(/^Inner tens:$/);
  const totalValue = totalCaption && valueOf(labels, totalCaption, (t) => NUM.test(t));
  const tensValue = tensCaption && valueOf(labels, tensCaption, (t) => NUM.test(t));
  const time = parseReportTime(labels, opts);

  return {
    discipline,
    disciplineId: disciplineFromSiusName(discipline),
    reportTime: time?.time,
    reportTimeAmbiguous: time?.ambiguous,
    total: totalValue ? Number(totalValue.text) : Math.round(usable.reduce((a, s) => a + s.total, 0) * 10) / 10,
    innerTens: tensValue ? Number(tensValue.text) : undefined,
    series: usable,
  };
}

/** Reads a SIUS .prnx file (works in the browser and in Node 18+). */
export async function parseSiusPrnx(data: Uint8Array, opts: SiusPrnxOptions = {}): Promise<ParsedSiusResult> {
  return parsePrnxXml(await gunzipText(data), opts);
}

/** True when the bytes are a gzip stream, which is how a .prnx starts. */
export const looksLikePrnx = (bytes: Uint8Array, name = '') => /\.prnx$/i.test(name) || (bytes[0] === 0x1f && bytes[1] === 0x8b);
