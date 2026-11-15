import type { HrSample } from '@/lib/parsers/tcx';
import type { Span, Workout } from './window';

const API = 'https://health.googleapis.com/v4';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Heart rate, and workouts to find the SHOOTING session. Both are restricted scopes. */
export const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
] as const;

export type GoogleHealthErrorCode = 'invalid_grant' | 'not_linked' | 'unavailable' | 'http';

export class GoogleHealthError extends Error {
  constructor(
    public code: GoogleHealthErrorCode,
    public status?: number,
  ) {
    super(`google health: ${code}${status ? ` (${status})` : ''}`);
  }
}

const MAX_RETRIES = 3;
const MAX_PAGES = 50;
let retryBaseMs = 100;
/** Tests run retries without waiting. */
export function setRetryDelayForTests(ms: number) {
  retryBaseMs = ms;
}

/** One request with up to three retries on 429 and 5xx. */
async function send(url: string, init: RequestInit, fetchFn: typeof fetch): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchFn(url, init);
    } catch {
      res = null;
    }
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable) return res!;
    if (attempt >= MAX_RETRIES) throw new GoogleHealthError('unavailable', res?.status);
    if (retryBaseMs > 0) await new Promise((r) => setTimeout(r, retryBaseMs * 2 ** attempt));
  }
}

async function apiGet(accessToken: string, path: string, params: Record<string, string>, fetchFn: typeof fetch): Promise<unknown> {
  const url = `${API}${path}?${new URLSearchParams(params).toString()}`;
  const res = await send(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }, fetchFn);
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 400 && text.includes('ACCOUNT_NOT_LINKED')) throw new GoogleHealthError('not_linked', 400);
    throw new GoogleHealthError('http', res.status);
  }
  return text ? JSON.parse(text) : {};
}

async function tokenPost(params: Record<string, string>, fetchFn: typeof fetch): Promise<Record<string, unknown>> {
  const res = await send(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() }, fetchFn);
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new GoogleHealthError(body.error === 'invalid_grant' ? 'invalid_grant' : 'http', res.status);
  return body;
}

export function authUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state: o.state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export async function exchangeCode(
  o: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ refreshToken: string; accessToken: string; scope: string }> {
  const b = await tokenPost({ grant_type: 'authorization_code', code: o.code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri }, fetchFn);
  if (typeof b.refresh_token !== 'string' || typeof b.access_token !== 'string') throw new GoogleHealthError('http');
  return { refreshToken: b.refresh_token, accessToken: b.access_token, scope: typeof b.scope === 'string' ? b.scope : '' };
}

export async function refreshAccessToken(
  o: { clientId: string; clientSecret: string; refreshToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const b = await tokenPost({ grant_type: 'refresh_token', refresh_token: o.refreshToken, client_id: o.clientId, client_secret: o.clientSecret }, fetchFn);
  if (typeof b.access_token !== 'string') throw new GoogleHealthError('http');
  return b.access_token;
}

/** Best effort: the connection is removed on our side either way. */
export async function revokeToken(token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    await fetchFn('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() });
  } catch {
    // ignored
  }
}

export async function getIdentity(accessToken: string, fetchFn: typeof fetch = fetch): Promise<{ healthUserId: string }> {
  const b = (await apiGet(accessToken, '/users/me/identity', {}, fetchFn)) as { healthUserId?: string };
  return { healthUserId: b.healthUserId ?? '' };
}

async function listPages(accessToken: string, dataType: string, filter: string, pageSize: number, fetchFn: typeof fetch): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, string> = { filter, pageSize: String(pageSize) };
    if (pageToken) params.pageToken = pageToken;
    const b = (await apiGet(accessToken, `/users/me/dataTypes/${dataType}/dataPoints`, params, fetchFn)) as {
      dataPoints?: Record<string, unknown>[];
      nextPageToken?: string;
    };
    out.push(...(b.dataPoints ?? []));
    pageToken = b.nextPageToken || undefined;
    if (!pageToken) break;
  }
  return out;
}

/** SHOOTING workouts whose civil start date is in [fromDate, toDateExclusive). */
export async function listShootingWorkouts(accessToken: string, fromDate: string, toDateExclusive: string, fetchFn: typeof fetch = fetch): Promise<Workout[]> {
  const filter = `exercise.interval.civil_start_time >= "${fromDate}" AND exercise.interval.civil_start_time < "${toDateExclusive}"`;
  const points = await listPages(accessToken, 'exercise', filter, 25, fetchFn);
  const out: Workout[] = [];
  for (const p of points) {
    const ex = p.exercise as { exerciseType?: string; interval?: { startTime?: string; endTime?: string } } | undefined;
    if (ex?.exerciseType !== 'SHOOTING') continue;
    const startMs = Date.parse(ex.interval?.startTime ?? '');
    const endMs = Date.parse(ex.interval?.endTime ?? '');
    const id = typeof p.name === 'string' ? p.name.split('/').pop() ?? '' : '';
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) out.push({ id, startMs, endMs });
  }
  return out;
}

export async function listHeartRate(accessToken: string, span: Span, fetchFn: typeof fetch = fetch): Promise<HrSample[]> {
  const from = new Date(span.fromMs).toISOString();
  const to = new Date(span.toMs).toISOString();
  const filter = `heart_rate.sample_time.physical_time >= "${from}" AND heart_rate.sample_time.physical_time < "${to}"`;
  const points = await listPages(accessToken, 'heart-rate', filter, 10000, fetchFn);
  const out: HrSample[] = [];
  for (const p of points) {
    const hr = p.heartRate as { sampleTime?: { physicalTime?: string }; beatsPerMinute?: string | number } | undefined;
    const tMs = Date.parse(hr?.sampleTime?.physicalTime ?? '');
    const bpm = Number(hr?.beatsPerMinute);
    if (Number.isFinite(tMs) && Number.isFinite(bpm) && bpm > 0) out.push({ tMs, bpm });
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}
