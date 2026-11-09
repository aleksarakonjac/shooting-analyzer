export type ShareScope = 'all' | 'training' | 'period';
export interface ShareArgs {
  /** The coach this share is for; without one it applies to every linked coach. */
  coachId?: string;
  trainingId?: string;
  from?: string;
  to?: string;
}
export interface ShareRow {
  shooter_id: string;
  coach_id: string | null;
  scope: ShareScope;
  training_id: string | null;
  from_date: string | null;
  to_date: string | null;
}

const isDate = (s: string | undefined): s is string => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Validates share input and returns exactly the columns that belong to the scope. */
export function buildShareRow(
  shooterId: string,
  scope: ShareScope,
  args: ShareArgs,
): { ok: true; row: ShareRow } | { ok: false } {
  const base = { shooter_id: shooterId, coach_id: args.coachId ?? null, scope, training_id: null, from_date: null, to_date: null };
  if (scope === 'all') return { ok: true, row: base };
  if (scope === 'training') {
    return args.trainingId ? { ok: true, row: { ...base, training_id: args.trainingId } } : { ok: false };
  }
  if (scope === 'period') {
    if (!isDate(args.from) || !isDate(args.to) || args.from > args.to) return { ok: false };
    return { ok: true, row: { ...base, from_date: args.from, to_date: args.to } };
  }
  return { ok: false };
}
