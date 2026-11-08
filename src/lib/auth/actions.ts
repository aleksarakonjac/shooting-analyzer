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
  if (error) return { error: 'registerFailed' };
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
