import { toInstantRange } from '@/lib/import/times';
import type { SessionKind, SessionStage } from '@/lib/import/saveTraining';

const KINDS: readonly SessionKind[] = ['trening', 'kontrolni', 'takmicenje'];
const STAGES: readonly SessionStage[] = ['slobodno', 'eliminacije', 'kvalifikacije', 'finale'];

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export interface SessionPatch {
  name: string;
  place: string;
  notes: string;
  kind: SessionKind;
  stage: SessionStage;
  tz: string;
  trained_on: string;
  started_at: string | null;
  ended_at: string | null;
}

/** The session editor's form, checked and turned into a row patch; the event is resolved by name afterwards. */
export function parseSessionEdit(
  form: FormData,
): { ok: true; patch: SessionPatch; eventName: string } | { ok: false } {
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const kind = s('kind') as SessionKind;
  const stage = s('stage') as SessionStage;
  const tz = s('tz');
  const date = s('when_date');
  if (!KINDS.includes(kind) || !STAGES.includes(stage) || !validZone(tz) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false };
  }
  const range = toInstantRange(date, s('when_from'), s('when_to'), tz);
  return {
    ok: true,
    patch: {
      name: s('name'),
      place: s('place'),
      notes: s('notes'),
      kind,
      stage,
      tz,
      trained_on: date,
      started_at: range.startedAt,
      ended_at: range.endedAt,
    },
    eventName: kind === 'trening' ? '' : s('event'),
  };
}
