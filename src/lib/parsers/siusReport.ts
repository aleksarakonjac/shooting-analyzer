import { disciplineFromSiusName } from '@/lib/domain/disciplines';
import type { ParsedSeries, ParsedSiusResult, Position } from '@/lib/domain/types';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

/**
 * The SIUS "Summary" report as positioned labels, whatever file it came in (.prnx, PDF, HTML). The numbers are read
 * back from where each label sits: a value is the label on the same row as its caption, shots are the numbers on the
 * row of "Series N:" from left to right.
 */
const REPORT_TZ = 'Europe/Belgrade';
const NUM = /^-?\d+(?:\.\d+)?$/;
const POSITIONS: Record<string, Position> = { Kneeling: 'kneeling', Prone: 'prone', Standing: 'standing' };
/** Labels whose rows are the same line are at most this far apart (report units, 300 to the inch). */
const ROW_TOLERANCE = 6;
/** An arrow sits right of its shot, centred on the text rather than on its baseline. */
const ARROW_ROW_TOLERANCE = 60;
/** Pages are stacked so a label's order is its page first, then its place on the page. */
export const PAGE_STRIDE = 1_000_000;
/** Report units in a PDF point. */
export const UNITS_PER_POINT = 300 / 72;

export interface SiusReportOptions {
  /** Time zone of the laptop that wrote the report (default Europe/Belgrade). */
  tz?: string;
  /** Order of day and month in the report time. Detected from the numbers when omitted. */
  dateOrder?: 'dmy' | 'mdy';
}

/** A text of the report and where it starts (y grows down). */
export interface Label {
  text: string;
  x: number;
  y: number;
}

/** A direction arrow of the report: the middle of its picture and what it says (see readArrow). */
export interface Arrow {
  x: number;
  y: number;
  direction: string;
}

const sameRow = (a: Label, b: Label) => Math.abs(a.y - b.y) <= ROW_TOLERANCE;

/** The label right of `caption` on its row (the nearest one), when it passes `test`. */
function valueOf(labels: Label[], caption: Label, test: (t: string) => boolean = () => true): Label | undefined {
  return labels
    .filter((l) => l !== caption && sameRow(l, caption) && l.x > caption.x && test(l.text))
    .sort((a, b) => a.x - b.x)[0];
}

function parseReportTime(labels: Label[], opts: SiusReportOptions): { time: Date; ambiguous: boolean } | undefined {
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

/** The report in these labels, or null when they hold none. */
export function parseReportLabels(labels: Label[], opts: SiusReportOptions = {}, arrows: Arrow[] = []): ParsedSiusResult | null {
  const byText = (re: RegExp) => labels.find((l) => re.test(l.text));

  const discipline = labels.find((l) => disciplineFromSiusName(l.text))?.text ?? '';
  const heads = labels
    .filter((l) => /^Series (\d+):$/.test(l.text))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (!discipline || heads.length === 0) return null;

  const positions = labels.filter((l) => l.text in POSITIONS).sort((a, b) => a.y - b.y);

  const series: ParsedSeries[] = heads.map((head, i) => {
    const end = heads[i + 1]?.y ?? Infinity;
    // Everything that belongs to this series sits under its caption, in the same column, before the next series.
    const block = labels.filter((l) => l.y >= head.y - ROW_TOLERANCE && l.y < end - ROW_TOLERANCE && Math.abs(l.x - head.x) <= ROW_TOLERANCE);
    const shots = labels
      .filter((l) => sameRow(l, head) && l.x > head.x && NUM.test(l.text))
      .sort((a, b) => a.x - b.x)
      .map((l, k, row) => {
        const next = row[k + 1]?.x ?? Infinity;
        const arrow = arrows.find((r) => Math.abs(r.y - l.y) <= ARROW_ROW_TOLERANCE && r.x > l.x && r.x < next);
        return { value: Number(l.text), ...(arrow ? { direction: arrow.direction } : {}) };
      });
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
  if (usable.length === 0) return null;
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
