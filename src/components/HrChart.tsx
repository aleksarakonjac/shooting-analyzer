import type { HrSample } from '@/lib/parsers/tcx';
import { hrStats } from '@/lib/report/derive';
import { sr } from '@/lib/i18n/sr';

const t = sr.report;
const W = 640;
const H = 110;

/** Heart-rate line over the training window. Empty input shows "nema pulsa". */
export function HrChart({ samples }: { samples: HrSample[] }) {
  const stats = hrStats(samples);
  if (!stats) return <p className="hr-chart__none">{t.noHr}</p>;
  const t0 = samples[0].tMs;
  const span = Math.max(1, samples[samples.length - 1].tMs - t0);
  const range = Math.max(1, stats.max - stats.min);
  const pts = samples
    .map((s) => `${(((s.tMs - t0) / span) * W).toFixed(1)},${(H - 8 - ((s.bpm - stats.min) / range) * (H - 16)).toFixed(1)}`)
    .join(' ');
  return (
    <figure className="hr-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.hr}>
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <figcaption>
        {t.hrAvg} <strong>{stats.avg}</strong> · {t.hrMin} {stats.min} · {t.hrMax} {stats.max} {t.bpm}
      </figcaption>
    </figure>
  );
}
