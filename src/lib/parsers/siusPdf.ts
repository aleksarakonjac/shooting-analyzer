import { getDocument, ImageKind, OPS, type PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { disciplineFromSiusName } from '@/lib/domain/disciplines';
import type { ParsedSeries, ParsedShot, ParsedSiusResult, Position } from '@/lib/domain/types';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';
import { readArrow } from './arrow';
import { PAGE_STRIDE, parseReportLabels, UNITS_PER_POINT, type Arrow, type Label, type SiusReportOptions } from './siusReport';

export class UnrecognisedLayoutError extends Error {
  constructor(message = 'SIUS PDF layout not recognised') {
    super(message);
    this.name = 'UnrecognisedLayoutError';
  }
}

const REPORT_TZ = 'Europe/Belgrade';
const POSITIONS: Record<string, Position> = { Kneeling: 'kneeling', Prone: 'prone', Standing: 'standing' };
// value, optional inner-ten 'x', optional direction arrow (U+2190-21FF)
const SHOT = /^(\d+(?:\.\d+)?)(x)?\s*([\u2190-\u21ff]+)?$/;

/** The arrows of the summary report are 24 px pictures of about 7 pt; anything larger is a target or a logo. */
const MAX_ARROW_PT = 16;
const MAX_ARROW_PX = 128;

type Matrix = [number, number, number, number, number, number];
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

interface PdfContent {
  tokens: string[];
  labels: Label[];
  /** Read only on demand: it decodes the pictures of every page. */
  arrows(): Promise<Arrow[]>;
}

/** The direction arrows drawn on a page, in report units. */
async function pageArrows(page: PDFPageProxy, pageIndex: number): Promise<Arrow[]> {
  const [, , , top] = page.view;
  const { fnArray, argsArray } = await page.getOperatorList();
  const arrows: Arrow[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    if (fnArray[i] === OPS.save) stack.push(ctm);
    else if (fnArray[i] === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fnArray[i] === OPS.transform) ctm = times(ctm, argsArray[i] as Matrix);
    else if (fnArray[i] === OPS.paintImageXObject) {
      if (Math.abs(ctm[0]) > MAX_ARROW_PT || Math.abs(ctm[3]) > MAX_ARROW_PT) continue;
      const id = argsArray[i][0] as string;
      const store = id.startsWith('g_') ? page.commonObjs : page.objs;
      const img = await new Promise<PdfImage | null>((resolve) => store.get(id, resolve));
      if (!img?.data || img.kind !== ImageKind.RGBA_32BPP || img.width > MAX_ARROW_PX || img.height > MAX_ARROW_PX) continue;
      const direction = readArrow(img.data, img.width, img.height);
      if (direction === null) continue;
      // A picture fills the unit square of its matrix.
      const x = ctm[4] + (ctm[0] + ctm[2]) / 2;
      const y = ctm[5] + (ctm[1] + ctm[3]) / 2;
      arrows.push({ x: x * UNITS_PER_POINT, y: pageIndex * PAGE_STRIDE + (top - y) * UNITS_PER_POINT, direction });
    }
  }
  return arrows;
}

interface PdfImage {
  width: number;
  height: number;
  kind: number;
  data?: Uint8ClampedArray;
}

async function readPdf<T>(data: Uint8Array, read: (content: PdfContent) => Promise<T>): Promise<T> {
  // pdfjs transfers the buffer; hand it a copy so the caller's bytes survive. Pictures as plain pixels, not bitmaps.
  const task = getDocument({ data: data.slice(), useSystemFonts: true, isOffscreenCanvasSupported: false, isImageDecoderSupported: false });
  try {
    const pages: PDFPageProxy[] = [];
    const tokens: string[] = [];
    const labels: Label[] = [];
    try {
      const doc = await task.promise;
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        pages.push(page);
        const [, , , top] = page.view;
        for (const item of (await page.getTextContent()).items) {
          if (!('str' in item)) continue;
          const text = item.str.trim();
          if (!text) continue;
          tokens.push(text);
          const [x, y] = item.transform.slice(4) as [number, number];
          labels.push({ text, x: x * UNITS_PER_POINT, y: (p - 1) * PAGE_STRIDE + (top - y) * UNITS_PER_POINT });
        }
      }
    } catch (e) {
      throw new UnrecognisedLayoutError(`Cannot read PDF: ${(e as Error).message}`);
    }
    const arrows = async () => (await Promise.all(pages.map(pageArrows))).flat();
    return await read({ tokens, labels, arrows });
  } finally {
    await task.destroy();
  }
}

