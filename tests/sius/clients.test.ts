import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SiusAuthFailure } from '@/lib/sius/auth';
import { getExerciseShots, listExercises } from '@/lib/sius/training';
import { getAthleteShots, getRanking, listCompetitions, listEvents, listParts } from '@/lib/sius/results';

const fxText = (name: string) => readFileSync(new URL(`../fixtures/sius/${name}`, import.meta.url), 'utf8');

type Call = { url: URL; method: string; headers: Headers; body: string | null };
function fake(reply: (c: Call) => { status: number; body: string }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c: Call = { url: new URL(String(input)), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? init.body : null };
    calls.push(c);
    const r = reply(c);
    return new Response(r.body, { status: r.status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const exercise = (i: number) => ({ exerciseId: `ex-${i}`, exerciseName: '10m Air Rifle', exerciseDate: '2026-11-01T00:00:00', numberOfCompetitionShots: 60, totalString: '630.9' });

describe('Training Center', () => {
  it('lists exercises with the exact load options and the bearer token', async () => {
    const f = fake(() => ({ status: 200, body: JSON.stringify({ data: [exercise(1), exercise(2)], totalCount: -1 }) }));
    const r = await listExercises('TOKEN', { skip: 20, take: 2 }, f.fetchImpl);
    expect(r.items.map((e) => e.exerciseId)).toEqual(['ex-1', 'ex-2']);
    expect(r.more).toBe(true);
    const c = f.calls[0];
    expect(`${c.url.origin}${c.url.pathname}`).toBe('https://shootingsportscloud.com:8598/api/user-results');
    expect(c.headers.get('authorization')).toBe('Bearer TOKEN');
    expect(JSON.parse(c.url.searchParams.get('loadOptions')!)).toEqual({
      sort: [{ selector: 'exerciseDate', desc: true }],
      group: null,
      searchOperation: 'contains',
      searchValue: null,
      skip: 20,
      take: 2,
      userData: {},
      stringToLower: true,
    });
  });

  it('a short page means no more', async () => {
    const f = fake(() => ({ status: 200, body: JSON.stringify({ data: [exercise(1)], totalCount: -1 }) }));
    expect((await listExercises('T', { skip: 0, take: 20 }, f.fetchImpl)).more).toBe(false);
  });

  it('reads an exercise’s shots', async () => {
    const f = fake(() => ({ status: 200, body: fxText('air-60-sighters.json') }));
    const r = await getExerciseShots('T', 'ex 1', f.fetchImpl);
    expect(r.type).toBe('SingleStage');
    expect(f.calls[0].url.pathname).toBe('/api/user-results/ex%201/shots');
  });

  it('401 → SiusAuthFailure blocked (token no longer valid)', async () => {
    const f = fake(() => ({ status: 401, body: '' }));
    const err = await listExercises('T', { skip: 0, take: 20 }, f.fetchImpl).catch((e) => e);
    expect(err).toBeInstanceOf(SiusAuthFailure);
    expect(err.kind).toBe('blocked');
  });

  it('other errors → unavailable', async () => {
    const f = fake(() => ({ status: 404, body: '' }));
    await expect(getExerciseShots('T', 'x', f.fetchImpl)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});

describe('Result Service', () => {
  const C = '1251b444-9f11-4de6-bcf8-b06984faf318';
  const E = '0293b7ce-f18c-42c0-a238-f2b003db2894';
  const P = '8c37ffc6-b46f-4c0e-8d9f-f7b2cc0115a6';

  it('lists competitions newest first with search and paging', async () => {
    const f = fake(() => ({ status: 200, body: fxText('public-competitions.json') }));
    const r = await listCompetitions({ page: 1, name: 'world' }, f.fetchImpl);
    expect(r.items[0]).toEqual({ id: C, name: 'ISSF World Championship', city: 'Doha', country: 'Qatar', startDate: '2026-10-31T21:00:00Z', endDate: '2026-11-13T21:00:00Z', timeZone: 'Asia/Qatar' });
    expect(r.more).toBe(true);
    const q = f.calls[0].url.searchParams;
    expect(f.calls[0].url.pathname).toBe('/api/v1/pub/competitions');
    expect(q.get('Name')).toBe('world');
    expect(q.get('Page')).toBe('1');
    expect(q.get('PageSize')).toBe('20');
    expect(q.get('IsPublic')).toBe('true');
    expect(JSON.parse(q.get('Sort')!)).toEqual({ StartDate: 'desc' });
  });

  it('lists events by SIUS name', async () => {
    const f = fake(() => ({ status: 200, body: fxText('public-events.json') }));
    const r = await listEvents(C, f.fetchImpl);
    expect(r).toContainEqual({ id: E, name: '10m AIR RIFLE MEN' });
    expect(f.calls[0].url.searchParams.get('CompetitionId')).toBe(C);
  });

  it('lists individual parts once each', async () => {
    const f = fake(() => ({ status: 200, body: fxText('public-subevents.json') }));
    const r = await listParts(C, E, f.fetchImpl);
    expect(r).toEqual([
      { id: P, name: 'Qualification', startDate: '2026-11-03T09:15:00+03:00' },
      { id: '2ee75cc0-4622-41ce-8e13-b092c21d4953', name: 'Final', startDate: '2026-11-03T14:30:00+03:00' },
    ]);
    expect(f.calls[0].url.pathname).toBe(`/api/v1/pub/competitions/${C}/events/${E}/subevents`);
  });

  it('maps the ranking with identifiers and series totals', async () => {
    const f = fake(() => ({ status: 200, body: fxText('public-ranking.json') }));
    const r = await getRanking(C, E, P, f.fetchImpl);
    expect(r[0]).toEqual({
      athleteRunningId: '291d05a9-0739-4a74-b617-6255d2a182bc',
      identifier: 'SHCHNM0412200401',
      displayName: 'SHENG Lihao',
      nation: 'CHN',
      rank: '1',
      total: '637.2',
      seriesTotals: ['105.5', '106.1', '106.6', '106.0', '106.9', '106.1'],
    });
    const q = f.calls[0].url.searchParams;
    expect(q.get('runningCompetitionId')).toBe(C);
    expect(q.get('runningCompetitionEventId')).toBe(E);
    expect(q.get('subEventId')).toBe(P);
    expect(q.get('shooterGroup')).toBe('Regulars');
    expect(q.get('teamKind')).toBe('Individual');
  });

  it('posts the athlete shot request body exactly', async () => {
    const f = fake(() => ({ status: 200, body: fxText('public-qual.json') }));
    const r = await getAthleteShots(C, E, P, 'ath-1', f.fetchImpl);
    expect(r.competitionGroups).toHaveLength(6);
    expect(f.calls[0].method).toBe('POST');
    expect(f.calls[0].url.pathname).toBe('/api/v1/Athletes/shotgroups');
    expect(JSON.parse(f.calls[0].body!)).toEqual({
      runningCompetitionId: C,
      runningCompetitionEventId: E,
      subEventId: P,
      shooterGroup: 'Regulars',
      teamKind: 'Individual',
      athleteRunningIds: ['ath-1'],
    });
  });

  it('non-200 → unavailable', async () => {
    const f = fake(() => ({ status: 400, body: '' }));
    await expect(listEvents(C, f.fetchImpl)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
