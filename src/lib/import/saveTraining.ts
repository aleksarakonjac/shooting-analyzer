import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSiusResult } from '@/lib/domain/types';
import { alignMatch, selectMatchShots, type MatchSelection } from '@/lib/alignment/align';
import type { ScattData } from '@/lib/parsers/scatt';
import type { HrSample } from '@/lib/parsers/tcx';
import { createClient } from '@/lib/supabase/client';

export interface TrainingDraft {
  disciplineId: DisciplineId;
  trainedOn: string; // YYYY-MM-DD
  /** The training's owner. Defaults to the saving user; a coach names the shooter. */
  shooterId?: string;
  name?: string;
  place?: string;
  notes?: string;
  sius?: ParsedSiusResult;
  scatt?: ScattData;
  selection?: MatchSelection;
  ignoredScattIds: number[];
  hr?: HrSample[];
  hrOffsetMs: number;
  /** The user confirmed the alignment. Unconfirmed drafts are stored as "proposed". */
  confirmed: boolean;
}

export interface PayloadShot {
  idx: number;
  value: number;
  inner: boolean;
  direction: string | null;
  x: number | null;
  y: number | null;
  t_ms: number | null;
  scatt_shot_id: number | null;
}
export interface PayloadSeries {
  idx: number;
  position: string | null;
  total: number;
  total_decimal: number | null;
  mpi_x: number | null;
  mpi_y: number | null;
  group_mm: number | null;
  shots: PayloadShot[];
}
export interface SavePayload {
  training: { shooter_id: string; discipline: DisciplineId; trained_on: string; name: string; place: string; notes: string };
  match: {
    label: string;
    align_state: 'proposed' | 'confirmed';
    selection: (MatchSelection & { ignoredScattIds: number[] }) | null;
    series: PayloadSeries[];
  } | null;
  loose_shots: { kind: 'warmup' | 'attempt'; t_ms: number; scatt_shot_id: number }[];
  hr_offset_ms: number | null;
}

const defaultName = (trainedOn: string, disciplineId: DisciplineId) => {
  const [, mm, dd] = trainedOn.split('-');
  return `${dd}.${mm}. ${DISCIPLINES[disciplineId].nameSr}`;
};

/** Pure: turns a draft into the rows the database function stores. */
export function buildSavePayload(draft: TrainingDraft, userId: string): SavePayload {
  const scattShots = draft.scatt ? [...draft.scatt.shots].sort((a, b) => a.tMs - b.tMs || a.id - b.id) : [];
  const selected = draft.scatt && draft.selection ? selectMatchShots(scattShots, draft.selection) : [];
  const cfg = DISCIPLINES[draft.disciplineId];

  let match: SavePayload['match'] = null;
  const used = new Set<number>();
  if (draft.sius) {
    const aligned = alignMatch(draft.sius, selected, draft.ignoredScattIds).shots;
    let k = 0;
    const series = draft.sius.series.map<PayloadSeries>((s) => {
      const shots = s.shots.map<PayloadShot>((shot, i) => {
        const a = aligned[k++];
        if (a.scatt) used.add(a.scatt.id);
        return {
          idx: i + 1,
          value: shot.value,
          inner: shot.inner ?? false,
          direction: shot.direction ?? null,
          x: shot.x ?? null,
          y: shot.y ?? null,
          t_ms: a.scatt?.tMs ?? shot.tMs ?? null,
          scatt_shot_id: a.scatt?.id ?? null,
        };
      });
      // Decimal disciplines: the parsed series total is the decimal one; the whole-ring total is derived.
      const wholeRings = shots.reduce((sum, x) => sum + Math.floor(x.value), 0);
      return {
        idx: s.index,
        position: s.position ?? null,
        total: cfg.decimal ? wholeRings : s.total,
        total_decimal: cfg.decimal ? (s.totalDecimal ?? s.total) : (s.totalDecimal ?? null),
        mpi_x: s.mpi?.x ?? null,
        mpi_y: s.mpi?.y ?? null,
        group_mm: s.groupMm ?? null,
        shots,
      };
    });
    match = {
      label: '',
      align_state: draft.confirmed ? 'confirmed' : 'proposed',
      selection: draft.selection ? { ...draft.selection, ignoredScattIds: draft.ignoredScattIds } : null,
      series,
    };
  }

  // Every SCATT shot that is not part of the match is kept: probes as warm-up,
  // match-flagged leftovers (restarted or ignored) as failed attempts.
  const loose_shots = scattShots
    .filter((s) => !used.has(s.id))
    .map((s) => ({ kind: s.flaggedMatch ? ('attempt' as const) : ('warmup' as const), t_ms: s.tMs, scatt_shot_id: s.id }));

  return {
    training: {
      shooter_id: draft.shooterId ?? userId,
      discipline: draft.disciplineId,
      trained_on: draft.trainedOn,
      name: draft.name?.trim() || defaultName(draft.trainedOn, draft.disciplineId),
      place: draft.place ?? '',
      notes: draft.notes ?? '',
    },
    match,
    loose_shots,
    hr_offset_ms: draft.hr && draft.hr.length > 0 ? draft.hrOffsetMs : null,
  };
}

interface RpcClient {
  rpc: (fn: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Writes the whole training in one database transaction (the save_training function). */
export async function saveTraining(
  draft: TrainingDraft,
  userId: string,
  client: RpcClient = createClient(),
): Promise<{ trainingId: string }> {
  const { data, error } = await client.rpc('save_training', { payload: buildSavePayload(draft, userId) });
  if (error) throw new Error(error.message);
  return { trainingId: String(data) };
}
