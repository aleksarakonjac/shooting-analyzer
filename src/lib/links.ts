'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildShareRow, type ShareArgs, type ShareScope } from '@/lib/shares';

/** Ask someone (by email) to link with you. Silent about whether the email exists. */
export async function requestLink(email: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('request_link', { target_email: email });
}

export async function confirmLink(linkId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('confirm_link', { link_id: linkId });
}

/** Ends an active link or withdraws/declines a pending one. */
export async function endLink(linkId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc('end_link', { link_id: linkId });
}

export async function setShare(scope: ShareScope, args: ShareArgs): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const built = buildShareRow(data.user.id, scope, args);
  if (!built.ok) return false;
  const { error } = await supabase.from('shares').insert(built.row);
  return !error;
}

export async function removeShare(shareId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('shares').delete().eq('id', shareId);
}

// ---- form actions used by the pages ----
export async function requestLinkForm(form: FormData) {
  await requestLink(String(form.get('email') ?? ''));
  redirect('/profil/veze?poslato=1');
}

export async function linkDecisionForm(form: FormData) {
  const id = String(form.get('id'));
  if (form.get('decision') === 'confirm') await confirmLink(id);
  else await endLink(id);
  redirect('/profil/veze');
}

export async function addShareForm(form: FormData) {
  const scope = String(form.get('scope')) as ShareScope;
  const ok = await setShare(scope, {
    coachId: String(form.get('coachId') ?? '') || undefined,
    trainingId: String(form.get('trainingId') ?? '') || undefined,
    from: String(form.get('from') ?? '') || undefined,
    to: String(form.get('to') ?? '') || undefined,
  });
  redirect(ok ? '/profil/veze' : '/profil/veze?greska=1');
}

export async function removeShareForm(form: FormData) {
  await removeShare(String(form.get('id')));
  redirect('/profil/veze');
}
