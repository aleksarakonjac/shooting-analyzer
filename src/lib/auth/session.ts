import { createClient } from '@/lib/supabase/server';
import type { SessionProfile } from './guard';

export type { SessionProfile } from './guard';

/** Profile of the signed-in user, or null when signed out or no profile row exists. */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('profiles').select('id, role, status, tz').eq('id', auth.user.id).maybeSingle();
  return (data as SessionProfile | null) ?? null;
}
