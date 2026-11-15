/** Server code only. Google Health settings from the environment, or null when any is missing (feature off). */
export function googleHealthEnv(): { clientId: string; clientSecret: string; tokenKey: string; stateSecret: string } | null {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const tokenKey = process.env.GOOGLE_HEALTH_TOKEN_KEY;
  const stateSecret = process.env.GOOGLE_HEALTH_STATE_SECRET;
  if (!clientId || !clientSecret || !tokenKey || !stateSecret) return null;
  return { clientId, clientSecret, tokenKey, stateSecret };
}

/**
 * The OAuth callback on the address the app is open at (localhost in development, the live domain in production).
 * Not SITE_URL: that names the live site even in development. Google accepts only redirect URIs registered on the
 * client, so a forged Host cannot steer the code anywhere.
 */
export function healthCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/google-health/callback`;
}
