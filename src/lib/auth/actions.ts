'use server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { pipTopFor } from '@/lib/report/target';
import { createAdminClient, siteUrl } from '@/lib/supabase/admin';
import { signApproval, verifyApproval } from '@/lib/auth/approvalToken';
import { notifyAdminOfRequest } from '@/lib/email/adminNotice';
import { announceNewAccount } from '@/lib/email/announce';

export type FormState = { error?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: 'badCredentials' };
  redirect('/');
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'registerFailed' };
  const supabase = await createClient();
  const requestedRole = form.get('role') === 'coach' ? 'coach' : 'shooter';
  const email = String(form.get('email') ?? '');
  const displayName = String(form.get('displayName') ?? '').trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, requested_role: requestedRole } },
  });
  if (error) {
    // Code and status only (no email/password) so a failing signup can be diagnosed from server logs.
    console.error('signUp failed', error.status, error.code, error.message);
    return { error: 'registerFailed' };
  }
  // Best effort: if mail is not set up the request is still in the admin's list.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = siteUrl();
  if (data.user && key && base) {
    const link = `${base}/odobrenje?id=${data.user.id}&sig=${signApproval(data.user.id, key)}`;
    await notifyAdminOfRequest({ name: displayName || email, email, role: requestedRole, link });
  }
  redirect('/cekanje-odobrenja');
}

/** Approve or reject from the e-mail link. The signature is the authorization; only pending accounts change. */
export async function decideByLink(form: FormData): Promise<void> {
  const id = String(form.get('id') ?? '');
  const sig = String(form.get('sig') ?? '');
  const approve = form.get('decision') === 'approve';
  const back = `/odobrenje?id=${encodeURIComponent(id)}&sig=${encodeURIComponent(sig)}`;
  if (!verifyApproval(id, sig, process.env.SUPABASE_SERVICE_ROLE_KEY)) redirect(back);
  const admin = createAdminClient();
  if (!admin) redirect(back);
  const { data: p } = await admin.from('profiles').select('requested_role').eq('id', id).eq('status', 'pending').maybeSingle();
  if (p) {
    await admin
      .from('profiles')
      .update(approve ? { role: p.requested_role, status: 'active' } : { status: 'disabled' })
      .eq('id', id)
      .eq('status', 'pending');
  }
  redirect(back);
}

/** Starts Google sign-in. The chosen role rides along to the callback; it is only a request until the admin approves. */
export async function signInWithGoogle(form: FormData): Promise<void> {
  const role = form.get('role') === 'coach' ? 'coach' : 'shooter';
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${proto}://${host}/auth/callback?role=${role}` },
  });
  if (error || !data.url) redirect('/login');
  redirect(data.url);
}

/** Onboarding for a first-time Google sign-in: optional name change and the account type, then the admin is mailed. */
export async function completeOnboarding(form: FormData): Promise<void> {
  const role = form.get('role') === 'coach' ? 'coach' : 'shooter';
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const { data: first, error } = await supabase.rpc('complete_onboarding', {
    p_name: String(form.get('displayName') ?? ''),
    p_role: role,
  });
  if (error) redirect('/dobrodoslica');
  if (first) {
    const { data: p } = await supabase.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle();
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const base = siteUrl() ?? `${h.get('x-forwarded-proto') ?? 'http'}://${host}`;
    await announceNewAccount(base, auth.user, p?.display_name ?? auth.user.email ?? '', role);
  }
  redirect('/cekanje-odobrenja');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setProfile(form: FormData) {
  const supabase = await createClient();
  const role = String(form.get('role'));
  const status = String(form.get('status'));
  if (!['shooter', 'coach'].includes(role) || !['active', 'disabled'].includes(status)) return;
  await supabase.rpc('admin_set_profile', { pid: String(form.get('id')), new_role: role, new_status: status });
  redirect('/admin/approvals');
}

/** The signed-in user's own name and default time zone (the database rejects an unknown zone). */
export async function updateOwnProfile(form: FormData): Promise<void> {
  const name = String(form.get('displayName') ?? '').trim();
  const tz = String(form.get('tz') ?? '').trim();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || !name || !tz) redirect('/nalog?greska=1');
  const { error } = await supabase.from('profiles').update({ display_name: name, tz }).eq('id', auth.user.id);
  redirect(error ? '/nalog?greska=1' : '/nalog?sacuvano=1');
}

/** Saves the filled-pip threshold per discipline; values that are not allowed fall back to the default. */
export async function updatePipRule(form: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');
  const pip: Record<string, number> = {};
  for (const d of Object.keys(DISCIPLINES) as DisciplineId[]) {
    const v = Number(String(form.get(`pip_${d}`) ?? ''));
    pip[d] = pipTopFor({ [d]: v }, d);
  }
  const { error } = await supabase.from('profiles').update({ pip_top: pip }).eq('id', auth.user.id);
  redirect(error ? '/nalog?greska=1' : '/nalog?prikaz=1');
}
