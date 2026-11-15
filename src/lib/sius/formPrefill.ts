// Pure pieces of the training form's SIUS Cloud wiring (the form itself is too large to render in tests).
import type { DisciplineId, ParsedSiusResult, Position } from '@/lib/domain/types';
import type { SessionStage } from '@/lib/import/saveTraining';
import { mapSiusShots, matchShotCount, splitByPositions } from './map';
import type { SiusShotsResponse } from './types';

export interface CloudSession {
  name: string;
  eventName: string;
  place: string;
  date: string;
  stage: SessionStage | null;
}

/**
 * What a competition pick changes in the form: each field only where the owner left it empty (the date only
 * while they have not set it); a known part always sets the stage.
 */
export function prefillSession(
  cur: { name: string; eventName: string; place: string; dateTouched: boolean },
  s: CloudSession,
): Partial<{ name: string; eventName: string; place: string; trainedOn: string; stage: SessionStage }> {
  return {
    ...(!cur.name.trim() && s.name ? { name: s.name } : {}),
    ...(!cur.eventName.trim() && s.eventName ? { eventName: s.eventName } : {}),
    ...(!cur.place.trim() && s.place ? { place: s.place } : {}),
    ...(!cur.dateTouched && s.date ? { trainedOn: s.date } : {}),
    ...(s.stage ? { stage: s.stage } : {}),
  };
}

/** A pick goes to the finals grid when the session is a final or the picked part is one. */
export function cloudPickTarget(formStage: SessionStage, pickedStage: SessionStage | null | undefined): 'final' | 'match' {
  return formStage === 'finale' || pickedStage === 'finale' ? 'final' : 'match';
}

const CANONICAL: Record<DisciplineId, string> = {
  air_rifle: '10m Air Rifle',
  air_pistol: '10m Air Pistol',
  smallbore_3p: '50m Rifle 3x20',
};

/**
 * Editing a saved SIUS Cloud session: the stored JSON is read again (times, decimals, sighters), and for a
 * single-block exercise (prone program) the saved positions are put back shot by shot. When the counts no longer
 * match, the result rebuilt from the database is kept unchanged.
 */
export function restoreCloudResult(raw: SiusShotsResponse, discipline: DisciplineId, stored: ParsedSiusResult): ParsedSiusResult {
  const mapped = mapSiusShots(raw, { name: CANONICAL[discipline] });
  if (matchShotCount(mapped) !== matchShotCount(stored)) return stored;
  if (raw.stageResults?.length) return mapped;
  const positions: (Position | null)[] = stored.series.flatMap((s) => s.shots.map(() => s.position ?? null));
  return positions.some((p) => p !== null) ? splitByPositions(mapped, positions) : mapped;
}
