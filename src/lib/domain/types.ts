export type DisciplineId = 'air_rifle' | 'smallbore_3p' | 'air_pistol' | 'smallbore_pistol';

export type Position = 'kneeling' | 'prone' | 'standing';

export interface ParsedShot {
  value: number;
  inner?: boolean;
  direction?: string;
  x?: number;
  y?: number;
  tMs?: number;
}

export interface ParsedSeries {
  index: number;
  position?: Position;
  shots: ParsedShot[];
  total: number;
  totalDecimal?: number;
  mpi?: { x: number; y: number };
  groupMm?: number;
}

export interface ParsedSiusResult {
  discipline: string;
  disciplineId?: DisciplineId;
  reportTime?: Date;
  total: number;
  totalDecimal?: number;
  innerTens?: number;
  series: ParsedSeries[];
}
