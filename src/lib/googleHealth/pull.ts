import type { HrSample } from '@/lib/parsers/tcx';
import { GoogleHealthError } from './client';
import { buildTcx, tcxFileName } from './tcx';
import { chooseWindows, type Span, type Workout } from './window';

/** Unsaved shot and entered times from the form. On a saved training only the shooter's own are used. */
interface FormTimes {
  shotSpan?: Span | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

export type PullInput = ({ trainingId: string } & FormTimes) | ({ shooterId: string; date: string } & FormTimes);

export interface PullDeps {
  /** Signed-in active user, null otherwise. */
  callerId: string | null;
  /** `coach_of(shooterId)` asked with the caller's own client. */
  isCoachOf(shooterId: string): Promise<boolean>;
  /** A saved training as the caller may see it (row-level security decides), null when not visible. */
  loadTraining(id: string): Promise<{ shooterId: string; date: string; shotSpan: Span | null; training: Span | null } | null>;
  loadLink(shooterId: string): Promise<{ refreshTokenEnc: string; brokenAt: string | null } | null>;
  markBroken(shooterId: string): Promise<void>;
  touch(shooterId: string): Promise<void>;
  decrypt(sealed: string): string;
  google: {
    refresh(refreshToken: string): Promise<string>;
    workouts(accessToken: string, fromDate: string, toDateExclusive: string): Promise<Workout[]>;
    heartRate(accessToken: string, span: Span): Promise<HrSample[]>;
  };
  /** Zone for the file name (the viewer's). */
  tz: string;
}

export type PullError =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'no_data'
  | 'not_connected'
  | 'reconnect'
  | 'not_linked'
  | 'no_window'
  | 'google_unavailable';

export type PullResult =
  | {
      status: 200;
      tcx: string;
      fileName: string;
      workout: Workout | null;
      /** The stretch asked for. */
      range: Span;
      /** First and last sample actually received (the watch may not have synced all of it yet). */
      received: Span & { count: number };
      source: 'shots' | 'workout' | 'training';
    }
  | { status: 401 | 403 | 404 | 409 | 422 | 503; error: PullError };

const fail = (status: 401 | 403 | 404 | 409 | 422 | 503, error: PullError): PullResult => ({ status, error });

const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Civil date of an instant in `tz`, YYYY-MM-DD. */
const civilDate = (ms: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ms);

function span(fromIso: string | null | undefined, toIso: string | null | undefined): Span | null {
  const a = Date.parse(fromIso ?? '');
  const b = Date.parse(toIso ?? '');
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? { fromMs: a, toMs: b } : null;
}

/**
 * Reads the shooter's pulse for one training from Google Health and returns it as a TCX file. The shooter or
 * their coach may ask; a coach only for a frame set by shots or a SHOOTING workout, never by typed times.
 */
export async function pullPulse(input: PullInput, deps: PullDeps): Promise<PullResult> {
  if (!deps.callerId) return fail(401, 'unauthorized');

  let shooterId: string;
  let date: string;
  let shots: Span | null;
  let training: Span | null;
  if ('trainingId' in input) {
    const t = await deps.loadTraining(input.trainingId);
    if (!t) return fail(404, 'not_found');
    ({ shooterId, date, shotSpan: shots, training } = t);
    // The shooter may have loaded SCATT or typed times since saving; a coach gets only what is stored.
    if (deps.callerId === shooterId) {
      shots = input.shotSpan ?? shots;
      training = span(input.startedAt, input.endedAt) ?? training;
    }
  } else {
    shooterId = input.shooterId;
    date = input.date;
    shots = input.shotSpan ?? null;
    training = span(input.startedAt, input.endedAt);
  }

  const isCoach = deps.callerId !== shooterId;
  if (isCoach && !(await deps.isCoachOf(shooterId))) return fail(403, 'forbidden');

  const link = await deps.loadLink(shooterId);
  if (!link) return fail(409, 'not_connected');
  if (link.brokenAt) return fail(409, 'reconnect');

  let refreshToken: string;
  try {
    refreshToken = deps.decrypt(link.refreshTokenEnc);
  } catch {
    // Sealed with another key (the key was changed): only a new connection helps.
    await deps.markBroken(shooterId);
    return fail(409, 'reconnect');
  }

  try {
    const access = await deps.google.refresh(refreshToken);
    // Listed a day either side so a workout past midnight UTC is found, then kept to the training's own date.
    const listed = await deps.google.workouts(access, shiftDate(date, -1), shiftDate(date, 2));
    const workouts = listed.filter((w) => civilDate(w.startMs, deps.tz) === date);
    const win = chooseWindows({ shots, workouts, training, isCoach });
    if (!win.ok) return fail(422, 'no_window');
    const samples = await deps.google.heartRate(access, win.fetch);
    if (samples.length === 0) return fail(404, 'no_data');
    const tcx = buildTcx(samples);
    await deps.touch(shooterId);
    const received = { fromMs: samples[0].tMs, toMs: samples[samples.length - 1].tMs, count: samples.length };
    return { status: 200, tcx, fileName: tcxFileName(samples[0].tMs, deps.tz), workout: win.workout, range: win.fetch, received, source: win.source };
  } catch (e) {
    if (e instanceof GoogleHealthError) {
      // Revoked, expired, or a scope taken back: only a new connection helps.
      if (e.code === 'invalid_grant' || (e.code === 'http' && (e.status === 401 || e.status === 403))) {
        await deps.markBroken(shooterId);
        return fail(409, 'reconnect');
      }
      if (e.code === 'not_linked') return fail(409, 'not_linked');
      return fail(503, 'google_unavailable');
    }
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoOrNull = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined;

/** The request body of the pull route, or null when it is malformed. */
export function parsePullInput(body: unknown): PullInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const times = formTimes(b);
  if (b.trainingId !== undefined) {
    if (typeof b.trainingId !== 'string' || !UUID.test(b.trainingId) || !times) return null;
    const hasTimes = b.shotSpan !== undefined || b.startedAt !== undefined || b.endedAt !== undefined;
    return hasTimes ? { trainingId: b.trainingId, ...times } : { trainingId: b.trainingId };
  }
  if (typeof b.shooterId !== 'string' || !UUID.test(b.shooterId) || typeof b.date !== 'string' || !DATE.test(b.date) || !times) return null;
  return { shooterId: b.shooterId, date: b.date, ...times };
}

function formTimes(b: Record<string, unknown>): Required<FormTimes> | null {
  let shotSpan: Span | null = null;
  if (b.shotSpan !== undefined && b.shotSpan !== null) {
    const s = b.shotSpan as Record<string, unknown>;
    if (typeof s.fromMs !== 'number' || typeof s.toMs !== 'number' || !Number.isFinite(s.fromMs) || !Number.isFinite(s.toMs) || s.toMs < s.fromMs) return null;
    shotSpan = { fromMs: s.fromMs, toMs: s.toMs };
  }
  const startedAt = isoOrNull(b.startedAt);
  const endedAt = isoOrNull(b.endedAt);
  if (startedAt === undefined || endedAt === undefined) return null;
  return { shotSpan, startedAt, endedAt };
}
