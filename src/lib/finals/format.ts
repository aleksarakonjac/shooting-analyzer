import type { DisciplineId, Position } from '@/lib/domain/types';
import { parseShotLine } from '@/lib/import/paste';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

export type FinalDiscipline = 'air_rifle' | 'air_pistol' | 'smallbore_3p';

export type FinalStage =
  | { kind: 'series'; shots: number; position?: Position }
  | { kind: 'singles'; shots: number };

/** Spec 6a: 24 shots for the air disciplines, up to 35 for small-bore three positions. */
export const FINAL_FORMATS: Record<FinalDiscipline, FinalStage[]> = {
  air_rifle: [
    { kind: 'series', shots: 5 },
    { kind: 'series', shots: 5 },
    { kind: 'singles', shots: 14 },
  ],
  air_pistol: [
    { kind: 'series', shots: 5 },
    { kind: 'series', shots: 5 },
    { kind: 'singles', shots: 14 },
  ],
  smallbore_3p: [
    { kind: 'series', shots: 10, position: 'kneeling' },
    { kind: 'series', shots: 10, position: 'prone' },
    { kind: 'series', shots: 5, position: 'standing' },
    { kind: 'series', shots: 5, position: 'standing' },
    // Spec 6a: up to 35 shots in all, so 30 in series leave 5 single shots.
    { kind: 'singles', shots: 5 },
  ],
};

export const isFinalDiscipline = (d: DisciplineId): d is FinalDiscipline => d in FINAL_FORMATS;

export function maxFinalShots(d: FinalDiscipline): number {
  return FINAL_FORMATS[d].reduce((n, s) => n + s.shots, 0);
}

const MAX_SHOT = 10.9;

export type ShotCheck = { ok: true } | { ok: false; error: 'range' | 'decimals' };

/** A final shot is scored with one decimal, 0 to 10.9. */
export function validateFinalShot(value: number): ShotCheck {
  if (!Number.isFinite(value)) return { ok: false, error: 'range' };
  if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) return { ok: false, error: 'decimals' };
  if (value < 0 || value > MAX_SHOT) return { ok: false, error: 'range' };
  return { ok: true };
}

