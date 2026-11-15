import { createClient } from '@/lib/supabase/server';
import type { InboxItem } from './types';

/** The signed-in user's waiting phone uploads, newest first (row-level security limits them to the owner). */
export async function waitingInbox(): Promise<InboxItem[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('inbox_files').select('id, kind, storage_path, file_name, created_at').order('created_at', { ascending: false });
  return ((data ?? []) as { id: string; kind: InboxItem['kind']; storage_path: string; file_name: string; created_at: string }[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    path: r.storage_path,
    name: r.file_name,
    createdAt: r.created_at,
  }));
}
