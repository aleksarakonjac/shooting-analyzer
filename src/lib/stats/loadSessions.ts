import { createClient } from '@/lib/supabase/server';
import type { SessionFilters } from './filters';
import type { TrainingSummary } from './periodStats';
import { SUMMARY_SELECT, toSummary, type SummaryRow } from './summaryQuery';

/**
 * The shooter's sessions matching the filters, newest first. The recent view is capped at the list
 * size plus one, so the page can tell whether older sessions exist.
 */
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
  if (f.quick === 'recent') q = q.limit(f.limit + 1);
  const { data } = await q;
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
}

/** Places and events the shooter has used, for the filter choices. */
export async function filterChoices(shooterId: string): Promise<{ places: string[]; events: { id: string; name: string }[]; years: string[] }> {
  const supabase = await createClient();
  const [pl, ev, first] = await Promise.all([
    supabase.from('trainings').select('place').eq('shooter_id', shooterId).is('deleted_at', null).neq('place', '').limit(500),
    supabase.from('events').select('id, name').eq('shooter_id', shooterId).order('starts_on', { ascending: false }).limit(100),
    supabase.from('trainings').select('trained_on').eq('shooter_id', shooterId).is('deleted_at', null).order('trained_on', { ascending: true }).limit(1),
  ]);
  const places = [...new Set(((pl.data ?? []) as { place: string }[]).map((r) => r.place.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sr'));
  // Every year from the first session to this one, newest first.
  const firstYear = Number(((first.data ?? []) as { trained_on: string }[])[0]?.trained_on.slice(0, 4));
  const thisYear = new Date().getUTCFullYear();
  const years = Number.isFinite(firstYear) ? Array.from({ length: Math.max(1, thisYear - firstYear + 1) }, (_, i) => String(thisYear - i)) : [String(thisYear)];
  return { places, events: (ev.data ?? []) as { id: string; name: string }[], years };
}
