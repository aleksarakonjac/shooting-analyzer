import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SiusAuthFailure } from '@/lib/sius/auth';
import { SiusNotConnected, SiusReconnectNeeded, SiusUnavailable, SiusNotConfigured } from '@/lib/sius/session';
import {
  athletePerformance,
  confirmAthlete,
  connectSius,
  disconnectSius,
  exerciseResult,
  exercises,
  myPerformance,
  type SiusDeps,
} from '@/lib/sius/service';
import type { RankingRow, SiusExercise, SiusShotsResponse } from '@/lib/sius/types';

const fx = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/sius/${name}`, import.meta.url), 'utf8')) as SiusShotsResponse;
const air = fx('air-60-sighters.json');
const qual = fx('public-qual.json');

const ME = 'me';
const SHOOTER = 'shooter';
const ex = (i: number): SiusExercise => ({ exerciseId: `ex-${i}`, exerciseName: '10m Air Rifle', exerciseDate: '2026-11-01T00:00:00', numberOfCompetitionShots: 60 });
const rank = (name: string, id: string): RankingRow => ({ athleteRunningId: `run-${id}`, identifier: id, displayName: name, nation: 'SRB', rank: '1', total: '630.0', seriesTotals: ['105.0'] });
const sel = { compId: 'c', eventId: 'e', partId: 'p', eventName: '10m AIR RIFLE MEN', partName: 'Qualification' };

function deps(over: Partial<SiusDeps> = {}): SiusDeps {
  return {
    callerId: ME,
    isCoachOf: vi.fn(async (sid: string) => sid === SHOOTER),
    token: vi.fn(async () => 'AT'),
    renewToken: vi.fn(async () => 'AT2'),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    training: { list: vi.fn(async () => ({ items: [ex(1), ex(2)], more: false })), shots: vi.fn(async () => air) },
    results: {
      competitions: vi.fn(async () => ({ items: [], more: false })),
      events: vi.fn(async () => []),
      parts: vi.fn(async () => []),
      ranking: vi.fn(async () => [rank('SHENG Lihao', 'CHN1'), rank('RAKONJAC Aleksa', 'SRB1')]),
      athleteShots: vi.fn(async () => qual),
    },
    importedTrainings: vi.fn(async () => new Map([['ex-2', 'training-2']])),
    duplicateOf: vi.fn(async () => null),
    athleteId: vi.fn(async () => null),
    setAthleteId: vi.fn(async () => undefined),
    shooterName: vi.fn(async () => 'Aleksa Rakonjac'),
    ...over,
  };
}

describe('connect / disconnect', () => {
  it('unauthenticated → rejected, nothing called', async () => {
    const d = deps({ callerId: null });
    await expect(connectSius(d, 'a@b', 'pw')).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(d.connect).not.toHaveBeenCalled();
    await expect(disconnectSius(d)).resolves.toEqual({ ok: false, error: 'forbidden' });
    expect(d.disconnect).not.toHaveBeenCalled();
  });

  it('connects the caller only', async () => {
    const d = deps();
    await expect(connectSius(d, 'a@b', 'pw')).resolves.toEqual({ ok: true });
    expect(d.connect).toHaveBeenCalledWith(ME, 'a@b', 'pw');
  });

  it('maps failures to typed errors', async () => {
    const cases: [unknown, string][] = [
      [new SiusAuthFailure('bad_password'), 'bad_password'],
      [new SiusAuthFailure('blocked'), 'blocked'],
      [new SiusUnavailable(true), 'limit'],
      [new SiusUnavailable(), 'unavailable'],
      [new SiusNotConfigured(), 'not_configured'],
    ];
    for (const [err, code] of cases) {
      const d = deps({ connect: vi.fn(async () => { throw err; }) });
      await expect(connectSius(d, 'a@b', 'pw')).resolves.toEqual({ ok: false, error: code });
    }
  });

  it('rejects empty or oversized input without calling SIUS', async () => {
    const d = deps();
    await expect(connectSius(d, ' ', 'pw')).resolves.toEqual({ ok: false, error: 'bad_password' });
    await expect(connectSius(d, 'a@b', 'x'.repeat(300))).resolves.toEqual({ ok: false, error: 'bad_password' });
    expect(d.connect).not.toHaveBeenCalled();
  });
});

describe('exercises', () => {
  it('lists the caller’s exercises with the imported training id', async () => {
    const d = deps();
    const r = await exercises(d, ME, 0);
    expect(r).toEqual({ items: [{ ...ex(1), importedTrainingId: null }, { ...ex(2), importedTrainingId: 'training-2' }], more: false });
    expect(d.training.list).toHaveBeenCalledWith('AT', { skip: 0, take: 20 });
    expect(d.importedTrainings).toHaveBeenCalledWith(ME, ['ex-1', 'ex-2']);
  });

  it('coach of shooter reads exercises with the shooter’s token', async () => {
    const d = deps();
    await exercises(d, SHOOTER, 20);
    expect(d.token).toHaveBeenCalledWith(SHOOTER);
    expect(d.training.list).toHaveBeenCalledWith('AT', { skip: 20, take: 20 });
  });

  it('unrelated user → forbidden and no SIUS call', async () => {
    const d = deps();
    await expect(exercises(d, 'stranger', 0)).resolves.toEqual({ state: 'forbidden' });
    expect(d.token).not.toHaveBeenCalled();
  });

  it('token states map to SiusState', async () => {
    const states: [unknown, object][] = [
      [new SiusReconnectNeeded('bad_password'), { state: 'broken', reason: 'bad_password' }],
      [new SiusNotConnected(), { state: 'none' }],
      [new SiusNotConfigured(), { state: 'not_configured' }],
      [new SiusUnavailable(true), { state: 'unavailable', reason: 'limit' }],
      [new SiusUnavailable(), { state: 'unavailable' }],
    ];
    for (const [err, state] of states) {
      const d = deps({ token: vi.fn(async () => { throw err; }) });
      await expect(exercises(d, ME, 0)).resolves.toEqual(state);
    }
  });

  it('a token SIUS no longer accepts is renewed once', async () => {
    const list = vi.fn(async (at: string) => {
      if (at === 'AT') throw new SiusAuthFailure('blocked');
      return { items: [ex(1)], more: false };
    });
    const d = deps({ training: { list, shots: vi.fn() } });
    const r = await exercises(d, ME, 0);
    expect(r).toMatchObject({ items: [{ exerciseId: 'ex-1' }] });
    expect(d.renewToken).toHaveBeenCalledWith(ME);
  });

  it('negative or odd skip is clamped', async () => {
    const d = deps();
    await exercises(d, ME, -5);
    expect(d.training.list).toHaveBeenCalledWith('AT', { skip: 0, take: 20 });
  });
});

describe('exerciseResult', () => {
  it('maps the shots and reports a duplicate', async () => {
    const d = deps({ duplicateOf: vi.fn(async () => 'training-9') });
    const r = await exerciseResult(d, ME, 'ex-1', '10m Air Rifle');
    if ('state' in r) throw new Error('unexpected state');
    expect(r.parsed.series).toHaveLength(6);
    expect(r.externalId).toBe('ex-1');
    expect(JSON.parse(r.raw).type).toBe('SingleStage');
    expect(r.duplicateOf).toBe('training-9');
    expect(d.duplicateOf).toHaveBeenCalledWith(ME, Date.parse('2026-08-19T08:36:52.59Z'), 60, 'ex-1');
  });
});

describe('competition performance', () => {
  it('finds the shooter’s row by exact name and returns the performance', async () => {
    const d = deps();
    const r = await myPerformance(d, ME, sel);
    if (!('found' in r)) throw new Error('expected found');
    expect(d.results.athleteShots).toHaveBeenCalledWith('c', 'e', 'p', 'run-SRB1');
    expect(r.found.externalId).toBe('comp:p:run-SRB1');
    expect(r.found.row.displayName).toBe('RAKONJAC Aleksa');
    expect(r.found.parsed.series).toHaveLength(6);
  });

  it('not found → the whole ranking, no shots fetched', async () => {
    const d = deps({ shooterName: vi.fn(async () => 'Nobody Here') });
    const r = await myPerformance(d, ME, sel);
    expect(r).toEqual({ notFound: true, pick: expect.arrayContaining([expect.objectContaining({ identifier: 'SRB1' })]) });
    expect(d.results.athleteShots).not.toHaveBeenCalled();
  });

  it('a picked athlete is only previewed; confirming saves the identifier', async () => {
    const d = deps();
    const r = await athletePerformance(d, ME, sel, 'run-CHN1');
    expect(r).toMatchObject({ externalId: 'comp:p:run-CHN1' });
    expect(d.setAthleteId).not.toHaveBeenCalled();
    await expect(confirmAthlete(d, ME, 'CHN1')).resolves.toEqual({ ok: true });
    expect(d.setAthleteId).toHaveBeenCalledWith(ME, 'CHN1');
  });

  it('confirming for an unrelated shooter is forbidden', async () => {
    const d = deps();
    await expect(confirmAthlete(d, 'stranger', 'X')).resolves.toEqual({ state: 'forbidden' });
    expect(d.setAthleteId).not.toHaveBeenCalled();
  });

  it('a final part keeps decimal values', async () => {
    const d = deps();
    const r = await athletePerformance(d, ME, { ...sel, eventName: '50m RIFLE 3 POSITIONS MEN', partName: 'Final' }, 'run-1');
    if ('state' in r) throw new Error('unexpected state');
    expect(r.parsed.series[0].shots[0].valueDecimal).toBeUndefined();
  });

  it('SIUS down → unavailable', async () => {
    const d = deps({ results: { ...deps().results, ranking: vi.fn(async () => { throw new SiusAuthFailure('unavailable'); }) } });
    await expect(myPerformance(d, ME, sel)).resolves.toEqual({ state: 'unavailable' });
  });
});

describe('unexpected errors', () => {
  it('a database or decrypt failure becomes unavailable instead of escaping', async () => {
    const d = deps({ token: vi.fn(async () => { throw new Error('sius_links read failed (42P01)'); }) });
    await expect(exercises(d, ME, 0)).resolves.toEqual({ state: 'unavailable' });
    const c = deps({ connect: vi.fn(async () => { throw new Error('sius_links write failed (42P01)'); }) });
    await expect(connectSius(c, 'a@b', 'pw')).resolves.toEqual({ ok: false, error: 'unavailable' });
  });
});

