'use client';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { sr } from '@/lib/i18n/sr';
import type { HitConfidence } from '@/lib/report/hit';
import { ringAtRadius, viewRadiusMm, type TargetSpec } from '@/lib/report/target';
import { cssVar, drawTarget, viewTransform } from '@/lib/scatt/drawTarget';
import type { ScattTarget } from '@/lib/scatt/targets';
import { Segmented } from '../ui/Segmented';
import { DEFAULT_HIT, useReplaySettings } from './replaySettings';
import { useRingZoom } from './useRingZoom';
import { overviewHits } from '@/lib/report/overview';

const t = sr.report;
/** Hit numbers on the overview target, in px: they scale with the zoom between these. */
const LABEL_MIN_PX = 11;
const LABEL_MAX_PX = 34;

export interface OverviewShot {
  /** Shot number through the match. */
  n: number;
  /** Number within its series. */
  idx: number;
  series: number;
  /** Hit point from the SCATT trace, mm from the centre (x right, y up). */
  x: number;
  y: number;
  /** The raw SCATT point, kept for comparison with the corrected hit (x, y). */
  sx: number;
  sy: number;
  /** How far the corrected hit lies from the SCATT point (mm). */
  movedMm: number;
  confidence: HitConfidence;
}

export type OverviewScope = 'series' | 'match';

/**
 * Every hit of the series (or of the whole match) on the same target the aim-trace replay uses:
 * pellets of the real calibre at the hit points (SCATT's point set against the SIUS score and arrow; the raw SCATT point as a faint ring), the group circle of the series, zoom and a click to pick a shot.
 */