/** Stage of a 1-based shot number, and the shot's 1-based place inside that stage. */
export function stageOfShot(d: FinalDiscipline, shotNo: number): { stageIdx: number; indexInStage: number } | undefined {
  if (!Number.isInteger(shotNo) || shotNo < 1) return undefined;
  let rest = shotNo;
  const stages = FINAL_FORMATS[d];
  for (let i = 0; i < stages.length; i++) {
    if (rest <= stages[i].shots) return { stageIdx: i, indexInStage: rest };
    rest -= stages[i].shots;
  }
  return undefined;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Per stage: how many shots were entered and their sum. `values[i]` is shot i + 1 (null = not fired). */
export function stageTotals(
  d: FinalDiscipline,
  values: (number | null)[],
): { stageIdx: number; shots: number; total: number }[] {
  let offset = 0;
  return FINAL_FORMATS[d].map((stage, stageIdx) => {
    const own = values.slice(offset, offset + stage.shots).filter((v): v is number => v !== null);
    offset += stage.shots;
    return { stageIdx, shots: own.length, total: round1(own.reduce((a, b) => a + b, 0)) };
  });
}

export type FinalError = 'empty' | 'gap' | 'range' | 'decimals' | 'eliminated' | 'placement';
export type FinalCheck = { ok: true } | { ok: false; error: FinalError };

/**
 * Checks a final before saving. Shots must run 1..n without gaps. An elimination point is the
 * number of the last shot fired, so it must equal n and be below the format's maximum (the top
 * two shooters fire everything).
 */
export function validateFinal(
  d: FinalDiscipline,
  values: (number | null)[],
  eliminatedAfter: number | null,
  placement: number | null,
): FinalCheck {
  if (values.length > maxFinalShots(d)) return { ok: false, error: 'range' };
  const fired = values.filter((v) => v !== null).length;
  if (fired === 0) return { ok: false, error: 'empty' };
  for (let i = 0; i < fired; i++) if (values[i] === null) return { ok: false, error: 'gap' };
  for (const v of values) {
    if (v === null) continue;
    const c = validateFinalShot(v);
    if (!c.ok) return c;
  }
  if (eliminatedAfter !== null) {
    if (!Number.isInteger(eliminatedAfter) || eliminatedAfter < 1 || eliminatedAfter >= maxFinalShots(d) || eliminatedAfter !== fired) {
      return { ok: false, error: 'eliminated' };
    }
  }
  if (placement !== null && (!Number.isInteger(placement) || placement < 1 || placement > 8)) {
    return { ok: false, error: 'placement' };
  }
  return { ok: true };
}

export type TimestampResult =
  | { ok: true; tMs: number[] }
  | { ok: false; error: 'invalid'; line: number }
  | { ok: false; error: 'toomany' };

const WALL = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;
const EPOCH_MS = /^\d{12,}$/;

function parseOne(text: string, tz: string): number | null {
  if (EPOCH_MS.test(text)) return Number(text);
  const wall = WALL.exec(text);
  if (wall) {
    const [, y, mo, d, h, mi, s, frac] = wall;
    const ms = frac ? Number(frac.padEnd(3, '0')) : 0;
    return zonedWallTimeToUtcMs(Number(y), Number(mo), Number(d), Number(h), Number(mi), Number(s), ms, tz);
  }
  // ISO with an explicit zone (Z or +hh:mm)
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const t = Date.parse(text);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** One timestamp per line, assigned to the shots in order. Wall-clock times are read in `tz`. */
export function parseTimestamps(text: string, tz: string, maxShots: number): TimestampResult {
  const tMs: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const t = parseOne(line, tz);
    if (t === null) return { ok: false, error: 'invalid', line: i + 1 };
    tMs.push(t);
  }
  if (tMs.length > maxShots) return { ok: false, error: 'toomany' };
  return { ok: true, tMs };
}

export type FinalPasteResult =
  | { ok: true; cells: string[]; tMs: (number | null)[] }
  | { ok: false; error: 'invalid'; line: number }
  | { ok: false; error: 'toomany' };

/**
 * Pasted final shots, one per line: optional number, value, optional time ("1. 10.6 19:03:09").
 * Wall-clock times are read on `date` in `tz`. Returns the cell texts and each shot's time (null = none).
 */
export function parseFinalPaste(text: string, date: string, tz: string, maxShots: number): FinalPasteResult {
  const cells: string[] = [];
  const tMs: (number | null)[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    const shot = parseShotLine(line, (v) => validateFinalShot(v).ok, date, tz);
    if (!shot) return { ok: false, error: 'invalid', line: i + 1 };
    cells.push(String(shot.value));
    tMs.push(shot.tMs ?? null);
  }
  if (cells.length > maxShots) return { ok: false, error: 'toomany' };
  return { ok: true, cells, tMs };
}

export interface FinalPayload {
  placement: number | null;
  eliminated_after_shot: number | null;
  shots: { idx: number; stage_idx: number; value: number; t_ms: number | null }[];
}

/** Typed cells ("10,4" or "10.4", blank = not fired; elimination follows from how many were fired) into the save_final payload, or the first problem. */
export function buildFinalPayload(
  d: FinalDiscipline,
  cells: string[],
  placement: string,
  tMs: (number | null)[],
): { ok: true; payload: FinalPayload } | { ok: false; error: FinalError } {
  const values = cells.map((raw) => {
    const s = raw.trim().replace(',', '.');
    return s === '' ? null : Number(s);
  });
  const lastFilled = values.reduce<number>((n, v, i) => (v === null ? n : i + 1), 0);
  const shotValues = values.slice(0, lastFilled);
  // Eliminated after the last shot fired; a full final means not eliminated.
  const elim = lastFilled < maxFinalShots(d) ? lastFilled : null;
  const place = placement.trim() === '' ? null : Number(placement);
  const check = validateFinal(d, shotValues, elim, place);
  if (!check.ok) return check;
  const stages = FINAL_FORMATS[d];
  let stageIdx = 0;
  let left = stages[0].shots;
  const shots = shotValues.map((v, i) => {
    while (left === 0) left = stages[++stageIdx].shots;
    left -= 1;
    return { idx: i + 1, stage_idx: stageIdx, value: v as number, t_ms: tMs[i] ?? null };
  });
  return { ok: true, payload: { placement: place, eliminated_after_shot: elim, shots } };
}
