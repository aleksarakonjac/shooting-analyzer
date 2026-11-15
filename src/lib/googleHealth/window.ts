/** A span of time, Unix epoch milliseconds (UTC), from inclusive, to exclusive. */
export interface Span {
  fromMs: number;
  toMs: number;
}

/** A Google Health workout of type SHOOTING. */
export interface Workout {
  id: string;
  startMs: number;
  endMs: number;
}

export interface WindowInput {
  /** First..last shot time, from any source (SCATT, SIUS). */
  shots: Span | null;
  /** SHOOTING workouts near the training date. */
  workouts: Workout[];
  /** The training's entered start and end time. */
  training: Span | null;
  /** The caller is the shooter's coach, not the shooter: entered times are not a window source for a coach. */
  isCoach: boolean;
}

export type WindowResult =
  | { ok: true; match: Span; fetch: Span; workout: Workout | null; source: 'shots' | 'workout' | 'training' }
  | { ok: false; error: 'no_window' };

/** Pulse kept before and after the match. */
export const MARGIN_MS = 20 * 60_000;
/** Longest stretch of pulse read for one training. */
export const MAX_FETCH_MS = 6 * 3_600_000;

const overlaps = (a: Span, w: Workout) => w.startMs < a.toMs && w.endMs > a.fromMs;
const asSpan = (w: Workout): Span => ({ fromMs: w.startMs, toMs: w.endMs });
const longest = (ws: Workout[]) => ws.reduce<Workout | null>((best, w) => (!best || w.endMs - w.startMs > best.endMs - best.startMs ? w : best), null);

/**
 * What counts as the match (shots first, then a SHOOTING workout, then the entered times) and which stretch of
 * pulse to read for it: the match with a margin, joined with the workout and the entered times, at most 6 h.
 */
export function chooseWindows({ shots, workouts, training, isCoach }: WindowInput): WindowResult {
  const times = isCoach ? null : training;
  let match: Span;
  let source: 'shots' | 'workout' | 'training';
  let workout: Workout | null;
  if (shots) {
    match = shots;
    source = 'shots';
    workout = longest(workouts.filter((w) => overlaps(shots, w)));
  } else if (workouts.length > 0) {
    workout = (training && longest(workouts.filter((w) => overlaps(training, w)))) || longest(workouts);
    match = asSpan(workout!);
    source = 'workout';
  } else if (times) {
    match = times;
    source = 'training';
    workout = null;
  } else {
    return { ok: false, error: 'no_window' };
  }

  const parts: Span[] = [{ fromMs: match.fromMs - MARGIN_MS, toMs: match.toMs + MARGIN_MS }];
  if (workout) parts.push(asSpan(workout));
  if (times) parts.push(times);
  let fetch: Span = { fromMs: Math.min(...parts.map((p) => p.fromMs)), toMs: Math.max(...parts.map((p) => p.toMs)) };
  if (fetch.toMs - fetch.fromMs > MAX_FETCH_MS) {
    const mid = (match.fromMs + match.toMs) / 2;
    fetch = { fromMs: mid - MAX_FETCH_MS / 2, toMs: mid + MAX_FETCH_MS / 2 };
  }
  return { ok: true, match, fetch, workout, source };
}
