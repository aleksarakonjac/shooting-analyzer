import { describe, expect, it, vi } from 'vitest';
import { parsePullInput, pullPulse, type PullDeps } from '../../src/lib/googleHealth/pull';
import { GoogleHealthError } from '../../src/lib/googleHealth/client';
import { parseTcx } from '../../src/lib/parsers/tcx';
import type { HrSample } from '../../src/lib/parsers/tcx';
import type { Span } from '../../src/lib/googleHealth/window';

const at = (h: number, m = 0, d = 13) => Date.UTC(2026, 10, d, h, m);
const everyTwoSeconds = (s: Span): HrSample[] => {
  const out: HrSample[] = [];
  for (let t = s.fromMs; t < s.toMs; t += 2000) out.push({ tMs: t, bpm: 70 });
  return out;
};

function deps(over: Partial<PullDeps> = {}, google: Partial<PullDeps['google']> = {}) {
  const d = {
    callerId: 'shooter',
    isCoachOf: vi.fn(async (id: string) => id === 'shooter'),
    loadTraining: vi.fn(async () => null),
    loadLink: vi.fn(async () => ({ refreshTokenEnc: 'sealed', brokenAt: null as string | null })),
    markBroken: vi.fn(async () => {}),
    touch: vi.fn(async () => {}),
    decrypt: (s: string) => `plain:${s}`,
    tz: 'Europe/Belgrade',
    google: {
      refresh: vi.fn(async () => 'access'),
      workouts: vi.fn(async () => []),
      heartRate: vi.fn(async (_at: string, s: Span) => everyTwoSeconds(s)),
      ...google,
    },
    ...over,
  };
  return d as PullDeps & typeof d;
}

const fresh = { shooterId: 'shooter', date: '2026-11-13', shotSpan: { fromMs: at(15, 20), toMs: at(16, 20) } };

describe('pullPulse auth', () => {
  it('401 without a caller', async () => {
    expect(await pullPulse(fresh, deps({ callerId: null }))).toMatchObject({ status: 401 });
  });
  it('shooter pulls their own pulse', async () => {
    const r = await pullPulse(fresh, deps());
    expect(r.status).toBe(200);
  });
  it('coach of the shooter pulls', async () => {
    expect((await pullPulse(fresh, deps({ callerId: 'coach' }))).status).toBe(200);
  });
  it('coach of someone else is refused', async () => {
    const d = deps({ callerId: 'coach', isCoachOf: vi.fn(async () => false) });
    expect(await pullPulse(fresh, d)).toEqual({ status: 403, error: 'forbidden' });
    expect(d.loadLink).not.toHaveBeenCalled();
  });
});

describe('pullPulse windows', () => {
  it('trainingId ignores client times and reads the stored ones', async () => {
    const d = deps({
      loadTraining: vi.fn(async () => ({ shooterId: 'shooter', date: '2026-11-13', shotSpan: { fromMs: at(10), toMs: at(11) }, training: null })),
    });
    const r = await pullPulse({ trainingId: 't1' }, d);
    expect(r).toMatchObject({ status: 200, source: 'shots', range: { fromMs: at(9, 40), toMs: at(11, 20) } });
  });
  it('unknown training is 404', async () => {
    expect(await pullPulse({ trainingId: 't1' }, deps())).toEqual({ status: 404, error: 'not_found' });
  });
  it('coach with only training times gets no_window', async () => {
    const r = await pullPulse({ shooterId: 'shooter', date: '2026-11-13', startedAt: new Date(at(10)).toISOString(), endedAt: new Date(at(11)).toISOString() }, deps({ callerId: 'coach' }));
    expect(r).toEqual({ status: 422, error: 'no_window' });
  });
  it('finds a workout whose UTC date differs from the training date', async () => {
    const d = deps({}, { workouts: vi.fn(async () => [{ id: 'w', startMs: Date.UTC(2026, 10, 13, 23, 40), endMs: Date.UTC(2026, 10, 14, 0, 50) }]) });
    const r = await pullPulse({ shooterId: 'shooter', date: '2026-11-14' }, d);
    expect(r).toMatchObject({ status: 200, source: 'workout' });
    expect(d.google.workouts).toHaveBeenCalledWith('access', '2026-11-13', '2026-11-16');
  });
});

describe('pullPulse connection', () => {
  it('409 not_connected without a link', async () => {
    expect(await pullPulse(fresh, deps({ loadLink: vi.fn(async () => null) }))).toEqual({ status: 409, error: 'not_connected' });
  });
  it('409 reconnect when the link is broken', async () => {
    expect(await pullPulse(fresh, deps({ loadLink: vi.fn(async () => ({ refreshTokenEnc: 's', brokenAt: '2026-11-14T00:00:00Z' })) }))).toEqual({ status: 409, error: 'reconnect' });
  });
  it('invalid_grant marks link broken', async () => {
    const d = deps({}, { refresh: vi.fn(async () => { throw new GoogleHealthError('invalid_grant', 400); }) });
    expect(await pullPulse(fresh, d)).toEqual({ status: 409, error: 'reconnect' });
    expect(d.markBroken).toHaveBeenCalledTimes(1);
    expect(d.markBroken).toHaveBeenCalledWith('shooter');
  });
  it('unavailable becomes 503', async () => {
    const d = deps({}, { heartRate: vi.fn(async () => { throw new GoogleHealthError('unavailable', 503); }) });
    expect(await pullPulse(fresh, d)).toEqual({ status: 503, error: 'google_unavailable' });
  });
  it('refresh token is decrypted before use', async () => {
    const d = deps();
    await pullPulse(fresh, d);
    expect(d.google.refresh).toHaveBeenCalledWith('plain:sealed');
  });
});

