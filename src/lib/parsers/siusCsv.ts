import { disciplineFromSiusName } from '@/lib/domain/disciplines';
import type { ParsedSeries, ParsedSiusResult } from '@/lib/domain/types';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

const NUM = /^-?\d+(?:\.\d+)?$/;
const REPORT_TZ = 'Europe/Belgrade';

const cells = (line: string) => line.split(',').map((c) => c.trim());

/** First number after a label in a row, e.g. "104.5". */
function numAfter(row: string[], label: RegExp): number | undefined {
  const i = row.findIndex((c) => label.test(c));
  if (i < 0) return undefined;
  for (const c of row.slice(i + 1)) if (NUM.test(c)) return Number(c);
  return undefined;
}

function parseMpi(row: string[]): { x: number; y: number } | undefined {
  const text = row.join(' ');
  const m = /X:\s*(-?\d+(?:\.\d+)?)\s*mm;?\s*Y:\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
}

/** Group size is the number before "mm"; the symbol in front of it is ignored (mis-encoded in the wild). */
function parseGroupMm(row: string[]): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*mm/i.exec(row.slice(2).join(' '));
  return m ? Number(m[1]) : undefined;
}

export interface SiusCsvOptions {
  /** Time zone of the laptop that wrote the report (default Europe/Belgrade). */
  tz?: string;
  /** Order of day and month in the report time. Detected from the numbers when omitted. */
  dateOrder?: 'dmy' | 'mdy';
}

function parseReportTime(
  row: string[],
  opts: SiusCsvOptions,
): { time: Date; ambiguous: boolean } | undefined {
  for (const c of row) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(c);
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

export class NotSiusCsvError extends Error {
  constructor(message = 'Not a SIUS CSV report') {
    super(message);
    this.name = 'NotSiusCsvError';
  }
}

export function parseSiusCsv(text: string, opts: SiusCsvOptions = {}): ParsedSiusResult {
  const lines = text.split(/\r?\n/).map(cells);
  const result: ParsedSiusResult = { discipline: '', total: 0, series: [] };
  let current: ParsedSeries | null = null;

  for (const row of lines) {
    const joined = row.join('');
    if (!joined) continue;

    if (!result.discipline && row[0] && !/^results$/i.test(row[0]) && !row[1]) {
      result.discipline = row[0];
      result.disciplineId = disciplineFromSiusName(row[0]);
      const rt = parseReportTime(row, opts);
      result.reportTime = rt?.time;
      result.reportTimeAmbiguous = rt?.ambiguous;
      continue;
    }
    if (/^Total:$/i.test(row[1] ?? '')) {
      result.total = numAfter(row, /^Total:$/i) ?? 0;
      result.innerTens = numAfter(row, /^Inner tens:$/i);
      continue;
    }
    const seriesLabel = /^Series (\d+):$/i.exec(row[3] ?? '');
    if (seriesLabel) {
      current = {
        index: Number(seriesLabel[1]),
        shots: row.slice(4).filter((c) => NUM.test(c)).map((c) => ({ value: Number(c) })),
        total: 0,
      };
      result.series.push(current);
      continue;
    }
    if (current && /^Series total:$/i.test(row[3] ?? '')) {
      current.total = numAfter(row, /^Series total:$/i) ?? 0;
    } else if (current && /^MPI:$/i.test(row[3] ?? '')) {
      current.mpi = parseMpi(row);
    } else if (current && /^Group size:$/i.test(row[3] ?? '')) {
      current.groupMm = parseGroupMm(row);
    }
  }
  if (!result.discipline || result.series.length === 0) throw new NotSiusCsvError();
  return result;
}
