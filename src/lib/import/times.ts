import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

const at = (date: string, hhmm: string, tz: string): string | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!d || !t) return null;
  return new Date(zonedWallTimeToUtcMs(+d[1], +d[2], +d[3], +t[1], +t[2], 0, 0, tz)).toISOString();
};

/** The training day plus its local from-to clock times as UTC instants; a missing time stays null. */
export function toInstantRange(date: string, from: string, to: string, tz: string): { startedAt: string | null; endedAt: string | null } {
  return { startedAt: at(date, from, tz), endedAt: at(date, to, tz) };
}
