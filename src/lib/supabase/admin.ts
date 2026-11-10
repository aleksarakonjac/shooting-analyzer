import { createClient } from '@supabase/supabase-js';

/** Service-role client for server-only jobs that have no user session (e-mail approval links, cron). */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Public base URL for links in e-mails. Never taken from the request, so a registrant cannot steer it. */
export function siteUrl(): string | null {
  const explicit = process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return process.env.NODE_ENV === 'production' ? null : 'http://localhost:3000';
}
