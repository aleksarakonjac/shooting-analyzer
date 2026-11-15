import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { listHeartRate, listShootingWorkouts, refreshAccessToken } from '@/lib/googleHealth/client';
import { decryptToken } from '@/lib/googleHealth/crypto';
import { parsePullInput, pullPulse, type PullDeps } from '@/lib/googleHealth/pull';
import { googleHealthEnv } from '@/lib/googleHealth/server';
import type { Span } from '@/lib/googleHealth/window';

type TrainingRow = {
  shooter_id: string;
  trained_on: string;
  started_at: string | null;
  ended_at: string | null;
  matches: { series: { shots: { t_ms: number | null }[] }[] }[];
};

const spanOf = (times: number[]): Span | null => (times.length ? { fromMs: Math.min(...times), toMs: Math.max(...times) } : null);

/** Pulls the shooter's pulse for one training from Google Health and answers with a TCX file (JSON). */
export async function POST(request: NextRequest) {
  const env = googleHealthEnv();
  const admin = createAdminClient();
  if (!env || !admin) return NextResponse.json({ error: 'not configured' }, { status: 500 });

  const input = parsePullInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const supabase = await createClient();
  const profile = await getSessionProfile();
  const links = admin.from('google_health_links');

  const deps: PullDeps = {
    callerId: profile && profile.status === 'active' ? profile.id : null,
    tz: profile?.tz ?? 'Europe/Belgrade',
    async isCoachOf(shooterId) {
      const { data } = await supabase.rpc('coach_of', { sid: shooterId });
      return data === true;
    },
    async loadTraining(id) {
      const { data } = await supabase
        .from('trainings')
        .select('shooter_id,trained_on,started_at,ended_at,matches(series(shots(t_ms)))')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();
      const t = data as unknown as TrainingRow | null;
      if (!t) return null;
      const times = t.matches.flatMap((m) => m.series.flatMap((s) => s.shots.map((x) => x.t_ms))).filter((x): x is number => typeof x === 'number');
      const a = Date.parse(t.started_at ?? '');
      const b = Date.parse(t.ended_at ?? '');
      return {
        shooterId: t.shooter_id,
        date: t.trained_on,
        shotSpan: spanOf(times),
        training: Number.isFinite(a) && Number.isFinite(b) && b > a ? { fromMs: a, toMs: b } : null,
      };
    },
    async loadLink(shooterId) {
      const { data } = await links.select('refresh_token_enc, broken_at').eq('user_id', shooterId).maybeSingle();
      return data ? { refreshTokenEnc: data.refresh_token_enc as string, brokenAt: (data.broken_at as string | null) ?? null } : null;
    },
    async markBroken(shooterId) {
      await links.update({ broken_at: new Date().toISOString() }).eq('user_id', shooterId);
    },
    async touch(shooterId) {
      await links.update({ last_used_at: new Date().toISOString() }).eq('user_id', shooterId);
    },
    decrypt: (sealed) => decryptToken(sealed, env.tokenKey),
    google: {
      refresh: (refreshToken) => refreshAccessToken({ clientId: env.clientId, clientSecret: env.clientSecret, refreshToken }),
      workouts: (accessToken, from, to) => listShootingWorkouts(accessToken, from, to),
      heartRate: (accessToken, span) => listHeartRate(accessToken, span),
    },
  };

  const result = await pullPulse(input, deps);
  return NextResponse.json(result, { status: result.status });
}
