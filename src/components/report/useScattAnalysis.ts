'use client';
import { useEffect, useState } from 'react';
import type { DisciplineId } from '@/lib/domain/types';
import { scattBrowserOptions } from '@/lib/parsers/browser';
import { readScattTraces, type ScattTraceFile } from '@/lib/parsers/scatt';
import { analyseShots, intervalStability, type ShotAnalysis } from '@/lib/scatt/analysis';
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
    if (path === null || target === null) return;
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

  if (path === null || target === null) return { status: 'none' };
  if (state?.path !== path) return { status: 'loading' };
  return state.value;
}
