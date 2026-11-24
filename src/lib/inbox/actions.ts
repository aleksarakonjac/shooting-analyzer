'use server';
import { revalidatePath } from 'next/cache';
import { requireUuid } from '@/lib/actionGuard';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { getSessionProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { confirmUpload, startUpload, type ConfirmResult, type StartResult } from './directUpload';
import { hashInboxToken, newInboxToken } from './token';
import { uploadDeps } from './uploadDeps';

export type TokenState = { token?: string; error?: boolean } | undefined;

/** Makes a personal upload token and returns it once; the database keeps only its hash. */
export async function createInboxToken(_: TokenState, form: FormData): Promise<TokenState> {
  const supabase = await createClient();
  const token = newInboxToken();
  const label = String(form.get('label') ?? '').trim().slice(0, 60);
  const { error } = await supabase.rpc('make_inbox_token', { hash: hashInboxToken(token), token_label: label });
  if (error) return { error: true };
  revalidatePath('/nalog');
  return { token };
}

export async function revokeInboxToken(form: FormData): Promise<void> {
  const id = requireUuid(form.get('id'));
  const supabase = await createClient();
  await supabase.from('inbox_tokens').delete().eq('id', id);
  revalidatePath('/nalog');
}

/** Removes waiting files (after they were entered, or when unwanted): the stored object first, then the row. */
export async function discardInboxFiles(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const clean = ids.map((id) => requireUuid(id));
  const supabase = await createClient();
  const { data } = await supabase.from('inbox_files').select('id, storage_path').in('id', clean);
  const rows = (data ?? []) as { id: string; storage_path: string }[];
  if (!rows.length) return;
  const { error } = await supabase.storage.from('inbox').remove(rows.map((r) => r.storage_path));
  // A row without its object is useless, but an object without its row is invisible; keep the row on failure.
  if (error) return;
  await supabase.from('inbox_files').delete().in('id', rows.map((r) => r.id));
  // The menu's waiting count lives in the layout.
  revalidatePath('/', 'layout');
}

/** Form version of discardInboxFiles, for the phone inbox page. */
export async function discardInboxFileForm(form: FormData): Promise<void> {
  await discardInboxFiles([requireUuid(form.get('id'))]);
}

/** A signed-in shooter for themselves, a coach for the shooters linked to them. */
async function ownDeps() {
  const profile = await getSessionProfile();
  const admin = createAdminClient();
  if (!admin || !profile || profile.status !== 'active') return null;
  const ids = profile.role === 'shooter' ? [profile.id] : profile.role === 'coach' ? (await linkedShooters()).map((s) => s.id) : [];
  return uploadDeps(admin, { started_by: profile.id }, async (id) => ids.includes(id));
}

export async function startOwnUpload(req: { shooterId: string; fileName: string; bytes: number; meta: unknown }): Promise<StartResult> {
  const deps = await ownDeps();
  if (!deps) return { status: 403, error: 'not allowed' };
  return startUpload({ shooterId: String(req.shooterId), fileName: String(req.fileName), bytes: req.bytes, meta: req.meta }, deps);
}

export async function confirmOwnUpload(uploadId: string): Promise<ConfirmResult> {
  const deps = await ownDeps();
  if (!deps) return { status: 403, error: 'not allowed' };
  const result = await confirmUpload(requireUuid(uploadId), deps);
  if (result.status === 201) revalidatePath('/', 'layout');
  return result;
}

/** A file sent under a wrong name, given to the right shooter; the database decides who may give what to whom. */
export async function passInboxFile(id: string, to: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('pass_inbox_file', { fid: requireUuid(id), to_shooter: requireUuid(to) });
  if (error) return { ok: false };
  revalidatePath('/', 'layout');
  return { ok: true };
}
