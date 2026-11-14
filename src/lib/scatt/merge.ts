import type { ScattData, ScattTraceFile } from '@/lib/parsers/scatt';

/**
 * One match can span several SCATT files (the first session ended by itself after a long pause).
 * Shot and trace ids restart in every file, so file k's ids are shifted by k * ID_STRIDE.
 * Files are ordered by session start, so the first file keeps its own ids (single-file
 * sessions stored before merging existed stay valid) and the import form and the report
 * derive the same ids from the same set of files.
 */
export const ID_STRIDE = 1_000_000;

const bySession = <T extends { sessionStartMs: number }>(files: T[]): T[] =>
  [...files].sort((a, b) => a.sessionStartMs - b.sessionStartMs);

/** The shots of all files as one SCATT session (distance and caliber from the earliest file). */
export function mergeScattData(files: ScattData[]): ScattData {
  const sorted = bySession(files);
  if (sorted.length === 1) return sorted[0];
  return {
    sessionStartMs: sorted[0].sessionStartMs,
    // A match split over several files started in the earliest one that says when.
    ...(sorted.some((f) => f.matchStartMs !== undefined) ? { matchStartMs: Math.min(...sorted.flatMap((f) => (f.matchStartMs === undefined ? [] : [f.matchStartMs]))) } : {}),
    distanceM: sorted[0].distanceM,
    caliberMm: sorted[0].caliberMm,
    shots: sorted.flatMap((f, k) => f.shots.map((s) => ({ ...s, id: s.id + k * ID_STRIDE }))),
  };
}

/** The aim traces of all files as one set; ids are shifted as in mergeScattData. */
export function mergeScattTraces(files: ScattTraceFile[]): ScattTraceFile {
  const sorted = bySession(files);
  if (sorted.length === 1) return sorted[0];
  const sampleRate = sorted[0].sampleRate;
  if (sorted.some((f) => f.sampleRate !== sampleRate)) throw new Error('SCATT files differ in sample rate');
  const traces: ScattTraceFile['traces'] = new Map();
  const shots: ScattTraceFile['shots'] = [];
  sorted.forEach((f, k) => {
    const shift = k * ID_STRIDE;
    for (const [id, tr] of f.traces) traces.set(id + shift, tr);
    for (const s of f.shots) shots.push({ ...s, shotId: s.shotId + shift, traceId: s.traceId + shift });
  });
  shots.sort((a, b) => a.timer - b.timer);
  return {
    sampleRate,
    sessionStartMs: sorted[0].sessionStartMs,
    traces,
    shots,
    rawBlob: (id) => sorted[Math.floor(id / ID_STRIDE)]?.rawBlob(id % ID_STRIDE),
  };
}
