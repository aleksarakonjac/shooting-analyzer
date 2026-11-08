import { sr } from '@/lib/i18n/sr';

export interface TimelineShot {
  idx: number;
  value: number;
  tMs: number | null;
}

const W = 640;
const H = 150;
const PAD = 14;

/** Shot values over time (or over order when some shot has no time). */
export function ShotTimeline({ shots, decimal }: { shots: TimelineShot[]; decimal: boolean }) {
  if (shots.length === 0) return <p>{sr.report.noShots}</p>;
  const timed = shots.every((s) => s.tMs !== null);
  const xs = timed ? shots.map((s) => s.tMs as number) : shots.map((_, i) => i);
  const x0 = Math.min(...xs);
  const span = Math.max(1, Math.max(...xs) - x0);
  const lo = Math.floor(Math.min(...shots.map((s) => s.value)) - 0.5);
  const hi = decimal ? 10.9 : 10;
  const px = (v: number) => PAD + ((v - x0) / span) * (W - PAD * 2);
  const py = (v: number) => H - PAD - ((v - lo) / Math.max(1, hi - lo)) * (H - PAD * 2);
  return (
    <svg className="shot-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={sr.report.timeline}>
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" opacity="0.4" />
      <polyline
        points={shots.map((s, i) => `${px(xs[i]).toFixed(1)},${py(s.value).toFixed(1)}`).join(' ')}
        fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35"
      />
      {shots.map((s, i) => (
        <circle key={s.idx} data-shot={s.idx} cx={px(xs[i])} cy={py(s.value)} r="4" fill="currentColor">
          <title>{`${s.idx}: ${decimal ? s.value.toFixed(1) : s.value}`}</title>
        </circle>
      ))}
    </svg>
  );
}
