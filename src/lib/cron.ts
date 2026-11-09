/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. With no secret configured nothing is accepted. */
export function isCronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return header === `Bearer ${secret}`;
}
