import 'server-only';
import { SiusAuthFailure, siusRequest } from './auth';
import type { RankingRow, SiusCompetition, SiusEvent, SiusPart, SiusShotsResponse } from './types';

// SIUS Result Service: public competition results, no login (the SPA itself sends "Bearer null").
const RESULTS = 'https://shootingsportscloud.com:8594/api/v1';
const PAGE_SIZE = 20;

async function call(path: string, fetchImpl: typeof fetch, json?: unknown): Promise<unknown> {
  const r = await siusRequest(fetchImpl, `${RESULTS}/${path}`, {
    headers: { Authorization: 'Bearer null', Accept: 'application/json' },
    ...(json !== undefined ? { json } : {}),
  });
  if (r.status !== 200) throw new SiusAuthFailure('unavailable', `Result Service HTTP ${r.status}`);
  try {
    return JSON.parse(r.text);
  } catch {
    throw new SiusAuthFailure('unavailable', 'Result Service answered without JSON');
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export async function listCompetitions(
  q: { page: number; name: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ items: SiusCompetition[]; more: boolean }> {
  const params = new URLSearchParams({
    Page: String(q.page),
    PageSize: String(PAGE_SIZE),
    Name: q.name,
    Sort: JSON.stringify({ StartDate: 'desc' }),
    IsPublic: 'true',
  });
  const json = (await call(`pub/competitions?${params}`, fetchImpl)) as { data?: Record<string, unknown>[]; totalcount?: number; pagenumber?: number; pagesize?: number };
  const items = (json.data ?? []).map<SiusCompetition>((c) => ({
    id: str(c.RunningId),
    name: str(c.Name),
    city: str(c.City),
    country: str(c.Country),
    startDate: str(c.StartDate),
    endDate: str(c.EndDate),
    timeZone: str(c.TimeZone),
  }));
  const page = json.pagenumber ?? q.page;
  const size = json.pagesize ?? PAGE_SIZE;
  return { items, more: typeof json.totalcount === 'number' ? page * size < json.totalcount : items.length >= PAGE_SIZE };
}

export async function listEvents(compId: string, fetchImpl: typeof fetch = fetch): Promise<SiusEvent[]> {
  const params = new URLSearchParams({ CompetitionId: compId, Name: '', Sort: JSON.stringify({ Startdate: 'asc' }) });
  const json = (await call(`pub/competitions/events?${params}`, fetchImpl)) as Record<string, unknown>[];
  return (Array.isArray(json) ? json : []).map((e) => ({
    id: str(e.RunningId),
    name: str((e.CompetitionEventType as Record<string, unknown> | undefined)?.Name),
  }));
}

/** The event's individual parts (team rows of the same part are dropped). */
export async function listParts(compId: string, eventId: string, fetchImpl: typeof fetch = fetch): Promise<SiusPart[]> {
  const json = (await call(`pub/competitions/${encodeURIComponent(compId)}/events/${encodeURIComponent(eventId)}/subevents`, fetchImpl)) as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: SiusPart[] = [];
  for (const p of Array.isArray(json) ? json : []) {
    if (p.TeamKind && p.TeamKind !== 'Individual') continue;
    const id = str(p.RunningId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: str(p.Name), startDate: str(p.Startdate) });
  }
  return out;
}

function partParams(compId: string, eventId: string, partId: string) {
  return { runningCompetitionId: compId, runningCompetitionEventId: eventId, subEventId: partId, shooterGroup: 'Regulars', teamKind: 'Individual' };
}

export async function getRanking(compId: string, eventId: string, partId: string, fetchImpl: typeof fetch = fetch): Promise<RankingRow[]> {
  const json = (await call(`pub/series?${new URLSearchParams(partParams(compId, eventId, partId))}`, fetchImpl)) as Record<string, unknown>[];
  const rows = (Array.isArray(json) ? json : []).flatMap((block) => (block['Series-Individual'] as Record<string, unknown>[] | undefined) ?? []);
  return rows.flatMap<RankingRow>((row) => {
    const a = ((row.AthletesSeries as Record<string, unknown>[] | undefined) ?? [])[0];
    const id = a?.AthleteIdentifier as Record<string, unknown> | undefined;
    if (!a || !id) return [];
    const series = ((a.Series as { Value?: unknown }[][] | undefined) ?? []).flat();
    return [{
      athleteRunningId: str(id.RunningId),
      identifier: str(id.Identifier),
      displayName: str(row.DisplayName),
      nation: str(row.Nation),
      rank: str((row.Rank as Record<string, unknown> | undefined)?.DisplayText),
      total: str((row.Result as Record<string, unknown> | undefined)?.Value ?? a.Result),
      seriesTotals: series.map((s) => str(s.Value)),
    }];
  });
}

export async function getAthleteShots(
  compId: string,
  eventId: string,
  partId: string,
  athleteRunningId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SiusShotsResponse> {
  return (await call('Athletes/shotgroups', fetchImpl, { ...partParams(compId, eventId, partId), athleteRunningIds: [athleteRunningId] })) as SiusShotsResponse;
}
