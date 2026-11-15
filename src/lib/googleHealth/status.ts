import { createClient } from '@/lib/supabase/server';

export type HealthStatus = 'none' | 'ok' | 'broken';

/**
 * The shooter's Google Health connection as the viewer may know it (the database function answers 'none' to
 * anyone but the shooter and their coach), and whether the viewer is the coach. A missing function reads as 'none'.
 */
export async function healthFor(shooterId: string, viewerId: string): Promise<{ status: HealthStatus; isCoach: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('health_link_status', { sid: shooterId });
  const status: HealthStatus = !error && (data === 'ok' || data === 'broken') ? data : 'none';
  return { status, isCoach: viewerId !== shooterId };
}
