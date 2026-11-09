'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hrWindow, samplesFromTcx, type HrSample } from '@/lib/parsers/tcx';

export type HrState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; samples: HrSample[] };

/** Downloads the stored TCX once, applies the saved offset and keeps the part inside the shot window. */
export function useHrSamples(
  tcxPath: string | null,
  offsetMs: number,
  win: { fromMs: number; toMs: number } | null,
  /** Zone the file's clock is read in, sample by sample (null: the file's own clock). */
  zone: string | null = null,
): HrState {
  const [samples, setSamples] = useState<HrSample[] | null>(null);
  const from = win?.fromMs;
  const to = win?.toMs;

  useEffect(() => {
    if (tcxPath === null || from === undefined || to === undefined) return;
    let alive = true;
    createClient()
      .storage.from('source-files')
      .download(tcxPath)
      .then(async ({ data }) => {
        if (!alive) return;
        try {
          const samples = data ? samplesFromTcx(await data.text(), zone) : [];
          setSamples(hrWindow(samples, from, to, offsetMs));
        } catch {
          setSamples([]);
        }
      })
      .catch(() => alive && setSamples([]));
    return () => {
      alive = false;
    };
  }, [tcxPath, offsetMs, from, to, zone]);

  if (tcxPath === null || win === null) return { status: 'none' };
  if (samples === null) return { status: 'loading' };
  return { status: 'ready', samples };
}
