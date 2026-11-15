/** What the target overview draws: one shot, a series, or the match. */
export type OverviewMode = 'shot' | 'series' | 'match';

/** Faintest a hit gets in a series or match view (the first one); the last is fully drawn. */
const FIRST_ALPHA = 0.25;

/**
 * The hits to draw and how visible each is. A selected shot shows alone. Otherwise the chosen scope (series, or the
 * whole match when no series is chosen) shows in shooting order, fading from the first shot to the last, so the
 * later shots stand out.
 */
export function overviewHits<T extends { n: number; series: number }>(
  shots: T[],
  sel: { scope: 'series' | 'match'; series: number | null; shot: number | null },
): { mode: OverviewMode; hits: (T & { alpha: number })[] } {
  if (sel.shot !== null) {
    const one = shots.filter((s) => s.n === sel.shot);
    if (one.length) return { mode: 'shot', hits: one.map((s) => ({ ...s, alpha: 1 })) };
  }
  const mode: OverviewMode = sel.scope === 'series' && sel.series !== null ? 'series' : 'match';
  const list = (mode === 'series' ? shots.filter((s) => s.series === sel.series) : shots).slice().sort((a, b) => a.n - b.n);
  const last = list.length - 1;
  return { mode, hits: list.map((s, i) => ({ ...s, alpha: last <= 0 ? 1 : FIRST_ALPHA + ((1 - FIRST_ALPHA) * i) / last })) };
}