function parseReportTime(tokens: string[]): Date | undefined {
  for (const t of tokens) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(t);
    if (m) {
      const [d, mo, y, h, mi] = m.slice(1).map(Number);
      return new Date(zonedWallTimeToUtcMs(y, mo, d, h, mi, 0, 0, REPORT_TZ));
    }
  }
  return undefined;
}

/** Reads either SIUS PDF: the match result list ("Series: 1", arrows as text) or the summary report ("Series 1:", arrows as pictures). */
export async function parseSiusPdf(data: Uint8Array, opts: SiusReportOptions = {}): Promise<ParsedSiusResult> {
  return readPdf(data, async ({ tokens, labels, arrows }) => {
    if (!parseReportLabels(labels, opts)) return parseSiusTokens(tokens);
    // Without its arrows a report is still a result.
    const drawn = await arrows().catch(() => []);
    return parseReportLabels(labels, opts, drawn)!;
  });
}

/** Layout logic on the extracted text tokens (exported so edge cases can be tested without a PDF). */
export function parseSiusTokens(tokens: string[]): ParsedSiusResult {
  const series: ParsedSeries[] = [];
  let position: Position | undefined;
  let current: ParsedSeries | null = null;
  let expectTotal = false;
  let closed = false; // series total already read: later tokens are not shots

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in POSITIONS) {
      position = POSITIONS[t];
      current = null;
      continue;
    }
    if (/^Series: \d+$/.test(t)) {
      current = { index: series.length + 1, position, shots: [], total: 0 };
      series.push(current);
      expectTotal = false;
      closed = false;
      continue;
    }
    if (!current) continue;
    if (t === 'Total:') {
      expectTotal = true;
      continue;
    }
    if (expectTotal) {
      const m = /^(\d+)(?: (\d+(?:\.\d+)?))?$/.exec(t);
      if (m) {
        current.total = Number(m[1]);
        if (m[2]) current.totalDecimal = Number(m[2]);
        expectTotal = false;
        closed = true;
        continue;
      }
    }
    const x = /^X (-?\d+(?:\.\d+)?)$/.exec(t);
    const y = /^Y (-?\d+(?:\.\d+)?)$/.exec(t);
    if (x) current.mpi = { x: Number(x[1]), y: current.mpi?.y ?? 0 };
    else if (y) current.mpi = { x: current.mpi?.x ?? 0, y: Number(y[1]) };
    else if (!closed && !expectTotal) {
      const m = SHOT.exec(t);
      if (m) {
        const shot: ParsedShot = { value: Number(m[1]) };
        if (m[2]) shot.inner = true;
        if (m[3]) shot.direction = m[3];
        current.shots.push(shot);
      }
    }
  }

  const usable = series.filter((s) => s.shots.length > 0);
  if (usable.length === 0) throw new UnrecognisedLayoutError('No series blocks found');

  const discipline = tokens.find((t) => disciplineFromSiusName(t)) ?? '';
  const header = tokens.map((t) => /^(\d+)-(\d+)x \((\d+) (\d+(?:\.\d+)?)\)$/.exec(t)).find(Boolean);

  return {
    discipline,
    disciplineId: disciplineFromSiusName(discipline),
    reportTime: parseReportTime(tokens),
    total: header ? Number(header[1]) : usable.reduce((a, s) => a + s.total, 0),
    totalDecimal: header ? Number(header[4]) : undefined,
    innerTens: header ? Number(header[2]) : undefined,
    series: usable,
  };
}
