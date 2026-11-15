// SIUS Cloud shot JSON → ParsedSiusResult. Pure (no server-only): the training form uses the prone helpers too.
import { DISCIPLINES, disciplineFromSiusName } from '@/lib/domain/disciplines';
import type { ParsedSeries, ParsedShot, ParsedSighterGroup, ParsedSiusResult, Position } from '@/lib/domain/types';
import type { SiusShot, SiusShotGroup, SiusShotsResponse } from './types';

const round1 = (v: number) => Math.round(v * 10) / 10;
const SERIES_SIZE = 10;

const STAGE_POSITION: Record<string, Position> = { kneeling: 'kneeling', prone: 'prone', standing: 'standing' };

/** "50m Rifle Prone" exercises: one block without positions, split by hand into the three positions. */
export function isProneProgram(name: string): boolean {
  return /\b50\s?m rifle prone\b/i.test(name);
}

function parseCoords(c: string | null | undefined): { x?: number; y?: number } {
  if (!c) return {};
  const [xs, ys] = c.split('/');
  const x = Number(xs?.trim());
  const y = Number(ys?.trim());
  return Number.isFinite(x) && Number.isFinite(y) && xs?.trim() !== '' && ys?.trim() !== '' ? { x, y } : {};
}

/**
 * Decimal and whole score of a shot. A score string with "." is the decimal one; one without is the whole ring
 * value, a trailing "x" marking an inner ten. Missing whole → floor of the decimal.
 */
function parseScore(s: SiusShot): { decimal: number; whole: number; innerMark: boolean } {
  const parts = (s.scores?.length ? s.scores : [s.score ?? '0']).map((p) => (p ?? '').trim()).filter(Boolean);
  const decText = parts.find((p) => p.includes('.'));
  const wholeText = parts.find((p) => !p.includes('.'));
  const wholeNum = wholeText !== undefined ? Number(wholeText.replace(/x$/i, '')) : NaN;
  const decimal = decText !== undefined ? Number(decText) : Number.isFinite(wholeNum) ? wholeNum : 0;
  const whole = Number.isFinite(wholeNum) ? wholeNum : Math.floor(decimal);
  return { decimal: Number.isFinite(decimal) ? decimal : 0, whole, innerMark: /x$/i.test(wholeText ?? '') };
}

function toShot(s: SiusShot, decimalValues: boolean): ParsedShot {
  const { decimal, whole, innerMark } = parseScore(s);
  const t = s.timeStamp ? Date.parse(s.timeStamp) : NaN;
  const shot: ParsedShot = {
    value: decimalValues ? decimal : whole,
    inner: Boolean(s.innerTen) || innerMark,
    ...parseCoords(s.coordinates),
  };
  if (Number.isFinite(t)) shot.tMs = t;
  if (!decimalValues) shot.valueDecimal = decimal;
  return shot;
}

/** Totals of a run of shots: decimal disciplines total the decimal values; whole ones total rings and keep the decimal sum. */
function totals(shots: ParsedShot[]): { total: number; totalDecimal?: number } {
  const whole = shots.some((s) => s.valueDecimal !== undefined);
  const sum = round1(shots.reduce((a, s) => a + s.value, 0));
  if (!whole) return { total: sum };
  return { total: sum, totalDecimal: round1(shots.reduce((a, s) => a + (s.valueDecimal ?? s.value), 0)) };
}

function makeSeries(index: number, shots: ParsedShot[], position?: Position): ParsedSeries {
  return { index, ...(position ? { position } : {}), shots, ...totals(shots) };
}

function finish(name: string, series: ParsedSeries[], sighters: ParsedSighterGroup[], base?: ParsedSiusResult): ParsedSiusResult {
  const shots = series.flatMap((s) => s.shots);
  const times = [...shots, ...sighters.flatMap((g) => g.shots)].map((s) => s.tMs).filter((t): t is number => t !== undefined);
  const lastMatch = shots.map((s) => s.tMs).filter((t): t is number => t !== undefined).at(-1);
  const report = lastMatch ?? (times.length ? Math.max(...times) : undefined);
  const t = totals(shots);
  return {
    discipline: base?.discipline ?? name,
    disciplineId: base?.disciplineId ?? disciplineFromSiusName(name),
    ...(report !== undefined ? { reportTime: new Date(report) } : {}),
    total: t.total,
    ...(t.totalDecimal !== undefined ? { totalDecimal: t.totalDecimal } : {}),
    innerTens: shots.filter((s) => s.inner).length,
    series,
    sighters,
  };
}

const groupShots = (groups: SiusShotGroup[] | null | undefined) => (groups ?? []).flatMap((g) => g.shots ?? []);

/**
 * Maps a SIUS shots response. Values follow the ZeroIn discipline: decimal disciplines (and finals) store the
 * decimal score as `value`; whole-ring ones (3x20, prone program, air pistol) store the whole value with the
 * decimal in `valueDecimal`.
 */
