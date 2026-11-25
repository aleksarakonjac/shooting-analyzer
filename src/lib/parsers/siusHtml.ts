import type { ParsedSiusResult } from '@/lib/domain/types';
import { parseReportLabels, type Label, type SiusReportOptions } from './siusReport';

/**
 * The SIUS "Summary" report exported as HTML: one table whose cells are the labels of the report. The target pictures
 * and the direction arrows are separate files next to the page, so the HTML alone has no shot directions.
 */
export class NotSiusHtmlError extends Error {
  constructor(message = 'Not a SIUS HTML report') {
    super(message);
    this.name = 'NotSiusHtmlError';
  }
}

/** Distance between table rows and columns as report units; only has to be wider than the report's row tolerance. */
const STEP = 100;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function cellText(html: string): string {
  return html
    .replace(/<br[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,5})|(amp|lt|gt|quot|apos|nbsp));/gi, (_, dec, hex, name) =>
      name ? ENTITIES[name.toLowerCase()] : String.fromCodePoint(dec ? Number(dec) : parseInt(hex, 16)),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

const span = (attrs: string, name: string) => {
  const n = Number(new RegExp(`\\b${name}="?(\\d{1,3})`, 'i').exec(attrs)?.[1] ?? 1);
  return Math.max(1, n);
};

/** Every non-empty cell with its place in the table grid, spans taken into account. */
function readLabels(html: string): Label[] {
  const labels: Label[] = [];
  // Per column, how many more rows a cell from above still covers.
  const covered: number[] = [];
  const rows = html.replace(/<!--[\s\S]*?-->/g, '').split(/<tr\b[^>]*>/i).slice(1);
  rows.forEach((row, y) => {
    const started: number[] = [];
    let col = 0;
    for (const m of row.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
      while (covered[col] > 0) col++;
      const text = cellText(m[2]);
      if (text) labels.push({ text, x: col * STEP, y: y * STEP });
      const rowspan = span(m[1], 'rowspan');
      for (let k = span(m[1], 'colspan'); k > 0; k--) started[col++] = rowspan;
    }
    for (let c = 0; c < Math.max(covered.length, started.length); c++) {
      covered[c] = started[c] ? started[c] - 1 : Math.max(0, (covered[c] ?? 0) - 1);
    }
  });
  return labels;
}

/** Reads a SIUS HTML report from its text. */
export function parseSiusHtml(html: string, opts: SiusReportOptions = {}): ParsedSiusResult {
  const result = parseReportLabels(readLabels(html), opts);
  if (!result) throw new NotSiusHtmlError();
  return result;
}

/** True for an .html file, or for text that starts as an HTML page. */
export function looksLikeSiusHtml(bytes: Uint8Array, name = ''): boolean {
  if (/\.html?$/i.test(name)) return true;
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  return /^(?:<!doctype html|<html)\b/i.test(head);
}
