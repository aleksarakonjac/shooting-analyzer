import type { ScoreBand } from './target';
import type { ReportView } from './viewModel';

export interface RhythmPoint {
  /** Shot number through the match. */
  n: number;
  series: number;
  tMs: number;
  value: number;
  band: ScoreBand;
  /** Seconds since the previous timed shot. */
  seconds: number;
  /** The previous timed shot was in another series: the gap holds the break, so it stays out of the mean. */
  afterBreak: boolean;
}

export interface Rhythm {
  points: RhythmPoint[];
  meanS: number | null;
  /** Standard deviation of the in-series gaps, seconds. */
  sdS: number | null;
}

/** Time between consecutive timed shots, with the mean and spread of the gaps inside a series. */
export function shotRhythm(view: ReportView): Rhythm {
  const timed = view.series.flatMap((s) => s.shots).filter((s) => s.tMs !== null);
  const points: RhythmPoint[] = [];
  for (let i = 1; i < timed.length; i++) {
    const a = timed[i - 1];
    const b = timed[i];
    points.push({
      n: b.n,
      series: b.series,
      tMs: b.tMs!,
      value: b.value,
      band: b.band,
      seconds: Math.round((b.tMs! - a.tMs!) / 100) / 10,
      afterBreak: a.series !== b.series,
    });
  }
  const gaps = points.filter((p) => !p.afterBreak).map((p) => p.seconds);
  if (!gaps.length) return { points, meanS: null, sdS: null };
  const mean = gaps.reduce((x, y) => x + y, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((x, y) => x + (y - mean) ** 2, 0) / gaps.length);
  return { points, meanS: Math.round(mean * 10) / 10, sdS: Math.round(sd * 1000) / 1000 };
}
