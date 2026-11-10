import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSiusResult, Position } from '@/lib/domain/types';

type Num = number | string | null;

export interface StoredSeries {
  idx: number;
  position: Position | null;
  total: number | null;
  total_decimal: Num;
  mpi_x: Num;
  mpi_y: Num;
  group_mm: Num;
  shots: { idx: number; value: Num; inner: boolean | null; direction: string | null; x: Num; y: Num }[];
}

const n = (v: Num): number | undefined => (v === null || v === '' ? undefined : Number(v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** A saved match turned back into a parsed result, for sessions whose result was typed or pasted (no stored file). */
export function siusFromStored(series: StoredSeries[], discipline: DisciplineId): ParsedSiusResult {
  const dec = DISCIPLINES[discipline].decimal;
  const out = [...series]
    .sort((a, b) => a.idx - b.idx)
    .map((s) => {
      const td = n(s.total_decimal);
      const mx = n(s.mpi_x);
      const my = n(s.mpi_y);
      return {
        index: s.idx,
        ...(s.position ? { position: s.position } : {}),
        total: dec ? (td ?? s.total ?? 0) : (s.total ?? 0),
        ...(td !== undefined ? { totalDecimal: td } : {}),
        ...(mx !== undefined && my !== undefined ? { mpi: { x: mx, y: my } } : {}),
        ...(n(s.group_mm) !== undefined ? { groupMm: n(s.group_mm) } : {}),
        shots: [...s.shots]
          .sort((a, b) => a.idx - b.idx)
          .map((sh) => ({
            value: Number(sh.value),
            ...(sh.inner ? { inner: true } : {}),
            ...(sh.direction ? { direction: sh.direction } : {}),
            ...(n(sh.x) !== undefined ? { x: n(sh.x) } : {}),
            ...(n(sh.y) !== undefined ? { y: n(sh.y) } : {}),
          })),
      };
    });
  const total = round1(out.reduce((a, s) => a + s.total, 0));
  return {
    discipline: DISCIPLINES[discipline].nameSr,
    disciplineId: discipline,
    total,
    ...(dec ? { totalDecimal: total } : {}),
    series: out,
  };
}
