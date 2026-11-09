import type { DisciplineId } from '@/lib/domain/types';
import { offsetDirection } from '@/lib/report/derive';
import { ringRadiusMm, targetSpec, viewRadiusMm } from '@/lib/report/target';
import type { SeriesView } from '@/lib/report/viewModel';
import { sr } from '@/lib/i18n/sr';

const t = sr.report;
const side = (s: 'left' | 'right' | 'up' | 'down' | null) => (s ? t[s] : t.centred);

/**
 * The ISSF target to scale in millimetres. The selected series shows its group (circle) and
 * mean point of impact; the other series' MPIs are faint dots. No invented shot holes:
 * the SIUS CSV has no per-shot coordinates.
 */
export function TargetPlot({ discipline, series, selected }: { discipline: DisciplineId; series: SeriesView[]; selected: number | null }) {
  const spec = targetSpec(discipline);
  const sel = series.find((s) => s.idx === selected) ?? null;
  const extent = Math.max(
    0,
    ...series.filter((s) => s.mpi).map((s) => Math.hypot(s.mpi!.x, s.mpi!.y) + (s.groupMm ?? 0) / 2),
  );
  const R = viewRadiusMm(spec, extent);
  const pad = R * 0.06;
  const vb = `${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}`;
  const rings = Array.from({ length: 10 }, (_, i) => 10 - i).filter((n) => ringRadiusMm(spec, n) <= R + 0.001);
  const stroke = R / 160;
  const dir = sel?.mpi ? offsetDirection(sel.mpi) : null;

  return (
    <figure className="target">
      <svg viewBox={vb} role="img" aria-label={sel ? `${t.seriesLabel(sel.idx)}: ${t.group} ${sel.groupMm?.toFixed(1) ?? '—'} mm` : t.group}>
        <circle r={R + pad} className="target__card" />
        <circle r={Math.min(spec.blackMm / 2, R + pad)} className="target__black" />
        {rings.map((n) => {
          const r = ringRadiusMm(spec, n);
          const inBlack = r <= spec.blackMm / 2 + 0.001;
          return (
            <g key={n}>
              <circle r={r} className={inBlack ? 'target__ring target__ring--on-black' : 'target__ring'} strokeWidth={stroke} />
              {n < 9 && n > 0 && (
                <text x={0} y={-(r - spec.stepMm / 4)} className={inBlack ? 'target__num target__num--on-black' : 'target__num'} fontSize={spec.stepMm * 0.32} textAnchor="middle" dominantBaseline="middle">{n}</text>
              )}
            </g>
          );
        })}
        {series.filter((s) => s.mpi && s.idx !== selected).map((s) => (
          <circle key={s.id} cx={s.mpi!.x} cy={-s.mpi!.y} r={R / 70} className="target__mpi-other" />
        ))}
        {sel?.mpi && (
          <g className="target__sel">
            {sel.groupMm !== null && <circle cx={sel.mpi.x} cy={-sel.mpi.y} r={sel.groupMm / 2} className="target__group" strokeWidth={stroke * 2} />}
            <path d={`M${sel.mpi.x - R / 30},${-sel.mpi.y}h${R / 15}M${sel.mpi.x},${-sel.mpi.y - R / 30}v${R / 15}`} className="target__mpi" strokeWidth={stroke * 2.5} />
          </g>
        )}
      </svg>
      <figcaption className="target__legend">
        {sel ? (
          <>
            <span><i className="key key--group" aria-hidden="true" /> {t.group} <strong className="num">{sel.groupMm !== null ? `${sel.groupMm.toFixed(1)} mm` : '—'}</strong></span>
            <span>
              <i className="key key--mpi" aria-hidden="true" /> {t.mpi}{' '}
              {dir ? (
                <strong className="num">
                  {dir.x.side ? `${dir.x.mm.toFixed(1)} mm ${side(dir.x.side)}` : side(null)}, {dir.y.side ? `${dir.y.mm.toFixed(1)} mm ${side(dir.y.side)}` : side(null)}
                </strong>
              ) : '—'}
            </span>
            <span><i className="key key--other" aria-hidden="true" /> ostale serije</span>
          </>
        ) : (
          <span>{t.pickSeries}</span>
        )}
      </figcaption>
    </figure>
  );
}
