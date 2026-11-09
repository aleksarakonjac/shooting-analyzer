'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

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
  const { error } = await supabase.auth.signUp({
    email: String(form.get('email') ?? ''),
    password,
    options: { data: { display_name: String(form.get('displayName') ?? '').trim() } },
  });
  if (error) {
    // Code and status only (no email/password) so a failing signup can be diagnosed from server logs.
    console.error('signUp failed', error.status, error.code, error.message);
    return { error: 'registerFailed' };
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
