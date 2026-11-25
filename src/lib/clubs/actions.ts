'use server';
import { revalidatePath } from 'next/cache';
import { requireUuid } from '@/lib/actionGuard';
import { createClient } from '@/lib/supabase/server';

export type ClubResult = { ok: boolean };

async function run(fn: string, args: Record<string, unknown>): Promise<ClubResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** The caller's own club: an entered one by any spelling of its name, a new one, or none for an empty name. */
export async function chooseClub(name: string): Promise<ClubResult> {
  return run('choose_club', { p_name: String(name).normalize('NFC') });
}

/** Its maker (while a member) or an admin; the database checks. */
export async function renameClub(id: string, name: string): Promise<ClubResult> {
  return run('rename_club', { cid: requireUuid(id), p_name: String(name).normalize('NFC') });
}

/** Makes a new link; the old one stops at once. */
export async function replaceClubLink(id: string): Promise<ClubResult> {
  return run('replace_club_link', { cid: requireUuid(id) });
}
