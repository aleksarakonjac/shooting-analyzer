import 'server-only';
import { SiusAuthFailure, siusRequest } from './auth';
import type { SiusExercise, SiusShotsResponse } from './types';

// SIUS Training Center (private exercises). Needs the user's access token.
const TRAINING = 'https://shootingsportscloud.com:8598';

async function get(path: string, accessToken: string, fetchImpl: typeof fetch): Promise<unknown> {
  const r = await siusRequest(fetchImpl, `${TRAINING}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  // 401/403: the token is no longer accepted; the caller renews it once.
  if (r.status === 401 || r.status === 403) throw new SiusAuthFailure('blocked', `Training Center HTTP ${r.status}`);
  if (r.status !== 200) throw new SiusAuthFailure('unavailable', `Training Center HTTP ${r.status}`);
  try {
    return JSON.parse(r.text);
  } catch {
    throw new SiusAuthFailure('unavailable', 'Training Center answered without JSON');
  }
}

/** One page of exercises, newest first. SIUS reports no total (-1), so a full page means there may be more. */
export async function listExercises(
  accessToken: string,
  page: { skip: number; take: number },
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: SiusExercise[]; more: boolean }> {
  // Exactly the SPA's DevExtreme load options; SIUS answers 500 when fields or selector names differ.
  const loadOptions = JSON.stringify({
    sort: [{ selector: 'exerciseDate', desc: true }],
    group: null,
    searchOperation: 'contains',
    searchValue: null,
    skip: page.skip,
    take: page.take,
    userData: {},
    stringToLower: true,
  });
  const json = (await get(`api/user-results?loadOptions=${encodeURIComponent(loadOptions)}`, accessToken, fetchImpl)) as { data?: SiusExercise[] };
  const items = Array.isArray(json?.data) ? json.data : [];
  return { items, more: items.length >= page.take };
}

export async function getExerciseShots(accessToken: string, exerciseId: string, fetchImpl: typeof fetch = fetch): Promise<SiusShotsResponse> {
  return (await get(`api/user-results/${encodeURIComponent(exerciseId)}/shots`, accessToken, fetchImpl)) as SiusShotsResponse;
}
