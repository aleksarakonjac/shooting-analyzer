'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hrWindow, parseTcx, type HrSample } from '@/lib/parsers/tcx';
import { sr } from '@/lib/i18n/sr';
import { HrChart } from './HrChart';

/** Downloads the stored TCX, applies the saved offset and shows the part inside the shot window. */
export function HrOverlay({
  tcxPath,
  offsetMs,
  window: win,
}: {
  tcxPath: string | null;
  offsetMs: number;
  window: { fromMs: number; toMs: number } | null;
}) {
  const wanted = tcxPath !== null && win !== null;
  const [samples, setSamples] = useState<HrSample[] | null>(null);

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    createClient()
      .storage.from('source-files')
      .download(tcxPath)
      .then(async ({ data }) => {
        if (!alive) return;
        try {
          const parsed = data ? parseTcx(await data.text()) : { samples: [] };
          setSamples(hrWindow(parsed.samples, win.fromMs, win.toMs, offsetMs));
        } catch {
          setSamples([]);
        }
      })
      .catch(() => alive && setSamples([]));
    return () => {
      alive = false;
    };
  }, [wanted, tcxPath, offsetMs, win?.fromMs, win?.toMs]);

  if (!wanted) return <HrChart samples={[]} />;
  if (samples === null) return <p role="status">{sr.report.hrLoading}</p>;
  return <HrChart samples={samples} />;
}
