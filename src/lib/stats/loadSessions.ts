import { createClient } from '@/lib/supabase/server';
import { RECENT_LIMIT, type SessionFilters } from './filters';
import type { TrainingSummary } from './periodStats';
import { SUMMARY_SELECT, toSummary, type SummaryRow } from './summaryQuery';

/** The shooter's sessions matching the filters, newest first; the recent view is capped. */
export async function loadSessions(shooterId: string, f: SessionFilters): Promise<TrainingSummary[]> {
  const supabase = await createClient();
  let q = supabase.from('trainings').select(SUMMARY_SELECT).eq('shooter_id', shooterId).is('deleted_at', null);
  if (f.from) q = q.gte('trained_on', f.from);
  if (f.to) q = q.lt('trained_on', f.to);
  if (f.discipline) q = q.eq('discipline', f.discipline);
  if (f.kind) q = q.eq('kind', f.kind);
  if (f.stage) q = q.eq('stage', f.stage);
  if (f.place) q = q.ilike('place', f.place.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (f.event) q = q.eq('event_id', f.event);
  q = q.order('trained_on', { ascending: false }).order('started_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (f.quick === 'recent') q = q.limit(RECENT_LIMIT);
  const { data } = await q;
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
}

/** Places and events the shooter has used, for the filter choices. */
export async function filterChoices(shooterId: string): Promise<{ places: string[]; events: { id: string; name: string }[] }> {
  const supabase = await createClient();
  const [pl, ev] = await Promise.all([
    supabase.from('trainings').select('place').eq('shooter_id', shooterId).is('deleted_at', null).neq('place', '').limit(500),
    supabase.from('events').select('id, name').eq('shooter_id', shooterId).order('starts_on', { ascending: false }).limit(100),
  ]);
  const places = [...new Set(((pl.data ?? []) as { place: string }[]).map((r) => r.place.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sr'));
  return { places, events: (ev.data ?? []) as { id: string; name: string }[] };
}
