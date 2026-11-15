import 'server-only';
import type { ParsedSiusResult } from '@/lib/domain/types';
import { SiusAuthFailure, type SiusAuthError } from './auth';
import { firstShotAt, mapSiusShots, matchShotCount } from './map';
import { findMyRow } from './pick';
import { SiusNotConfigured, SiusNotConnected, SiusReconnectNeeded, SiusUnavailable } from './session';
import type { RankingRow, SiusCompetition, SiusEvent, SiusExercise, SiusPart, SiusShotsResponse } from './types';

// What the SIUS server actions do, with every outside effect passed in (actions.ts wires Supabase and SIUS).
// Access (owner, 2026-11-15): private exercises for the shooter themselves or a linked coach, through the
// shooter's connection; connect/disconnect only for the signed-in user; competition data for any active user.

export type SiusState = {
  state: 'none' | 'broken' | 'unavailable' | 'not_configured' | 'forbidden';
  reason?: string;
};

export interface SiusDeps {
  /** The signed-in, active user; null otherwise. Never taken from input. */
  callerId: string | null;
  isCoachOf(shooterId: string): Promise<boolean>;
  token(shooterId: string): Promise<string>;
  /** Drops the cached access token and gets a new one (after SIUS refused it). */
  renewToken(shooterId: string): Promise<string>;
  connect(userId: string, email: string, password: string): Promise<void>;
  disconnect(userId: string): Promise<void>;
  training: {
    list(accessToken: string, page: { skip: number; take: number }): Promise<{ items: SiusExercise[]; more: boolean }>;
    shots(accessToken: string, exerciseId: string): Promise<SiusShotsResponse>;
  };
  results: {
    competitions(q: { page: number; name: string }): Promise<{ items: SiusCompetition[]; more: boolean }>;
    events(compId: string): Promise<SiusEvent[]>;
    parts(compId: string, eventId: string): Promise<SiusPart[]>;
    ranking(compId: string, eventId: string, partId: string): Promise<RankingRow[]>;
    athleteShots(compId: string, eventId: string, partId: string, athleteRunningId: string): Promise<SiusShotsResponse>;
  };
  /** external_id → live training id, for the shooter's sius_cloud sources among `externalIds`. */
  importedTrainings(shooterId: string, externalIds: string[]): Promise<Map<string, string>>;
  /** A live training of the shooter with the same first shot (± 2 s) and shot count, from any source. */
  duplicateOf(shooterId: string, firstShotMs: number, shotCount: number, externalId: string): Promise<string | null>;
  athleteId(shooterId: string): Promise<string | null>;
  setAthleteId(shooterId: string, identifier: string): Promise<void>;
  shooterName(shooterId: string): Promise<string>;
}

export type ConnectError = SiusAuthError | 'not_configured' | 'limit' | 'forbidden';
export interface PickedResult {
  parsed: ParsedSiusResult;
  /** The SIUS JSON as received, kept as the source file. */
  raw: string;
  externalId: string;
  duplicateOf: string | null;
}
export interface CompetitionSelection {
  compId: string;
  eventId: string;
  partId: string;
  eventName: string;
  partName: string;
}

const PAGE = 20;
const MAX_EMAIL = 254;
const MAX_PASSWORD = 256;

function asState(e: unknown): SiusState {
  if (e instanceof SiusReconnectNeeded) return { state: 'broken', reason: e.reason };
  if (e instanceof SiusNotConnected) return { state: 'none' };
  if (e instanceof SiusNotConfigured) return { state: 'not_configured' };
  if (e instanceof SiusUnavailable) return e.limit ? { state: 'unavailable', reason: 'limit' } : { state: 'unavailable' };
  if (e instanceof SiusAuthFailure) return { state: 'unavailable' };
  throw e;
}

async function mayRead(d: SiusDeps, shooterId: string): Promise<boolean> {
  if (!d.callerId) return false;
  return shooterId === d.callerId || (await d.isCoachOf(shooterId));
}

/** Runs `fn` with the shooter's token; a token SIUS refuses is renewed once. */
async function withToken<T>(d: SiusDeps, shooterId: string, fn: (at: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await d.token(shooterId));
  } catch (e) {
    if (e instanceof SiusAuthFailure && e.kind === 'blocked') return fn(await d.renewToken(shooterId));
    throw e;
  }
}

async function picked(d: SiusDeps, shooterId: string, raw: SiusShotsResponse, name: string, final: boolean, externalId: string): Promise<PickedResult> {
  const parsed = mapSiusShots(raw, { name, final });
  const first = firstShotAt(parsed);
  const duplicateOf = first ? await d.duplicateOf(shooterId, first.getTime(), matchShotCount(parsed), externalId) : null;
  return { parsed, raw: JSON.stringify(raw), externalId, duplicateOf };
}

