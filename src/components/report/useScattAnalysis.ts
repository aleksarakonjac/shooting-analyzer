'use client';
import { useEffect, useMemo, useState } from 'react';
import type { DisciplineId } from '@/lib/domain/types';
import { scattBrowserOptions } from '@/lib/parsers/browser';
import { readScattTraces, type ScattTraceFile } from '@/lib/parsers/scatt';
import { analyseShots, intervalStability, type ShotAnalysis } from '@/lib/scatt/analysis';
import { buildReplay, type Replay } from '@/lib/scatt/replay';
import { scattTargetFor } from '@/lib/scatt/targets';
import { createClient } from '@/lib/supabase/client';

export type ScattState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; byShot: Map<number, ShotAnalysis>; file: ScattTraceFile; caliberMm: number; stability: number };

/** Downloads the stored SCATT file once and decodes its aim traces into per-shot positions and metrics. */
export function useScattAnalysis(path: string | null, discipline: DisciplineId): ScattState {
  const [state, setState] = useState<{ path: string; value: ScattState } | null>(null);
  const target = scattTargetFor(discipline);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await createClient().storage.from('source-files').download(path);
        if (!data) throw new Error('no file');
        const file = await readScattTraces(new Uint8Array(await data.arrayBuffer()), scattBrowserOptions);
        const rows = await analyseShots(file, target);
        const match = rows.filter((r) => r.match && !r.missed).map((r) => r.shotMs);
        if (alive)
          setState({
            path,
            value: { status: 'ready', byShot: new Map(rows.map((r) => [r.shotId, r])), file, caliberMm: target.caliber, stability: intervalStability(match) },
          });
      } catch {
        if (alive) setState({ path, value: { status: 'error' } });
      }
    })();
    return () => {
      alive = false;
    };
  }, [path, target]);

  if (path === null) return { status: 'none' };
  if (state?.path !== path) return { status: 'loading' };
  return state.value;
}

/** The replay of one SCATT shot's aim trace, or null when the shot has none (or missed the target). */
export function useReplay(state: ScattState, scattId: number | null): Replay | null {
  return useMemo(() => {
    if (state.status !== 'ready' || scattId === null) return null;
    const a = state.byShot.get(scattId);
    const shot = state.file.shots.find((x) => x.shotId === scattId);
    const tr = a && !a.missed && shot ? state.file.traces.get(shot.traceId) : undefined;
    return tr && shot ? buildReplay(tr, shot.offset, state.file.sampleRate) : null;
  }, [state, scattId]);
}

/** Replays of several SCATT shots at once (for charts over a series or the match), by SCATT shot id. */
export function useReplays(state: ScattState, scattIds: number[]): Map<number, Replay> {
  const key = scattIds.join(',');
  return useMemo(() => {
    const out = new Map<number, Replay>();
    if (state.status !== 'ready') return out;
    for (const id of scattIds) {
      const a = state.byShot.get(id);
      const shot = state.file.shots.find((x) => x.shotId === id);
      const tr = a && !a.missed && shot ? state.file.traces.get(shot.traceId) : undefined;
      if (tr && shot) out.set(id, buildReplay(tr, shot.offset, state.file.sampleRate));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, key]);
}
