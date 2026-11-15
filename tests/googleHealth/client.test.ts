import { describe, expect, it } from 'vitest';
import {
  authUrl,
  getIdentity,
  GoogleHealthError,
  listHeartRate,
  listShootingWorkouts,
  refreshAccessToken,
  SCOPES,
  setRetryDelayForTests,
} from '../../src/lib/googleHealth/client';

setRetryDelayForTests(0);

type Reply = { status?: number; body: unknown };
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies.shift();
    if (!r) throw new Error('unexpected call');
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(text, { status: r.status ?? 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const t0 = Date.UTC(2026, 10, 13, 15, 0);

describe('Google Health client', () => {
  it('builds an auth URL with both scopes, offline access, consent and state', () => {
    const u = new URL(authUrl({ clientId: 'cid', redirectUri: 'http://localhost:3000/api/google-health/callback', state: 'st' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(SCOPES).toEqual([
      'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
      'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
    ]);
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('response_type')).toBe('code');
  });

  it('listHeartRate follows two pages and sends the exact filter', async () => {
    const point = (ms: number, bpm: string) => ({ heartRate: { sampleTime: { physicalTime: new Date(ms).toISOString() }, beatsPerMinute: bpm } });
    const { fn, calls } = fakeFetch([
      { body: { dataPoints: [point(t0, '70')], nextPageToken: 'p2' } },
      { body: { dataPoints: [point(t0 + 2000, '72'), { heartRate: { sampleTime: {}, beatsPerMinute: 'x' } }] } },
    ]);
    const out = await listHeartRate('at', { fromMs: t0, toMs: t0 + 60_000 }, fn);
    expect(out).toEqual([{ tMs: t0, bpm: 70 }, { tMs: t0 + 2000, bpm: 72 }]);
    const u1 = new URL(calls[0].url);
    expect(u1.origin + u1.pathname).toBe('https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints');
    expect(u1.searchParams.get('filter')).toBe(
      'heart_rate.sample_time.physical_time >= "2026-11-13T15:00:00.000Z" AND heart_rate.sample_time.physical_time < "2026-11-13T15:01:00.000Z"',
    );
    expect(u1.searchParams.get('pageSize')).toBe('10000');
    expect(new URL(calls[1].url).searchParams.get('pageToken')).toBe('p2');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer at');
  });

  it('retries 429 then succeeds', async () => {
    const { fn, calls } = fakeFetch([{ status: 429, body: {} }, { body: { dataPoints: [] } }]);
    await expect(listHeartRate('at', { fromMs: t0, toMs: t0 + 1 }, fn)).resolves.toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('gives up after 3 retries as unavailable', async () => {
    const { fn, calls } = fakeFetch([{ status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} }]);
    await expect(listHeartRate('at', { fromMs: t0, toMs: t0 + 1 }, fn)).rejects.toMatchObject({ code: 'unavailable' });
    expect(calls).toHaveLength(4);
  });

  it('maps invalid_grant on refresh', async () => {
    const { fn, calls } = fakeFetch([{ status: 400, body: { error: 'invalid_grant' } }]);
    const err = await refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, fn).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleHealthError);
    expect(err.code).toBe('invalid_grant');
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(String(calls[0].init?.body)).toContain('grant_type=refresh_token');
  });

  it('maps ACCOUNT_NOT_LINKED on identity', async () => {
    const { fn } = fakeFetch([{ status: 400, body: { error: { status: 'FAILED_PRECONDITION', details: [{ reason: 'ACCOUNT_NOT_LINKED' }] } } }]);
    await expect(getIdentity('at', fn)).rejects.toMatchObject({ code: 'not_linked' });
  });

  it('listShootingWorkouts keeps only SHOOTING and parses the id', async () => {
    const ex = (id: string, type: string) => ({
      name: `users/123/dataTypes/exercise/dataPoints/${id}`,
      exercise: { exerciseType: type, interval: { startTime: '2026-11-13T15:13:33Z', endTime: '2026-11-13T16:31:04Z' } },
    });
    const { fn, calls } = fakeFetch([{ body: { dataPoints: [ex('111', 'SHOOTING'), ex('222', 'BIKING')] } }]);
    const out = await listShootingWorkouts('at', '2026-11-12', '2026-11-15', fn);
    expect(out).toEqual([{ id: '111', startMs: Date.parse('2026-11-13T15:13:33Z'), endMs: Date.parse('2026-11-13T16:31:04Z') }]);
    const u = new URL(calls[0].url);
    expect(u.searchParams.get('filter')).toBe('exercise.interval.civil_start_time >= "2026-11-12" AND exercise.interval.civil_start_time < "2026-11-15"');
    expect(u.searchParams.get('pageSize')).toBe('25');
  });
});