export async function connectSius(d: SiusDeps, email: string, password: string): Promise<{ ok: true } | { ok: false; error: ConnectError }> {
  if (!d.callerId) return { ok: false, error: 'forbidden' };
  const login = typeof email === 'string' ? email.trim() : '';
  if (!login || login.length > MAX_EMAIL || typeof password !== 'string' || !password || password.length > MAX_PASSWORD) {
    return { ok: false, error: 'bad_password' };
  }
  try {
    await d.connect(d.callerId, login, password);
    return { ok: true };
  } catch (e) {
    if (e instanceof SiusAuthFailure) return { ok: false, error: e.kind };
    if (e instanceof SiusUnavailable) return { ok: false, error: e.limit ? 'limit' : 'unavailable' };
    if (e instanceof SiusNotConfigured) return { ok: false, error: 'not_configured' };
    throw e;
  }
}

export async function disconnectSius(d: SiusDeps): Promise<{ ok: true } | { ok: false; error: 'forbidden' }> {
  if (!d.callerId) return { ok: false, error: 'forbidden' };
  await d.disconnect(d.callerId);
  return { ok: true };
}

export async function exercises(
  d: SiusDeps,
  shooterId: string,
  skip: number,
): Promise<{ items: (SiusExercise & { importedTrainingId: string | null })[]; more: boolean } | SiusState> {
  if (!(await mayRead(d, shooterId))) return { state: 'forbidden' };
  const from = Number.isFinite(skip) ? Math.max(0, Math.floor(skip)) : 0;
  try {
    const page = await withToken(d, shooterId, (at) => d.training.list(at, { skip: from, take: PAGE }));
    const imported = await d.importedTrainings(shooterId, page.items.map((e) => e.exerciseId));
    return { items: page.items.map((e) => ({ ...e, importedTrainingId: imported.get(e.exerciseId) ?? null })), more: page.more };
  } catch (e) {
    return asState(e);
  }
}

export async function exerciseResult(d: SiusDeps, shooterId: string, exerciseId: string, name: string): Promise<PickedResult | SiusState> {
  if (!(await mayRead(d, shooterId))) return { state: 'forbidden' };
  try {
    const raw = await withToken(d, shooterId, (at) => d.training.shots(at, exerciseId));
    return await picked(d, shooterId, raw, name, /\bfinal/i.test(name), exerciseId);
  } catch (e) {
    return asState(e);
  }
}

/** Public lists: any active user. */
async function publicCall<T>(d: SiusDeps, fn: () => Promise<T>): Promise<T | SiusState> {
  if (!d.callerId) return { state: 'forbidden' };
  try {
    return await fn();
  } catch (e) {
    return asState(e);
  }
}

export const competitions = (d: SiusDeps, page: number, name: string) =>
  publicCall(d, () => d.results.competitions({ page: Math.max(1, Math.floor(Number(page) || 1)), name: String(name ?? '').slice(0, 100) }));
export const events = (d: SiusDeps, compId: string) => publicCall(d, () => d.results.events(compId));
export const parts = (d: SiusDeps, compId: string, eventId: string) => publicCall(d, () => d.results.parts(compId, eventId));

const isFinal = (sel: CompetitionSelection) => /\bfinal\b/i.test(sel.partName);

export async function athletePerformance(
  d: SiusDeps,
  shooterId: string,
  sel: CompetitionSelection,
  athleteRunningId: string,
): Promise<PickedResult | SiusState> {
  if (!(await mayRead(d, shooterId))) return { state: 'forbidden' };
  try {
    const raw = await d.results.athleteShots(sel.compId, sel.eventId, sel.partId, athleteRunningId);
    return await picked(d, shooterId, raw, sel.eventName, isFinal(sel), `comp:${sel.partId}:${athleteRunningId}`);
  } catch (e) {
    return asState(e);
  }
}

/** The shooter's own result in a part: by remembered identifier or exact name; otherwise the ranking to pick from. */
export async function myPerformance(
  d: SiusDeps,
  shooterId: string,
  sel: CompetitionSelection,
): Promise<{ found: PickedResult & { row: RankingRow } } | { notFound: true; pick: RankingRow[] } | SiusState> {
  if (!(await mayRead(d, shooterId))) return { state: 'forbidden' };
  try {
    const ranking = await d.results.ranking(sel.compId, sel.eventId, sel.partId);
    const row = findMyRow(ranking, await d.athleteId(shooterId), await d.shooterName(shooterId));
    if (!row) return { notFound: true, pick: ranking };
    const perf = await athletePerformance(d, shooterId, sel, row.athleteRunningId);
    return 'state' in perf ? perf : { found: { ...perf, row } };
  } catch (e) {
    return asState(e);
  }
}

/** Remembers the shooter's athlete identifier after "Da, to sam ja". */
export async function confirmAthlete(d: SiusDeps, shooterId: string, identifier: string): Promise<{ ok: true } | SiusState> {
  if (!(await mayRead(d, shooterId))) return { state: 'forbidden' };
  const id = String(identifier ?? '').trim();
  if (!id || id.length > 64) return { state: 'forbidden' };
  await d.setAthleteId(shooterId, id);
  return { ok: true };
}
