import type { ParsedSiusResult } from '@/lib/domain/types';
import { inboxKindOf } from '@/lib/inbox/upload';
import type { InboxKind, InboxMeta } from '@/lib/inbox/types';
import { decodeText } from '@/lib/parsers/decode';
import type { ReadScattOptions, ScattData } from '@/lib/parsers/scatt';
import { parseSiusCsv } from '@/lib/parsers/siusCsv';
import { looksLikeSiusHtml, parseSiusHtml } from '@/lib/parsers/siusHtml';
import { looksLikePrnx } from '@/lib/parsers/siusPrnx';
import { sha256Hex, type SourceKind } from './uploadSource';

/** Which kind of SIUS report a file is, by its name or type (the stored copy is named after its hash, with the kind's extension). */
export const siusKind = (file: File): SourceKind =>
  /\.prnx$/i.test(file.name) ? 'sius_prnx' : /\.html?$/i.test(file.name) ? 'sius_html' : /pdf/i.test(file.type + file.name) ? 'sius_pdf' : 'sius_csv';

/** Reads a SIUS CSV, PDF, HTML or print-preview (.prnx) report. */
export async function parseSiusFile(file: File, tz: string): Promise<{ parsed: ParsedSiusResult; sha: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = await sha256Hex(bytes);
  if (looksLikePrnx(bytes, file.name)) {
    const { parseSiusPrnx } = await import('@/lib/parsers/siusPrnx');
    return { parsed: await parseSiusPrnx(bytes, { tz }), sha };
  }
  if (/\.pdf$/i.test(file.name) || String.fromCharCode(...bytes.slice(0, 4)) === '%PDF') {
    const [{ parseSiusPdf }, { configurePdfWorker }] = await Promise.all([import('@/lib/parsers/siusPdf'), import('@/lib/parsers/browser')]);
    configurePdfWorker();
    return { parsed: await parseSiusPdf(bytes, { tz }), sha };
  }
  if (looksLikeSiusHtml(bytes, file.name)) return { parsed: parseSiusHtml(decodeText(bytes), { tz }), sha };
  return { parsed: parseSiusCsv(decodeText(bytes), { tz }), sha };
}

/** Reads a SCATT export. `opts` is for callers that are not a browser. */
export async function parseScattFile(file: File, opts?: ReadScattOptions): Promise<{ data: ScattData; sha: string }> {
  const { readScatt } = await import('@/lib/parsers/scatt');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { data: await readScatt(bytes, opts ?? (await import('@/lib/parsers/browser')).scattBrowserOptions), sha: await sha256Hex(bytes) };
}

export class UnknownFileError extends Error {
  constructor() {
    super('Not a file the inbox takes');
    this.name = 'UnknownFileError';
  }
}

/** What a file for the inbox is and holds, read in the browser before it is sent. Throws UnknownFileError. */
export async function describeFile(file: File, tz: string, opts: { scatt?: ReadScattOptions } = {}): Promise<{ kind: InboxKind; meta: InboxMeta }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = inboxKindOf(bytes);
  if (!kind) throw new UnknownFileError();
  if (kind === 'tcx') return { kind, meta: null };
  try {
    if (kind === 'scatt') {
      const { data } = await parseScattFile(file, opts.scatt);
      const times = data.shots.map((s) => s.tMs);
      return { kind, meta: { scatt: { shots: times.length, startMs: data.sessionStartMs, endMs: times.reduce((a, b) => Math.max(a, b), data.sessionStartMs) } } };
    }
    const { parsed } = await parseSiusFile(file, tz);
    const shots = parsed.series.reduce((a, s) => a + s.shots.length, 0);
    return { kind, meta: { sius: { discipline: parsed.discipline, total: parsed.total, shots, atMs: parsed.reportTime?.getTime() ?? null } } };
  } catch {
    throw new UnknownFileError();
  }
}
