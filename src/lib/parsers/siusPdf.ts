import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { disciplineFromSiusName } from '@/lib/domain/disciplines';
import type { ParsedSeries, ParsedShot, ParsedSiusResult, Position } from '@/lib/domain/types';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

export class UnrecognisedLayoutError extends Error {
  constructor(message = 'SIUS PDF layout not recognised') {
    super(message);
    this.name = 'UnrecognisedLayoutError';
  }
}

const REPORT_TZ = 'Europe/Belgrade';
const POSITIONS: Record<string, Position> = { Kneeling: 'kneeling', Prone: 'prone', Standing: 'standing' };
const SHOT = /^(\d+)(x)?\s*(\S+)?$/;

async function extractTokens(data: Uint8Array): Promise<string[]> {
  // pdfjs transfers the buffer; hand it a copy so the caller's bytes survive.
  const task = getDocument({ data: data.slice(), useSystemFonts: true });
  const doc = await task.promise;
  const tokens: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    for (const item of content.items) {
      if ('str' in item) {
        const t = item.str.trim();
        if (t) tokens.push(t);
      }
    }
  }
  await task.destroy();
  return tokens;
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

export async function parseSiusPdf(data: Uint8Array): Promise<ParsedSiusResult> {
  let tokens: string[];
  try {
    tokens = await extractTokens(data);
  } catch (e) {
    throw new UnrecognisedLayoutError(`Cannot read PDF: ${(e as Error).message}`);
  }

  const series: ParsedSeries[] = [];
  let position: Position | undefined;
  let current: ParsedSeries | null = null;
  let expectTotal = false;

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
        continue;
      }
    }
    const x = /^X (-?\d+(?:\.\d+)?)$/.exec(t);
    const y = /^Y (-?\d+(?:\.\d+)?)$/.exec(t);
    if (x) current.mpi = { x: Number(x[1]), y: current.mpi?.y ?? 0 };
    else if (y) current.mpi = { x: current.mpi?.x ?? 0, y: Number(y[1]) };
    else if (current.total === 0 && !expectTotal) {
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
