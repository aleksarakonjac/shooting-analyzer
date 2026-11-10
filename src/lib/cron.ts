import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. With no secret configured nothing is accepted.
 * Compared as SHA-256 digests in constant time, so neither the content nor the length leaks through timing.
 */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || header === null) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
