import { notifyAdminOfRequest } from '@/lib/email/adminNotice';
import { signApproval } from '@/lib/auth/approvalToken';

/** Mails the admin the approval link for a new account. Skipped quietly when the signing key is not set. */
export async function announceNewAccount(origin: string, user: { id: string; email?: string | null }, name: string, role: 'shooter' | 'coach') {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return;
  const link = `${origin}/odobrenje?id=${user.id}&sig=${signApproval(user.id, key)}`;
  await notifyAdminOfRequest({ name, email: user.email ?? '', role, link });
}
