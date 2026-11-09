'use client';
import { useMemo } from 'react';
import { sr } from '@/lib/i18n/sr';
import type { Bucket } from '@/lib/stats/periodStats';
import { trendOption } from '@/lib/stats/trendChart';
import { EChart } from './report/EChart';

const t = sr.dashboard;

/** Average series and group across the period's buckets, with the same figures as a table for screen readers. */
export function TrendPanel({ buckets, decimal }: { buckets: Bucket[]; decimal: boolean }) {
  const option = useMemo(() => trendOption(buckets, decimal), [buckets, decimal]);
  const filled = buckets.filter((b) => b.avgSeries !== null || b.avgGroupMm !== null);
  if (filled.length === 0) return <p className="panel__empty">{t.noData}</p>;
  const f = (v: number | null) => (v === null ? t.noValue : v.toFixed(1));
  return (
    <div className="chart-panel chart-panel--bare">
      <EChart option={option} label={`${t.trendSeries}, ${t.trendGroup}`} />
      <table className="sr-only">
        <caption>{t.trendSeries}</caption>
        <thead>
          <tr><th scope="col">Period</th><th scope="col">{t.avgSeries}</th><th scope="col">{t.avgGroup}</th></tr>
        </thead>
        <tbody>
          {filled.map((b) => (
            <tr key={b.label} data-point={b.label}>
              <th scope="row">{b.label}</th><td>{f(b.avgSeries)}</td><td>{f(b.avgGroupMm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