describe('pullPulse data', () => {
  it('no samples is 404 no_data and does not touch', async () => {
    const d = deps({}, { heartRate: vi.fn(async () => []) });
    expect(await pullPulse(fresh, d)).toEqual({ status: 404, error: 'no_data' });
    expect(d.touch).not.toHaveBeenCalled();
  });
  it('partial data still builds a TCX', async () => {
    const d = deps({}, { heartRate: vi.fn(async (_a: string, s: Span) => everyTwoSeconds({ fromMs: s.fromMs, toMs: s.fromMs + 10 * 60_000 })) });
    const r = await pullPulse(fresh, d);
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    expect(parseTcx(r.tcx).samples).toHaveLength(300);
    expect(r.fileName).toBe('google-health-2026-11-13-1600.tcx');
    expect(d.touch).toHaveBeenCalledWith('shooter');
  });
});

describe('parsePullInput', () => {
  const id = '3f1e2d4c-5b6a-4789-8abc-def012345678';
  it('accepts a training id', () => {
    expect(parsePullInput({ trainingId: id, date: 'ignored' })).toEqual({ trainingId: id });
  });
  it('accepts a new-training request', () => {
    expect(parsePullInput({ shooterId: id, date: '2026-11-13', shotSpan: { fromMs: 1, toMs: 2 }, startedAt: null, endedAt: '2026-11-13T10:00:00.000Z' })).toEqual({
      shooterId: id,
      date: '2026-11-13',
      shotSpan: { fromMs: 1, toMs: 2 },
      startedAt: null,
      endedAt: '2026-11-13T10:00:00.000Z',
    });
  });
  it('rejects bad ids, dates and spans', () => {
    expect(parsePullInput({ trainingId: 'x' })).toBeNull();
    expect(parsePullInput({ shooterId: id, date: '13.11.2026' })).toBeNull();
    expect(parsePullInput({ shooterId: id, date: '2026-11-13', shotSpan: { fromMs: 5, toMs: 1 } })).toBeNull();
    expect(parsePullInput(null)).toBeNull();
  });
});

describe('final review fixes', () => {
  it('ignores a SHOOTING workout from another day when there are no shots', async () => {
    const friday = { id: 'fri', startMs: Date.UTC(2026, 10, 13, 17), endMs: Date.UTC(2026, 10, 13, 19) };
    const saturday = { id: 'sat', startMs: Date.UTC(2026, 10, 14, 9), endMs: Date.UTC(2026, 10, 14, 10) };
    const r = await pullPulse({ shooterId: 'shooter', date: '2026-11-14' }, deps({}, { workouts: vi.fn(async () => [friday, saturday]) }));
    expect(r).toMatchObject({ status: 200, source: 'workout', workout: saturday });
    const none = await pullPulse({ shooterId: 'shooter', date: '2026-11-15' }, deps({}, { workouts: vi.fn(async () => [friday, saturday]) }));
    expect(none).toEqual({ status: 422, error: 'no_window' });
  });

  it('lets the shooter add unsaved shots to a saved training', async () => {
    const d = deps({ loadTraining: vi.fn(async () => ({ shooterId: 'shooter', date: '2026-11-13', shotSpan: null, training: null })) });
    const r = await pullPulse({ trainingId: 't1', shotSpan: { fromMs: at(10), toMs: at(11) } }, d);
    expect(r).toMatchObject({ status: 200, source: 'shots', range: { fromMs: at(9, 40), toMs: at(11, 20) } });
  });

  it('ignores unsaved times from a coach on a saved training', async () => {
    const d = deps({ callerId: 'coach', loadTraining: vi.fn(async () => ({ shooterId: 'shooter', date: '2026-11-13', shotSpan: null, training: null })) });
    expect(await pullPulse({ trainingId: 't1', shotSpan: { fromMs: at(10), toMs: at(11) } }, d)).toEqual({ status: 422, error: 'no_window' });
  });

  it('reports the span of the pulse actually received', async () => {
    const d = deps({}, { heartRate: vi.fn(async (_a: string, s: Span) => everyTwoSeconds({ fromMs: s.fromMs, toMs: s.fromMs + 10 * 60_000 })) });
    const r = await pullPulse(fresh, d);
    if (r.status !== 200) throw new Error('expected 200');
    expect(r.received).toEqual({ fromMs: at(15), toMs: at(15, 10) - 2000, count: 300 });
  });

  it('a token that cannot be decrypted marks the link broken', async () => {
    const d = deps({ decrypt: () => { throw new Error('bad tag'); } });
    expect(await pullPulse(fresh, d)).toEqual({ status: 409, error: 'reconnect' });
    expect(d.markBroken).toHaveBeenCalledWith('shooter');
  });
});

describe('Google refusals on data calls', () => {
  it('401 or 403 from Google marks the link broken and asks to reconnect', async () => {
    for (const status of [401, 403]) {
      const d = deps({}, { heartRate: vi.fn(async () => { throw new GoogleHealthError('http', status); }) });
      expect(await pullPulse(fresh, d)).toEqual({ status: 409, error: 'reconnect' });
      expect(d.markBroken).toHaveBeenCalledWith('shooter');
    }
  });
  it('an account not linked to the Google Health app gets its own error', async () => {
    const d = deps({}, { workouts: vi.fn(async () => { throw new GoogleHealthError('not_linked', 400); }) });
    expect(await pullPulse(fresh, d)).toEqual({ status: 409, error: 'not_linked' });
    expect(d.markBroken).not.toHaveBeenCalled();
  });
});
