import { createClient } from '@/lib/supabase/server';

export interface EventOption {
  id: string;
  name: string;
  kind: 'kontrolni' | 'takmicenje';
}

/** The shooter's events, newest first, for the session form's event field. */
export async function shooterEvents(shooterId: string): Promise<EventOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('id, name, kind')
    .eq('shooter_id', shooterId)
    .order('starts_on', { ascending: false })
    .limit(100);
  return (data ?? []) as EventOption[];
}
