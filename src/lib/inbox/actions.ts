'use server';
import { revalidatePath } from 'next/cache';
import { requireUuid } from '@/lib/actionGuard';
import { createClient } from '@/lib/supabase/server';
import { hashInboxToken, newInboxToken } from './token';

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
