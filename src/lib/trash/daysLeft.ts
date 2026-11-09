/** Matches purge_trash() in the database. */
export const RETENTION_DAYS = 30;

const DAY_MS = 86_400_000;

/** Days until a trashed training is purged for good (a started day counts as a day, never negative). */
export function daysLeft(deletedAt: string, now: Date): number {
  const purgeAt = Date.parse(deletedAt) + RETENTION_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((purgeAt - now.getTime()) / DAY_MS));
}
