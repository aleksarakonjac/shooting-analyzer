import { linkedShooters } from '@/lib/auth/linkedShooters';
import type { SessionProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { InboxItem } from './types';

/** Whose inbox this person works with: a shooter their own, a coach those of the linked shooters. */
export async function inboxShooterIds(profile: SessionProfile): Promise<string[]> {
  if (profile.role === 'shooter') return [profile.id];
  if (profile.role === 'coach') return (await linkedShooters()).map((s) => s.id);
  return [];
}

/** Files waiting for these shooters, newest first. Row-level security still decides what the caller may see of them. */
export async function waitingInbox(shooterIds: string[]): Promise<InboxItem[]> {
  if (!shooterIds.length) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('inbox_files')
    .select('id, user_id, kind, storage_path, file_name, meta, created_at')
    .in('user_id', shooterIds)
    .order('created_at', { ascending: false });
  type Row = { id: string; user_id: string; kind: InboxItem['kind']; storage_path: string; file_name: string; meta: InboxItem['meta']; created_at: string };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    shooterId: r.user_id,
    kind: r.kind,
    path: r.storage_path,
    name: r.file_name,
    meta: r.meta,
    createdAt: r.created_at,
  }));
}
