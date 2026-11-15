/** Server code only. Google Health settings from the environment, or null when any is missing (feature off). */
export function googleHealthEnv(): { clientId: string; clientSecret: string; tokenKey: string; stateSecret: string } | null {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const tokenKey = process.env.GOOGLE_HEALTH_TOKEN_KEY;
  const stateSecret = process.env.GOOGLE_HEALTH_STATE_SECRET;
  if (!clientId || !clientSecret || !tokenKey || !stateSecret) return null;
  return { clientId, clientSecret, tokenKey, stateSecret };
}
