import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, Position } from '@/lib/domain/types';
import { defaultPipTop, scoreBand, type ScoreBand } from './target';

export interface RawSeries {
  id: string;
  idx: number;
  position: Position | null;
  total: number | null;
  total_decimal: number | string | null;
  mpi_x: number | string | null;
  mpi_y: number | string | null;
  group_mm: number | string | null;
  shots: { idx: number; value: number | string; inner: boolean | null; t_ms: number | string | null; scatt_shot_id?: number | null }[];
}

export interface ShotView {
  /** Shot number through the whole match, 1-based. */
  n: number;
  idx: number;
  value: number;
  inner: boolean;
  tMs: number | null;
  band: ScoreBand;
  series: number;
  /** The SCATT shot this shot was aligned to, when there is one. */
  scattId: number | null;
}

export interface SeriesView {
  id: string;
  idx: number;
  position: Position | null;
  total: number;
  mpi: { x: number; y: number } | null;
  groupMm: number | null;
  shots: ShotView[];
  firstShot: number;
  lastShot: number;
}

export interface ReportView {
  decimal: boolean;
  /** Score from which a pip is drawn filled (the owner's setting). */
  pipTop: number;
  series: SeriesView[];
  total: number;
  shotCount: number;
  timedShots: number;
}

const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Plain, ordered data for the report panels (server and client alike). */
export function buildReportView(raw: RawSeries[], discipline: DisciplineId, pipTop?: number): ReportView {
  const decimal = DISCIPLINES[discipline].decimal;
  const top = pipTop ?? defaultPipTop(decimal);
  let n = 0;
  const series = [...raw]
    .sort((a, b) => a.idx - b.idx)
    .map((s): SeriesView => {
      const first = n + 1;
      const shots = [...s.shots]
        .sort((a, b) => a.idx - b.idx)
        .map((sh): ShotView => {
          n += 1;
          const value = Number(sh.value);
          return { n, idx: sh.idx, value, inner: Boolean(sh.inner), tMs: num(sh.t_ms), band: scoreBand(value, decimal, top), series: s.idx, scattId: sh.scatt_shot_id ?? null };
        });
      const mx = num(s.mpi_x);
      const my = num(s.mpi_y);
      return {
        id: s.id,
        idx: s.idx,
        position: s.position,
        total: decimal ? (num(s.total_decimal) ?? s.total ?? 0) : (s.total ?? 0),
        mpi: mx !== null && my !== null ? { x: mx, y: my } : null,
        groupMm: num(s.group_mm),
        shots,
        firstShot: shots.length ? first : 0,
        lastShot: shots.length ? n : 0,
      };
    });
  const all = series.flatMap((s) => s.shots);
  return {
    decimal,
    pipTop: top,
    series,
    total: round1(series.reduce((a, s) => a + s.total, 0)),
    shotCount: all.length,
    timedShots: all.filter((s) => s.tMs !== null).length,
  };
}
