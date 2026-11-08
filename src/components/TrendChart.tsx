import { sr } from '@/lib/i18n/sr';

export interface TrendBucket {
  label: string;
  value: number | null;
}

const W = 640;
const H = 150;
const PAD = 16;

/** Line over buckets; gaps (no training) break the line. A value list is in the accessible label. */
export function TrendChart({ title, buckets, decimals = 1 }: { title: string; buckets: TrendBucket[]; decimals?: number }) {
  const values = buckets.map((b) => b.value).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return (
      <figure className="trend">
        <figcaption>{title}</figcaption>
        <p>{sr.dashboard.noData}</p>
      </figure>
    );
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 0.0001);
  const x = (i: number) => PAD + (buckets.length === 1 ? (W - PAD * 2) / 2 : (i / (buckets.length - 1)) * (W - PAD * 2));
  const y = (v: number) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / span) * (H - PAD * 2 - 14));
  const runs: string[] = [];
  let run: string[] = [];
  buckets.forEach((b, i) => {
    if (b.value === null) {
      if (run.length > 1) runs.push(run.join(' '));
      run = [];
    } else run.push(`${x(i).toFixed(1)},${y(b.value).toFixed(1)}`);
  });
  if (run.length > 1) runs.push(run.join(' '));
  const every = Math.ceil(buckets.length / 12);
  const summary = buckets.filter((b) => b.value !== null).map((b) => `${b.label}: ${b.value!.toFixed(decimals)}`).join(', ');
  return (
    <figure className="trend">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`${title}. ${summary}`}>
        {runs.map((pts, i) => (
          <polyline key={i} points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
        ))}
        {buckets.map((b, i) =>
          b.value === null ? null : <circle key={i} data-point={b.label} cx={x(i)} cy={y(b.value)} r="4" fill="currentColor" />,
        )}
        <line x1={PAD} y1={H - 4} x2={W - PAD} y2={H - 4} stroke="currentColor" opacity="0.35" />
        {buckets.map((b, i) =>
          i % every === 0 ? (
            <text key={i} x={x(i)} y={H + 12} fontSize="11" textAnchor="middle" fill="currentColor">
              {b.label}
            </text>
          ) : null,
        )}
      </svg>
      <small>
        {lo.toFixed(decimals)} – {hi.toFixed(decimals)}
      </small>
    </figure>
  );
}
