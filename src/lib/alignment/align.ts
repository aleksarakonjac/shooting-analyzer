import type { ParsedShot, ParsedSiusResult } from '@/lib/domain/types';
import type { ScattShot } from '@/lib/parsers/scatt';

export type MatchSelection =
  | { kind: 'last'; n: number }
  | { kind: 'first'; n: number }
  | { kind: 'from'; fromShotId: number; n: number };

export interface AlignedShot {
  /** 1-based position of the shot within the match (SIUS order). */
  order: number;
  sius: ParsedShot;
  scatt?: ScattShot;
  /**
   * Reserved. Ignoring is done by SCATT shot id (see alignMatch); ignored
   * SCATT shots are skipped and never appear here, so this stays false.
   */
  ignored: boolean;
}

/** Absolute-time order (UTC ms), ties by id; safe across clock changes. */
const byTime = (a: ScattShot, b: ScattShot) => a.tMs - b.tMs || a.id - b.id;

export function selectMatchShots(shots: ScattShot[], sel: MatchSelection): ScattShot[] {
  const sorted = [...shots].sort(byTime);
  const n = Math.max(0, Math.floor(sel.n));
  if (sel.kind === 'first') return sorted.slice(0, n);
  if (sel.kind === 'last') return n === 0 ? [] : sorted.slice(-n);
  const start = sorted.findIndex((s) => s.id === sel.fromShotId);
  return start < 0 ? [] : sorted.slice(start, start + n);
}

const siusShots = (sius: ParsedSiusResult): ParsedShot[] => sius.series.flatMap((s) => s.shots);

/**
 * Maps SIUS shots one to one, contiguously, by order onto the usable (not
 * ignored) selected SCATT shots. countMismatch = SIUS shots - usable SCATT shots.
 */
export function alignMatch(
  sius: ParsedSiusResult,
  selected: ScattShot[],
  ignoredIds: number[],
): { shots: AlignedShot[]; countMismatch: number } {
  const ignore = new Set(ignoredIds);
  const usable = [...selected].sort(byTime).filter((s) => !ignore.has(s.id));
  const shots = siusShots(sius).map<AlignedShot>((shot, i) => ({
    order: i + 1,
    sius: shot,
    scatt: usable[i],
    ignored: false,
  }));
  return { shots, countMismatch: shots.length - usable.length };
}

/**
 * A proposal only: the user must confirm. The last N shots (N = the SIUS shot count) unless SCATT says when the match
 * started and the shots from that moment are not more than SIUS has: then the match is exactly those, from the
 * first of them. More shots after the start means the SIUS match was restarted inside the SCATT session, which the
 * start time cannot tell, so the last N stay.
 */
export function proposeSelection(sius: ParsedSiusResult, scatt: { shots: ScattShot[]; matchStartMs?: number }): MatchSelection {
  const n = siusShots(sius).length;
  if (scatt.matchStartMs !== undefined) {
    const after = [...scatt.shots].sort(byTime).filter((s) => s.tMs >= scatt.matchStartMs!);
    if (after.length > 0 && after.length <= n) return { kind: 'from', fromShotId: after[0].id, n };
  }
  return { kind: 'last', n };
}

/**
 * SIUS shots minus usable SCATT shots of a saved match (the selection's count less the ignored shots),
 * or null when the match has no SCATT selection. Only 0 may be confirmed.
 */
export type StoredSelection = MatchSelection & { ignoredScattIds?: number[] };

export function storedMismatch(selection: StoredSelection | null, siusShots: number): number | null {
  if (!selection) return null;
  return siusShots - (selection.n - (selection.ignoredScattIds?.length ?? 0));
}
