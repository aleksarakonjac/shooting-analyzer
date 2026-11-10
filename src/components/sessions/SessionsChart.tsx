'use client';
import { useMemo } from 'react';
import { sr } from '@/lib/i18n/sr';
import type { ChartKind } from '@/lib/stats/filters';
import type { SessionPoint } from '@/lib/stats/periodStats';
import { sessionsOption } from '@/lib/stats/trendChart';
import { EChart } from '../report/EChart';

const t = sr.dashboard;
const LABEL: Record<ChartKind, string> = { rez: t.avgSeries, puls: t.avgHr, grupa: t.avgGroup };
const pick: Record<ChartKind, (p: SessionPoint) => number | null> = { rez: (p) => p.avgSeries, puls: (p) => p.hr, grupa: (p) => p.avgGroupMm };

/** One figure per session over time, with the same figures as a table for screen readers. */
export function SessionsChart({ points, kind, decimal }: { points: SessionPoint[]; kind: ChartKind; decimal: boolean }) {
  const option = useMemo(() => sessionsOption(points, kind, decimal), [points, kind, decimal]);
  const filled = points.filter((p) => pick[kind](p) !== null);
  if (filled.length === 0) return <p className="panel__empty">{t.noData}</p>;
  const digits = kind === 'puls' ? 0 : 1;
  return (
    <div className="chart-panel chart-panel--bare">
      <EChart option={option} label={`${LABEL[kind]}: ${filled.length}`} />
      <table className="sr-only">
        <caption>{LABEL[kind]}</caption>
        <thead>
          <tr><th scope="col">Datum</th><th scope="col">Sesija</th><th scope="col">{LABEL[kind]}</th></tr>
        </thead>
        <tbody>
          {filled.map((p) => (
            <tr key={p.id} data-point={p.id}>
              <td>{p.trainedOn}</td><th scope="row">{p.name}</th><td>{pick[kind](p)!.toFixed(digits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
