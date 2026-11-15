// Pure helpers for picking a public competition performance (no server-only: the form uses them too).
import { DISCIPLINES, disciplineFromSiusName } from '@/lib/domain/disciplines';
import { sr } from '@/lib/i18n/sr';
import type { SessionStage } from '@/lib/import/saveTraining';
import type { RankingRow } from './types';

/** The calendar day of an instant in the competition's own time zone (an unknown zone → the UTC day). */
export function partLocalDate(startDate: string, timeZone: string): string {
  const d = new Date(startDate);
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function stageFromPartName(partName: string): SessionStage | null {
  const n = partName.toLowerCase();
  if (n.includes('qualification')) return 'kvalifikacije';
  if (/\bfinal\b/.test(n)) return 'finale';
  if (n.includes('elimination') || /\bpre\b|\bpre-/.test(n)) return 'eliminacije';
  return null;
}

/** "<competition> <discipline> <part>", with ZeroIn's labels where it knows the discipline and the part. */
export function sessionNameFor(compName: string, eventName: string, partName: string): string {
  const id = disciplineFromSiusName(eventName);
  const stage = stageFromPartName(partName);
  const discipline = id ? DISCIPLINES[id].nameSr : eventName;
  const part = stage ? sr.newTraining.stages[stage] : partName;
  return [compName, discipline, part].map((s) => s.trim()).filter(Boolean).join(' ');
}

const nameKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');

/**
 * The shooter's own row: by the remembered athlete identifier, else by the exact full name in any word order
 * (SIUS writes "SURNAME Name"). Never a partial match, and no guess when two rows share the name.
 */
export function findMyRow(ranking: RankingRow[], athleteId: string | null, displayName: string): RankingRow | null {
  if (athleteId) {
    const byId = ranking.find((r) => r.identifier === athleteId);
    if (byId) return byId;
  }
  const key = nameKey(displayName);
  if (!key) return null;
  const hits = ranking.filter((r) => nameKey(r.displayName) === key);
  return hits.length === 1 ? hits[0] : null;
}