export function mapSiusShots(raw: SiusShotsResponse, meta: { name: string; final?: boolean }): ParsedSiusResult {
  const id = disciplineFromSiusName(meta.name);
  const decimalValues = Boolean(meta.final) || !id || DISCIPLINES[id].decimal;
  const series: ParsedSeries[] = [];
  const sighters: ParsedSighterGroup[] = [];

  const addBlock = (groups: SiusShotGroup[] | null | undefined, sight: SiusShotGroup[] | null | undefined, position?: Position) => {
    const sightShots = groupShots(sight).map((s) => toShot(s, decimalValues));
    if (sightShots.length) sighters.push({ beforeSeries: series.length + 1, ...(position ? { position } : {}), shots: sightShots });
    for (const g of groups ?? []) {
      const shots = (g.shots ?? []).map((s) => toShot(s, decimalValues));
      if (shots.length) series.push(makeSeries(series.length + 1, shots, position));
    }
  };

  if (raw.stageResults?.length) {
    for (const st of raw.stageResults) addBlock(st.competitionGroups, st.sightingShots, STAGE_POSITION[st.stageName?.toLowerCase()]);
  } else {
    addBlock(raw.competitionGroups, raw.sightingShots);
  }
  return finish(meta.name, series, sighters);
}

/** Time of the first match shot, for the cross-source duplicate check. */
export function firstShotAt(r: ParsedSiusResult): Date | undefined {
  const t = r.series.flatMap((s) => s.shots).find((s) => s.tMs !== undefined)?.tMs;
  return t !== undefined ? new Date(t) : undefined;
}

export function matchShotCount(r: ParsedSiusResult): number {
  return r.series.reduce((a, s) => a + s.shots.length, 0);
}

// ---- Prone program: position ranges ----

export type ProneRanges = { kneeling: string; prone: string; standing: string };
export type ProneRangesResult =
  | { ok: true; positions: (Position | null)[] }
  | { ok: false; error: 'syntax' | 'out_of_range' | 'overlap' | 'unassigned'; shots: number[] };

const ORDER: Position[] = ['kneeling', 'prone', 'standing'];

export function defaultProneRanges(shotCount: number): ProneRanges {
  return shotCount === 60
    ? { kneeling: '1-20', prone: '21-40', standing: '41-60' }
    : { kneeling: '', prone: '', standing: '' };
}

/** Shot numbers in "1-25, 41-60" (also ";" and single numbers); null on a syntax error. */
function parseList(text: string): number[] | null {
  const out: number[] = [];
  for (const raw of text.split(/[,;]/)) {
    const tok = raw.trim();
    if (!tok) continue;
    const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(tok);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    if (b < a) return null;
    for (let n = a; n <= b; n++) out.push(n);
  }
  return out;
}

/** Which position each shot (1-based, index i = shot i+1) belongs to. All three empty = no positions. */
export function parseProneRanges(ranges: ProneRanges, shotCount: number): ProneRangesResult {
  const lists = ORDER.map((p) => parseList(ranges[p]));
  if (lists.some((l) => l === null)) return { ok: false, error: 'syntax', shots: [] };
  const all = lists as number[][];
  const outside = [...new Set(all.flat().filter((n) => n < 1 || n > shotCount))].sort((a, b) => a - b);
  if (outside.length) return { ok: false, error: 'out_of_range', shots: outside };
  const positions: (Position | null)[] = Array(shotCount).fill(null);
  const doubled = new Set<number>();
  ORDER.forEach((p, k) => {
    for (const n of new Set(all[k])) {
      if (positions[n - 1] !== null) doubled.add(n);
      else positions[n - 1] = p;
    }
  });
  if (doubled.size) return { ok: false, error: 'overlap', shots: [...doubled].sort((a, b) => a - b) };
  if (all.every((l) => l.length === 0)) return { ok: true, positions };
  const missing = positions.flatMap((p, i) => (p === null ? [i + 1] : []));
  if (missing.length) return { ok: false, error: 'unassigned', shots: missing };
  return { ok: true, positions };
}

/**
 * Rebuilds the series in shooting order from per-shot positions: each run of consecutive shots of one position is
 * cut into series of 10 from the run's start. Sighters go before the first series whose first shot comes after
 * them (after the last shot: before the last series).
 */
export function splitByPositions(r: ParsedSiusResult, positions: (Position | null)[]): ParsedSiusResult {
  const shots = r.series.flatMap((s) => s.shots);
  if (positions.length !== shots.length) throw new Error('positions must cover every match shot');
  const series: ParsedSeries[] = [];
  let i = 0;
  while (i < shots.length) {
    const pos = positions[i];
    let j = i;
    while (j < shots.length && positions[j] === pos) j++;
    for (let k = i; k < j; k += SERIES_SIZE) {
      series.push(makeSeries(series.length + 1, shots.slice(k, Math.min(k + SERIES_SIZE, j)), pos ?? undefined));
    }
    i = j;
  }

  const sighterShots = (r.sighters ?? []).flatMap((g) => g.shots);
  const ordered = sighterShots.every((s) => s.tMs !== undefined)
    ? [...sighterShots].sort((a, b) => a.tMs! - b.tMs!)
    : sighterShots;
  const sighters: ParsedSighterGroup[] = [];
  for (const sh of ordered) {
    const before = series.find((s) => sh.tMs !== undefined && (s.shots[0].tMs ?? Infinity) > sh.tMs) ?? series.at(-1);
    const beforeSeries = before?.index ?? 1;
    const last = sighters.at(-1);
    if (last && last.beforeSeries === beforeSeries) last.shots.push(sh);
    else sighters.push({ beforeSeries, ...(before?.position ? { position: before.position } : {}), shots: [sh] });
  }
  return finish(r.discipline, series, sighters, r);
}
