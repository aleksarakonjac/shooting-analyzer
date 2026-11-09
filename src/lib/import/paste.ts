import { validateShot } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedShot, ParsedSiusResult } from '@/lib/domain/types';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';
import { resultFromSeries, seriesFromShots } from './series';

export type PasteResult =
  | { ok: true; result: ParsedSiusResult; timed: number }
  | { ok: false; error: 'empty' }
  | { ok: false; error: 'invalid'; line: number };

const SHOTS_PER_SERIES = 10;
const INDEX = /^(#\d+|\d+\.)$/;
const NUMBER = /^\d+([.,]\d+)?\*?$/;
const CLOCK = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;
const ISO_WALL = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)$/;

function clockToMs(m: RegExpExecArray, date: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const ms = m[4] ? Number(m[4].padEnd(3, '0')) : 0;
  return zonedWallTimeToUtcMs(y, mo, d, +m[1], +m[2], +m[3], ms, tz);
}

/** One shot per line: optional number ("12", "12." or "#12"), the value (comma or point, "*" = inner ten), optional time. */
function parseLine(line: string, d: DisciplineId, date: string, tz: string): ParsedShot | null {
  let tokens = line.split(/[\s;]+/).filter(Boolean);
  let tMs: number | undefined;

  // Time at the end: "19:03:09.250", "2026-10-21 19:03:09" or an ISO timestamp.
  const last = tokens[tokens.length - 1];
  const clock = last ? CLOCK.exec(last) : null;
  if (clock) {
    const before = tokens[tokens.length - 2];
    const day = before && DATE.test(before) ? before : date;
    tMs = clockToMs(clock, day, tz);
    tokens = tokens.slice(0, before && DATE.test(before) ? -2 : -1);
  } else if (last && ISO_ZONED.test(last)) {
    const parsed = Date.parse(last);
    if (Number.isNaN(parsed)) return null;
    tMs = parsed;
    tokens = tokens.slice(0, -1);
  } else if (last && ISO_WALL.test(last)) {
    // No zone in the timestamp: it is wall time at the venue.
    const [, day, time] = ISO_WALL.exec(last)!;
    tMs = clockToMs(CLOCK.exec(time)!, day, tz);
    tokens = tokens.slice(0, -1);
  }

  // A leading shot number: marked ("12." / "#12") or followed by the value.
  if (tokens.length === 2 && (INDEX.test(tokens[0]) || /^\d+$/.test(tokens[0]))) tokens = tokens.slice(1);
  else if (tokens.length === 2 && INDEX.test(tokens[0])) tokens = tokens.slice(1);
  if (tokens.length !== 1 || !NUMBER.test(tokens[0])) return null;

  const inner = tokens[0].endsWith('*');
  const value = Number(tokens[0].replace('*', '').replace(',', '.'));
  if (!validateShot(d, value)) return null;
  return { value, ...(inner ? { inner } : {}), ...(tMs !== undefined ? { tMs } : {}) };
}

/** Raw pasted lines (scores, optionally with times) into series of ten. */
export function parsePastedShots(text: string, opts: { disciplineId: DisciplineId; date: string; tz: string }): PasteResult {
  const shots: ParsedShot[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const shot = parseLine(line, opts.disciplineId, opts.date, opts.tz);
    if (!shot) return { ok: false, error: 'invalid', line: i + 1 };
    shots.push(shot);
  }
  if (shots.length === 0) return { ok: false, error: 'empty' };
  const series = [];
  for (let i = 0; i < shots.length; i += SHOTS_PER_SERIES) {
    series.push(seriesFromShots(opts.disciplineId, series.length + 1, shots.slice(i, i + SHOTS_PER_SERIES)));
  }
  return { ok: true, result: resultFromSeries(opts.disciplineId, series), timed: shots.filter((s) => s.tMs !== undefined).length };
}
