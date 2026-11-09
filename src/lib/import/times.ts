import { wallTimeCandidates } from '@/lib/time/zone';

export type Fold = 'earlier' | 'later';

const nextDay = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const at = (date: string, hhmm: string, tz: string, fold: Fold = 'earlier'): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const c = wallTimeCandidates(date, hhmm, tz);
  return new Date(fold === 'later' ? c[c.length - 1] : c[0]).toISOString();
};

/** True when `hh:mm` on `date` happens twice in `tz` (the night clocks go back). */
export const isRepeatedHour = (date: string, hhmm: string, tz: string) =>
  /^\d{2}:\d{2}$/.test(hhmm) && wallTimeCandidates(date, hhmm, tz).length > 1;

/**
 * The session's day plus its from–to clock time read in the venue zone, as UTC instants.
 * An end earlier than the start is the next day; a repeated hour uses the chosen reading.
 */
export function toInstantRange(
  date: string,
  from: string,
  to: string,
  tz: string,
  fold: { from?: Fold; to?: Fold } = {},
): { startedAt: string | null; endedAt: string | null; endsNextDay: boolean } {
  const endsNextDay = Boolean(from && to && to < from);
  return {
    startedAt: at(date, from, tz, fold.from),
    endedAt: at(endsNextDay ? nextDay(date) : date, to, tz, fold.to),
    endsNextDay,
  };
}
