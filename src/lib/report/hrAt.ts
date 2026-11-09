import type { HrSample } from '@/lib/parsers/tcx';

const MAX_GAP_MS = 10_000;
const EDGE_MS = 1_000;

/**
 * Heart rate at one instant (a shot): linear between neighbouring samples no more than 10 s apart,
 * the end sample up to 1 s past either end, otherwise null. `samples` must be sorted by time.
 */
export function hrAt(samples: HrSample[], tMs: number): number | null {
  if (samples.length === 0) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (tMs < first.tMs) return first.tMs - tMs <= EDGE_MS ? first.bpm : null;
  if (tMs > last.tMs) return tMs - last.tMs <= EDGE_MS ? last.bpm : null;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].tMs <= tMs) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  if (a.tMs === tMs) return a.bpm;
  if (b.tMs === tMs) return b.bpm;
  if (b.tMs - a.tMs > MAX_GAP_MS) return null;
  return Math.round((a.bpm + ((b.bpm - a.bpm) * (tMs - a.tMs)) / (b.tMs - a.tMs)) * 10) / 10;
}
