import { createClient } from '@/lib/supabase/server';

/** Places of earlier trainings the viewer may see, newest first, each once. */
export async function recentPlaces(shooterId?: string): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase.from('trainings').select('place').neq('place', '').is('deleted_at', null).order('created_at', { ascending: false }).limit(300);
  if (shooterId) q = q.eq('shooter_id', shooterId);
  const { data } = await q;
  return [...new Set(((data ?? []) as { place: string }[]).map((r) => r.place.trim()).filter(Boolean))];
}
