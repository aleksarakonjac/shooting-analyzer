import { describe, expect, it } from 'vitest';
import { chooseWindows, MAX_FETCH_MS, type Span, type Workout } from '../../src/lib/googleHealth/window';

const at = (h: number, m = 0) => Date.UTC(2026, 10, 13, h, m);
const span = (a: number, b: number): Span => ({ fromMs: a, toMs: b });
const wo = (id: string, a: number, b: number): Workout => ({ id, startMs: a, endMs: b });

describe('chooseWindows', () => {
  it('shots win over workout and training', () => {
    const r = chooseWindows({ shots: span(at(10), at(11)), workouts: [wo('w', at(9, 30), at(11, 30))], training: span(at(9), at(12)), isCoach: false });
    expect(r).toEqual({ ok: true, source: 'shots', match: span(at(10), at(11)), fetch: span(at(9), at(12)), workout: wo('w', at(9, 30), at(11, 30)) });
  });

  it('uses the workout when there are no shots', () => {
    const r = chooseWindows({ shots: null, workouts: [wo('w', at(10), at(11))], training: span(at(9, 50), at(11, 5)), isCoach: false });
    expect(r).toMatchObject({ ok: true, source: 'workout', match: span(at(10), at(11)), fetch: span(at(9, 40), at(11, 20)) });
  });

  it('picks the workout overlapping the training, else the longest', () => {
    const short = wo('short', at(8), at(8, 30));
    const long = wo('long', at(14), at(16));
    const r1 = chooseWindows({ shots: null, workouts: [long, short], training: span(at(8), at(9)), isCoach: false });
    expect(r1).toMatchObject({ ok: true, workout: short, match: span(at(8), at(8, 30)) });
    const r2 = chooseWindows({ shots: null, workouts: [short, long], training: null, isCoach: false });
    expect(r2).toMatchObject({ ok: true, workout: long, match: span(at(14), at(16)) });
  });

  it('uses training times for the shooter', () => {
    const r = chooseWindows({ shots: null, workouts: [], training: span(at(10), at(11)), isCoach: false });
    expect(r).toMatchObject({ ok: true, source: 'training', match: span(at(10), at(11)), fetch: span(at(9, 40), at(11, 20)), workout: null });
  });

  it('coach cannot use training times', () => {
    expect(chooseWindows({ shots: null, workouts: [], training: span(at(10), at(11)), isCoach: true })).toEqual({ ok: false, error: 'no_window' });
    const r = chooseWindows({ shots: span(at(10), at(11)), workouts: [], training: span(at(6), at(12)), isCoach: true });
    expect(r).toMatchObject({ ok: true, fetch: span(at(9, 40), at(11, 20)) });
  });

  it('nothing gives no_window', () => {
    expect(chooseWindows({ shots: null, workouts: [], training: null, isCoach: false })).toEqual({ ok: false, error: 'no_window' });
  });

  it('caps the fetch range at 6 h centered on the match', () => {
    const r = chooseWindows({ shots: span(at(12), at(12, 10)), workouts: [], training: span(at(0), at(23, 59)), isCoach: false });
    if (!r.ok) throw new Error('expected ok');
    expect(r.fetch.toMs - r.fetch.fromMs).toBe(MAX_FETCH_MS);
    expect((r.fetch.fromMs + r.fetch.toMs) / 2).toBe(at(12, 5));
  });
});
