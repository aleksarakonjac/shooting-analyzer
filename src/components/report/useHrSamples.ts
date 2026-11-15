'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hrWindow, samplesFromTcx, type HrSample } from '@/lib/parsers/tcx';

type Span = { fromMs: number; toMs: number };

export type HrState =
  | { status: 'none' }
  | { status: 'loading' }
  | {
      status: 'ready';
      /** Samples inside the match window (the whole file when nothing else sets the window). */
      samples: HrSample[];
      /** Every sample of the file, for "before and after the match". */
      full: HrSample[];
      /** The file reaches at least a minute past the match window on one side. */
      fullAvailable: boolean;
      match: Span | null;
    };

const AROUND_MS = 60_000;

/**
 * Downloads the stored TCX once; the offset and zone are applied on every change without a new download.
 * `match` is the match window on the shot clock (null: the whole file is the match).
 */
export function useHrSamples(
  tcxPath: string | null,
  offsetMs: number,
  match: Span | null,
  /** Zone the file's clock is read in, sample by sample (null: the file's own clock). */
  zone: string | null = null,
): HrState {
  const [file, setFile] = useState<{ path: string; xml: string | null } | null>(null);
  const from = match?.fromMs;
  const to = match?.toMs;

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

  const view = useMemo(() => {
    const full = hrWindow(parsed, -Infinity, Infinity, offsetMs);
    if (full.length === 0) return { samples: [], full, fullAvailable: false, match: null };
    const fileSpan = { fromMs: full[0].tMs, toMs: full[full.length - 1].tMs };
    const m = from === undefined || to === undefined ? fileSpan : { fromMs: from, toMs: to };
    const samples = full.filter((x) => x.tMs >= m.fromMs && x.tMs <= m.toMs);
    const fullAvailable = fileSpan.fromMs < m.fromMs - AROUND_MS || fileSpan.toMs > m.toMs + AROUND_MS;
    return { samples, full, fullAvailable, match: m };
  }, [parsed, from, to, offsetMs]);

  if (tcxPath === null) return { status: 'none' };
  if (file?.path !== tcxPath) return { status: 'loading' };
  return { status: 'ready', ...view };
}
