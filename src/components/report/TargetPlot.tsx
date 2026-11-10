'use client';
import { useRef } from 'react';
import type { DisciplineId } from '@/lib/domain/types';
import { offsetDirection } from '@/lib/report/derive';
import { ringAtRadius, ringRadiusMm, targetSpec, viewRadiusMm } from '@/lib/report/target';
import type { SeriesView } from '@/lib/report/viewModel';
import { sr } from '@/lib/i18n/sr';
import { useRingZoom } from './useRingZoom';

const t = sr.report;
const side = (s: 'left' | 'right' | 'up' | 'down' | null) => (s ? t[s] : t.centred);

export interface ShotHole {
  n: number;
  /** mm from the centre, x right, y up. */
  x: number;
  y: number;
  selected: boolean;
}

/**
 * The ISSF target to scale in millimetres. The selected series shows its group (circle) and
 * mean point of impact; the other series' MPIs are faint dots. Shot holes are drawn only where
 * positions are known (SCATT traces), as pellets of the real calibre.
 */
export function TargetPlot({
  discipline,
  series,
  selected,
  holes = [],
  caliberMm = 4.5,
  onPickShot,
}: {
  /** A click on a hole picks that shot (opens its aim trace). */
  onPickShot?: (n: number) => void;
  discipline: DisciplineId;
  series: SeriesView[];
  selected: number | null;
  /** Shots of the selected series with known positions. */
  holes?: ShotHole[];
  caliberMm?: number;
}) {
  const spec = targetSpec(discipline);
  const sel = series.find((s) => s.idx === selected) ?? null;
  const extent = Math.max(
    0,
    ...series.filter((s) => s.mpi).map((s) => Math.hypot(s.mpi!.x, s.mpi!.y) + (s.groupMm ?? 0) / 2),
    ...holes.map((h) => Math.hypot(h.x, h.y) + caliberMm / 2),
  );
  const svg = useRef<SVGSVGElement>(null);
  const zoom = useRingZoom(spec, viewRadiusMm(spec, extent), svg, discipline);
  const R = zoom.R;
  const pad = R * 0.06;
  const vb = `${-R - pad} ${-R - pad} ${2 * (R + pad)} ${2 * (R + pad)}`;
  const rings = Array.from({ length: 10 }, (_, i) => 10 - i).filter((n) => ringRadiusMm(spec, n) <= R + 0.001);
  const stroke = R / 160;
  const dir = sel?.mpi ? offsetDirection(sel.mpi) : null;
  // Drift view: the MPIs alone on their own scale, so series-to-series movement is readable.
  const withMpi = series.filter((s) => s.mpi);
  const reach = Math.max(0.4, ...withMpi.map((s) => Math.max(Math.abs(s.mpi!.x), Math.abs(s.mpi!.y))));
  const S = Math.ceil(reach * 1.25 * 2) / 2;

  return (
    <figure className="target">
      <div className="trace__zoom target__zoom" role="group" aria-label={t.zoomRing(ringAtRadius(spec, R))}>
        <button type="button" onClick={zoom.zoomIn} aria-label={t.zoomIn} title={t.zoomIn}>+</button>
        <button type="button" onClick={zoom.zoomOut} aria-label={t.zoomOut} title={t.zoomOut}>−</button>
        {zoom.zoomed && (
          <button type="button" onClick={zoom.fit} title={t.zoomFit}>
            {t.zoomFit}
          </button>
        )}
      </div>
      <svg ref={svg} onDoubleClick={zoom.fit} viewBox={vb} role="img" aria-label={sel ? `${t.seriesLabel(sel.idx)}: ${t.group} ${sel.groupMm?.toFixed(1) ?? '—'} mm` : t.group}>
        <circle r={R + pad} className="target__card" />
        <circle r={Math.min(spec.blackMm / 2, R + pad)} className="target__black" />
        {rings.map((n) => {
          const r = ringRadiusMm(spec, n);
          const inBlack = r <= spec.blackMm / 2 + 0.001;
          return (
            <g key={n}>
              <circle r={r} className={inBlack ? 'target__ring target__ring--on-black' : 'target__ring'} strokeWidth={stroke} />
              {n < 10 && n > 0 && (
                <text x={0} y={-(r - spec.stepMm / 4)} className={inBlack ? 'target__num target__num--on-black' : 'target__num'} fontSize={spec.stepMm * 0.32} textAnchor="middle" dominantBaseline="middle">{n}</text>
              )}
            </g>
          );
        })}
        {series.filter((s) => s.mpi && s.idx !== selected).map((s) => (
          <g key={s.id}>
            <circle cx={s.mpi!.x} cy={-s.mpi!.y} r={R / 45} className="target__mpi-other" />
            <text x={s.mpi!.x + R / 28} y={-s.mpi!.y} fontSize={R / 14} dominantBaseline="middle" className="target__mpi-num">{s.idx}</text>
          </g>
        ))}
        {holes.map((h) => (
          <circle
            key={h.n}
            cx={h.x}
            cy={-h.y}
            r={caliberMm / 2}
            className={h.selected ? 'target__hole target__hole--sel' : 'target__hole'}
            strokeWidth={stroke * 1.5}
            data-shot={h.n}
            onClick={onPickShot ? () => onPickShot(h.n) : undefined}
            style={onPickShot ? { cursor: 'pointer' } : undefined}
          />
        ))}
        {sel?.mpi && (
          <g className="target__sel">
            {sel.groupMm !== null && <circle cx={sel.mpi.x} cy={-sel.mpi.y} r={sel.groupMm / 2} className="target__group" strokeWidth={stroke * 2} />}
            <path d={`M${sel.mpi.x - R / 22},${-sel.mpi.y}h${R / 11}M${sel.mpi.x},${-sel.mpi.y - R / 22}v${R / 11}`} className="target__mpi" strokeWidth={stroke * 3} />
            <text x={sel.mpi.x + R / 18} y={-sel.mpi.y - R / 18} fontSize={R / 11} className="target__mpi-num target__mpi-num--sel">{sel.idx}</text>
          </g>
        )}
      </svg>
      {withMpi.length > 0 && (
        <div className="target__drift">
          <svg viewBox={`${-S} ${-S} ${2 * S} ${2 * S}`} role="img" aria-label={`${t.drift} ±${S.toFixed(1)} mm`}>
            <rect x={-S} y={-S} width={2 * S} height={2 * S} className="target__drift-bg" />
            <path d={`M${-S},0H${S}M0,${-S}V${S}`} className="target__drift-axis" strokeWidth={S / 90} />
            <circle r={S / 2} className="target__drift-ring" strokeWidth={S / 120} />
            {withMpi.map((s) => {
              const on = s.idx === selected;
              return (
                <g key={s.id} data-drift={s.idx}>
                  <circle cx={s.mpi!.x} cy={-s.mpi!.y} r={S / (on ? 9 : 13)} className={on ? 'target__drift-dot target__drift-dot--sel' : 'target__drift-dot'} />
                  <text x={s.mpi!.x} y={-s.mpi!.y} fontSize={S / (on ? 7 : 9)} textAnchor="middle" dominantBaseline="central" className={on ? 'target__drift-num target__drift-num--sel' : 'target__drift-num'}>{s.idx}</text>
                </g>
              );
            })}
          </svg>
          <span className="target__drift-label">{t.drift} <span className="num">±{S.toFixed(1)} mm</span></span>
        </div>
      )}
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
            <span><i className="key key--other" aria-hidden="true" /> {t.otherMpi}</span>
          </>
        ) : (
          <span>{t.pickSeries}</span>
        )}
      </figcaption>
    </figure>
  );
}
