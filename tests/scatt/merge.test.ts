import { describe, expect, it } from 'vitest';
import { alignMatch, selectMatchShots } from '@/lib/alignment/align';
import type { ScattData, ScattTraceFile } from '@/lib/parsers/scatt';
import { ID_STRIDE, mergeScattData, mergeScattTraces } from '@/lib/scatt/merge';

const data = (start: number, ids: number[]): ScattData => ({
  sessionStartMs: start,
  distanceM: 10,
  caliberMm: 4.5,
  shots: ids.map((id) => ({ id, tMs: start + id * 1000, flaggedMatch: true })),
});

describe('mergeScattData', () => {
  it('returns a single file unchanged', () => {
    const a = data(1000, [1, 2]);
    expect(mergeScattData([a])).toBe(a);
  });

  it('keeps colliding shot ids apart and orders files by session start, whatever the input order', () => {
    const first = data(1_000_000, [1, 2, 3]);
    const second = data(9_000_000, [1, 2]);
    const merged = mergeScattData([second, first]);
    expect(merged.sessionStartMs).toBe(1_000_000);
    expect(merged.shots.map((s) => s.id)).toEqual([1, 2, 3, 1 + ID_STRIDE, 2 + ID_STRIDE]);
    expect(new Set(merged.shots.map((s) => s.id)).size).toBe(5);
  });

  it('lets a "last n" selection span both files', () => {
    const merged = mergeScattData([data(1_000_000, [1, 2, 3]), data(9_000_000, [1, 2])]);
    const picked = selectMatchShots(merged.shots, { kind: 'last', n: 4 });
    expect(picked.map((s) => s.id)).toEqual([2, 3, 1 + ID_STRIDE, 2 + ID_STRIDE]);
    const sius = { series: [{ shots: [{ value: 10 }, { value: 9 }, { value: 8 }, { value: 7 }] }] } as never;
    expect(alignMatch(sius, picked, []).countMismatch).toBe(0);
  });
});

describe('mergeScattTraces', () => {
  const trace = (start: number, shotId: number, traceId: number): ScattTraceFile => ({
    sampleRate: 100,
    sessionStartMs: start,
    traces: new Map([[traceId, { x: new Float32Array(1), y: new Float32Array(1), timer: start, timerEnter: start } as never]]),
    shots: [{ shotId, traceId, timer: start, offset: 0, match: true, missed: false, deleted: false }],
    rawBlob: () => new Uint8Array([traceId]),
  });

  it('applies the same id shift as mergeScattData', () => {
    const merged = mergeScattTraces([trace(9_000_000, 1, 1), trace(1_000_000, 1, 1)]);
    expect(merged.shots.map((s) => [s.shotId, s.traceId])).toEqual([
      [1, 1],
      [1 + ID_STRIDE, 1 + ID_STRIDE],
    ]);
    expect([...merged.traces.keys()].sort((a, b) => a - b)).toEqual([1, 1 + ID_STRIDE]);
    expect(merged.rawBlob(1 + ID_STRIDE)).toEqual(new Uint8Array([1]));
  });

  it('refuses files with different sample rates', () => {
    const b = { ...trace(9_000_000, 1, 1), sampleRate: 200 };
    expect(() => mergeScattTraces([trace(1_000_000, 1, 1), b])).toThrow();
  });
});
