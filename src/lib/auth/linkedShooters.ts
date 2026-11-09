import { createClient } from '@/lib/supabase/server';

export interface LinkedShooter {
  id: string;
  name: string;
}

/** The coach's active links to shooters (my_links hides nothing for an active link). */
export async function linkedShooters(): Promise<LinkedShooter[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_links');
  const rows = (data ?? []) as {
    status: 'pending' | 'active';
    other_id: string | null;
    other_name: string | null;
    other_role: string | null;
  }[];
  return rows
    .filter((r) => r.status === 'active' && r.other_role === 'shooter' && r.other_id)
    .map((r) => ({ id: r.other_id as string, name: r.other_name ?? '' }));
}
