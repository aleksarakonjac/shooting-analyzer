'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hrWindow, samplesFromTcx, type HrSample } from '@/lib/parsers/tcx';

export type HrState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; samples: HrSample[] };

/**
 * Downloads the stored TCX once; the offset and zone are applied on every change without a new download,
 * and only the part inside the shot window is kept.
 */
export function useHrSamples(
  tcxPath: string | null,
  offsetMs: number,
  win: { fromMs: number; toMs: number } | null,
  /** Zone the file's clock is read in, sample by sample (null: the file's own clock). */
  zone: string | null = null,
): HrState {
  const [file, setFile] = useState<{ path: string; xml: string | null } | null>(null);
  const from = win?.fromMs;
  const to = win?.toMs;

  useEffect(() => {
    if (tcxPath === null) return;
    let alive = true;
    createClient()
      .storage.from('source-files')
      .download(tcxPath)
      .then(async ({ data }) => alive && setFile({ path: tcxPath, xml: data ? await data.text() : null }))
      .catch(() => alive && setFile({ path: tcxPath, xml: null }));
    return () => {
      alive = false;
    };
  }, [tcxPath]);

  const parsed = useMemo(() => {
    if (!file?.xml) return [];
    try {
      return samplesFromTcx(file.xml, zone);
    } catch {
      return [];
    }
  }, [file, zone]);

  const samples = useMemo(
    () => (from === undefined || to === undefined ? [] : hrWindow(parsed, from, to, offsetMs)),
    [parsed, from, to, offsetMs],
  );

  if (tcxPath === null || win === null) return { status: 'none' };
  if (file?.path !== tcxPath) return { status: 'loading' };
  return { status: 'ready', samples };
}
