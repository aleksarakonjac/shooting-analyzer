import { notifyAdminOfRequest } from '@/lib/email/adminNotice';
import { signApproval } from '@/lib/auth/approvalToken';
import { siteUrl } from '@/lib/supabase/admin';

/**
 * Mails the admin the approval link for a new account. The link base is the configured site URL only,
 * never the request's host, so a forged Host header cannot send the signed link elsewhere.
 * Skipped quietly when the signing key or the site URL is not set.
 */
export async function announceNewAccount(user: { id: string; email?: string | null }, name: string, role: 'shooter' | 'coach') {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const origin = siteUrl();
  if (!key || !origin) return;
  const link = `${origin}/odobrenje?id=${user.id}&sig=${signApproval(user.id, key)}`;
  await notifyAdminOfRequest({ name, email: user.email ?? '', role, link });
}