export function ShotsViewer({
  spec,
  target,
  shots,
  series,
  shot,
  group,
  scope,
  unplaced,
  onScope,
  onPick,
}: {
  spec: TargetSpec;
  target: ScattTarget;
  shots: OverviewShot[];
  /** The selected series, drawn in full in the match view while the others are dimmed. */
  series: number | null;
  shot: number | null;
  /** Group circle of the selected series (mm), when SIUS gave one. */
  group: { x: number; y: number; r: number } | null;
  scope: OverviewScope;
  /** Hits without a SCATT position, per scope: not on the target. */
  unplaced: { series: number; match: number };
  onScope: (s: OverviewScope) => void;
  onPick: (series: number, n: number) => void;
}) {
  const settings = useReplaySettings();
  const hit = settings?.hit ?? DEFAULT_HIT;
  // One shot when one is picked; else the chosen series or the whole match, fading from the first shot to the last.
  const { mode, hits: shown } = useMemo(() => overviewHits(shots, { scope, series, shot }), [shots, scope, series, shot]);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });

  // A single shot is framed like its whole series, so it is seen in place and stepping shots keeps the same view.
  const frameSeries = mode === 'shot' ? (shown[0]?.series ?? null) : mode === 'series' ? series : null;
  const framed = useMemo(() => (frameSeries === null ? shown : shots.filter((s) => s.series === frameSeries)), [frameSeries, shown, shots]);
  const fitR = useMemo(() => {
    let reach = 0;
    for (const s of framed) reach = Math.max(reach, Math.hypot(s.x, s.y));
    if (frameSeries !== null && group) reach = Math.max(reach, Math.hypot(group.x, group.y) + group.r);
    return viewRadiusMm(spec, reach + target.caliber / 2);
  }, [framed, frameSeries, group, spec, target]);
  const zoom = useRingZoom(spec, fitR, canvas, frameSeries === null ? 'match' : `series:${frameSeries}`);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height, dpr: window.devicePixelRatio || 1 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    const g = c.getContext('2d');
    if (!g) return;
    drawTarget(g, size, target, spec, zoom.R);
    const { S, X, Y } = viewTransform(size, zoom.R);
    const ink = cssVar('--target-ink', '#14181b');
    if (mode === 'series' && group) {
      g.beginPath();
      g.arc(X(group.x), Y(group.y), group.r * S, 0, 2 * Math.PI);
      g.setLineDash([6, 4]);
      g.strokeStyle = 'rgba(235,237,242,.8)';
      g.lineWidth = 1.25;
      g.stroke();
      g.setLineDash([]);
    }
    const rad = Math.max(3, (target.caliber / 2) * S);
    // Numbers only where the hit is big enough to hold the smallest one.
    const label = rad >= LABEL_MIN_PX * 0.8;
    // Where SCATT read the hit when it differs from the SIUS-corrected one: a faint ring and a thin line, a hint on the aiming.
    for (const s of shown) {
      if (s.movedMm < 0.05) continue;
      g.globalAlpha = 0.55 * s.alpha;
      g.beginPath();
      g.moveTo(X(s.sx), Y(s.sy));
      g.lineTo(X(s.x), Y(s.y));
      g.strokeStyle = hit;
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.arc(X(s.sx), Y(s.sy), rad, 0, 2 * Math.PI);
      g.setLineDash([3, 3]);
      g.stroke();
      g.setLineDash([]);
    }
    g.globalAlpha = 1;
    // Hits in the app's data cyan, in shooting order so the later (more visible) ones lie on top. A position whose
    // direction is not confirmed (SCATT alone, or the SIUS arrow alone, drawn lighter) gets a dashed edge.
    const fill = cssVar('--data', '#39c6f0');
    const text = cssVar('--ground', '#0b1530');
    const font = cssVar('--font-display', 'system-ui, sans-serif');
    for (const s of shown) {
      const sure = s.confidence === 'verified' || s.confidence === 'sius' || s.confidence === 'sius-angle';
      g.globalAlpha = s.alpha * (s.confidence === 'arrow-only' ? 0.6 : 1);
      g.beginPath();
      g.arc(X(s.x), Y(s.y), rad, 0, 2 * Math.PI);
      g.fillStyle = fill;
      g.fill();
      // A thin dark edge keeps overlapping hits apart; dashed where the direction is not confirmed.
      g.strokeStyle = ink;
      g.lineWidth = 1.25;
      if (!sure) g.setLineDash([4, 3]);
      g.stroke();
      g.setLineDash([]);
      if (label) {
        // The number follows the zoom only between limits: never smaller than readable, never filling the hit.
        g.font = `800 ${Math.max(LABEL_MIN_PX, Math.min(LABEL_MAX_PX, rad * 0.8)).toFixed(1)}px ${font}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = text;
        g.fillText(String(mode === 'match' ? s.n : s.idx), X(s.x), Y(s.y) + rad * 0.06);
      }
    }
    g.globalAlpha = 1;
  }, [size, shown, mode, group, target, spec, zoom.R, hit]);

  // A click on a hit picks that shot.
  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const { S, X, Y } = viewTransform(size, zoom.R);
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const reach = Math.max(14, (target.caliber / 2) * S + 6);
    let best: OverviewShot | null = null;
    let bestD = reach;
    for (const s of shown) {
      const d = Math.hypot(X(s.x) - px, Y(s.y) - py);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) onPick(best.series, best.n);
  };

  const count = (c: HitConfidence) => shown.filter((s) => s.confidence === c).length;
  const missing = mode === 'series' ? unplaced.series : mode === 'match' ? unplaced.match : 0;
  const ring = ringAtRadius(spec, zoom.R);
  return (
    <figure className="trace trace--overview">
      <div ref={wrap} className="trace__canvas">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${mode === 'shot' ? t.scopeShot : mode === 'series' ? t.scopeSeries : t.scopeMatch}: ${shown.length}`}
          onClick={pick}
          onDoubleClick={zoom.fit}
        />
        <div className="trace__scope">
          <Segmented
            label={t.overviewScope}
            hideLabel
            full={false}
            value={mode === 'shot' ? null : mode}
            onChange={onScope}
            options={[
              { id: 'series', label: t.scopeSeries },
              { id: 'match', label: t.scopeMatch },
            ]}
          />
        </div>
        <div className="trace__zoom" role="status" aria-label={t.zoomRing(ring)}>
          {zoom.zoomed && (
            <button type="button" onClick={zoom.fit} title={t.zoomFit}>
              {t.zoomFit}
            </button>
          )}
        </div>
      </div>
      <p className="trace__legend trace__legend--conf">
        {/* Only the kinds this view has: a competition session (SIUS alone) shows one line, not three zeros. */}
        {count('verified') > 0 && <span><i className="conf conf--verified" aria-hidden="true" /> {t.confVerified} {count('verified')}</span>}
        {count('sius-angle') > 0 && <span><i className="conf conf--verified" aria-hidden="true" /> {t.confAngle} {count('sius-angle')}</span>}
        {count('scatt-only') > 0 && <span><i className="conf conf--scatt" aria-hidden="true" /> {t.confScatt} {count('scatt-only')}</span>}
        {count('arrow-only') > 0 && <span><i className="conf conf--arrow" aria-hidden="true" /> {t.confArrow} {count('arrow-only')}</span>}
        {missing > 0 && <span>{t.confMissing} {missing}</span>}
      </p>
    </figure>
  );
}
