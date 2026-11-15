'use server';
import { getSessionProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getAthleteShots, getRanking, listCompetitions, listEvents, listParts } from './results';
import * as svc from './service';
import { connect, dropAccessToken, getAccessToken } from './session';
import { supabaseSiusStore } from './store';
import { getExerciseShots, listExercises } from './training';

// Server actions for the SIUS Cloud tab and the account panel. The logic and access rules live in service.ts;
// this file only wires Supabase and SIUS. Ids from the client are checked before anything is called.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIUS_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FORBIDDEN: svc.SiusState = { state: 'forbidden' };
const DUP_WINDOW_MS = 2000;

const okSel = (s: svc.CompetitionSelection | null | undefined): s is svc.CompetitionSelection =>
  !!s && [s.compId, s.eventId, s.partId].every((v) => typeof v === 'string' && SIUS_ID.test(v)) &&
  typeof s.eventName === 'string' && typeof s.partName === 'string';

async function deps(): Promise<svc.SiusDeps> {
  const profile = await getSessionProfile();
  const supabase = await createClient();
  const admin = createAdminClient();

  return {
    callerId: profile && profile.status === 'active' ? profile.id : null,
    async isCoachOf(sid) {
      const { data } = await supabase.rpc('coach_of', { sid });
      return data === true;
    },
    token: (sid) => getAccessToken(sid),
    async renewToken(sid) {
      await dropAccessToken(sid);
      return getAccessToken(sid);
    },
    connect: (uid, email, password) => connect(uid, email, password),
    async disconnect(uid) {
      const store = supabaseSiusStore();
      if (store) await store.remove(uid);
    },
    training: { list: (at, page) => listExercises(at, page), shots: (at, id) => getExerciseShots(at, id) },
    results: {
      competitions: (q) => listCompetitions(q),
      events: (c) => listEvents(c),
      parts: (c, e) => listParts(c, e),
      ranking: (c, e, p) => getRanking(c, e, p),
      athleteShots: (c, e, p, a) => getAthleteShots(c, e, p, a),
    },
    async importedTrainings(sid, externalIds) {
      if (!externalIds.length) return new Map();
      const { data } = await supabase
        .from('source_files')
        .select('external_id, trainings!inner(id, shooter_id, deleted_at)')
        .eq('kind', 'sius_cloud')
        .in('external_id', externalIds)
        .eq('trainings.shooter_id', sid)
        .is('trainings.deleted_at', null);
      const rows = (data ?? []) as unknown as { external_id: string; trainings: { id: string } }[];
      return new Map(rows.map((r) => [r.external_id, r.trainings.id]));
    },
    async duplicateOf(sid, firstMs, count) {
      const from = firstMs - DUP_WINDOW_MS;
      const to = firstMs + DUP_WINDOW_MS;
      // SIUS Cloud sources record the first shot and the count.
      const { data: src } = await supabase
        .from('source_files')
        .select('trainings!inner(id, shooter_id, deleted_at)')
        .eq('kind', 'sius_cloud')
        .eq('shot_count', count)
        .gte('first_shot_at', new Date(from).toISOString())
        .lte('first_shot_at', new Date(to).toISOString())
        .eq('trainings.shooter_id', sid)
        .is('trainings.deleted_at', null)
        .limit(1);
      const hit = (src ?? []) as unknown as { trainings: { id: string } }[];
      if (hit[0]) return hit[0].trainings.id;
      // Any other source: a stored match shot at the same moment, in a match with as many shots.
      const { data: shots } = await supabase
        .from('shots')
        .select('series!inner(matches!inner(training_id, trainings!inner(shooter_id, deleted_at)))')
        .gte('t_ms', from)
        .lte('t_ms', to)
        .eq('series.matches.trainings.shooter_id', sid)
        .is('series.matches.trainings.deleted_at', null)
        .limit(5);
      const ids = [...new Set(((shots ?? []) as unknown as { series: { matches: { training_id: string } } }[]).map((s) => s.series.matches.training_id))];
      for (const id of ids) {
        const { count: n } = await supabase
          .from('shots')
          .select('id, series!inner(matches!inner(training_id))', { count: 'exact', head: true })
          .eq('series.matches.training_id', id);
        if (n === count) return id;
      }
      return null;
    },
    // Profiles are read and written with the service role: service.ts has already checked that the caller is
    // the shooter or their linked coach (the profile policy lets only the user themselves update).
    async athleteId(sid) {
      const { data } = await (admin ?? supabase).from('profiles').select('sius_athlete_id').eq('id', sid).maybeSingle();
      return (data?.sius_athlete_id as string | null | undefined) ?? null;
    },
    async setAthleteId(sid, identifier) {
      if (!admin) throw new Error('not configured');
      const { error } = await admin.from('profiles').update({ sius_athlete_id: identifier }).eq('id', sid);
      if (error) throw new Error(`profile update failed (${error.code})`);
    },
    async shooterName(sid) {
      const { data } = await (admin ?? supabase).from('profiles').select('display_name').eq('id', sid).maybeSingle();
      return (data?.display_name as string | undefined) ?? '';
    },
  };
}

export async function connectSius(email: string, password: string) {
  return svc.connectSius(await deps(), email, password);
}

export async function disconnectSius() {
  return svc.disconnectSius(await deps());
}

export async function siusExercises(shooterId: string, skip: number) {
  if (!UUID.test(shooterId)) return FORBIDDEN;
  return svc.exercises(await deps(), shooterId, skip);
}

export async function siusExerciseResult(shooterId: string, exerciseId: string, name: string) {
  if (!UUID.test(shooterId) || !SIUS_ID.test(exerciseId)) return FORBIDDEN;
  return svc.exerciseResult(await deps(), shooterId, exerciseId, String(name ?? '').slice(0, 200));
}

export async function siusCompetitions(page: number, name: string) {
  return svc.competitions(await deps(), page, name);
}

export async function siusEvents(compId: string) {
  if (!SIUS_ID.test(compId)) return FORBIDDEN;
  return svc.events(await deps(), compId);
}

export async function siusParts(compId: string, eventId: string) {
  if (!SIUS_ID.test(compId) || !SIUS_ID.test(eventId)) return FORBIDDEN;
  return svc.parts(await deps(), compId, eventId);
}

export async function siusMyPerformance(shooterId: string, sel: svc.CompetitionSelection) {
  if (!UUID.test(shooterId) || !okSel(sel)) return FORBIDDEN;
  return svc.myPerformance(await deps(), shooterId, sel);
}

export async function siusAthletePerformance(shooterId: string, sel: svc.CompetitionSelection, athleteRunningId: string) {
  if (!UUID.test(shooterId) || !okSel(sel) || !SIUS_ID.test(athleteRunningId)) return FORBIDDEN;
  return svc.athletePerformance(await deps(), shooterId, sel, athleteRunningId);
}

export async function siusConfirmAthlete(shooterId: string, identifier: string) {
  if (!UUID.test(shooterId)) return FORBIDDEN;
  return svc.confirmAthlete(await deps(), shooterId, identifier);
}
