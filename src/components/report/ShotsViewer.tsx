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

const t = sr.report;

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
  const shown = useMemo(() => (scope === 'series' ? shots.filter((s) => s.series === series) : shots), [shots, scope, series]);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });

  const fitR = useMemo(() => {
    let reach = 0;
    for (const s of shown) reach = Math.max(reach, Math.hypot(s.x, s.y));
    if (scope === 'series' && group) reach = Math.max(reach, Math.hypot(group.x, group.y) + group.r);
    return viewRadiusMm(spec, reach + target.caliber / 2);
  }, [shown, scope, group, spec, target]);
  const zoom = useRingZoom(spec, fitR, canvas, `${scope}:${scope === 'series' ? series : ''}`);

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
    if (scope === 'series' && group) {
      g.beginPath();
      g.arc(X(group.x), Y(group.y), group.r * S, 0, 2 * Math.PI);
      g.setLineDash([6, 4]);
      g.strokeStyle = 'rgba(235,237,242,.8)';
      g.lineWidth = 1.25;
      g.stroke();
      g.setLineDash([]);
    }
    const rad = Math.max(3, (target.caliber / 2) * S);
    const label = rad >= 7;
    // Where SCATT read the hit when it differs from the SIUS-corrected one: a faint ring and a thin line, a hint on the aiming.
    for (const s of shown) {
      if (s.movedMm < 0.05) continue;
      g.globalAlpha = scope === 'match' && s.series !== series ? 0.15 : 0.55;
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
    // The selected shot is drawn last, on top; other series (match view) are dimmed.
    const order = [...shown].sort((a, b) => Number(a.n === shot) - Number(b.n === shot));
    for (const s of order) {
      const on = s.n === shot;
      const dimmed = scope === 'match' && s.series !== series;
      g.globalAlpha = dimmed ? 0.4 : 1;
      // Position confidence: solid = the SIUS arrow confirms the direction; dashed = direction from SCATT alone;
      // dashed and light = direction from the arrow alone (SCATT disagreed).
      const sure = s.confidence === 'verified';
      g.beginPath();
      g.arc(X(s.x), Y(s.y), rad, 0, 2 * Math.PI);
      if (s.confidence === 'arrow-only') g.globalAlpha = dimmed ? 0.2 : 0.55;
      g.fillStyle = hit;
      g.fill();
      g.strokeStyle = on ? cssVar('--select-bg', '#fff') : ink;
      g.lineWidth = on ? 3 : 1.5;
      if (!sure) g.setLineDash([4, 3]);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = dimmed ? 0.4 : 1;
      if (on) {
        g.beginPath();
        g.arc(X(s.x), Y(s.y), rad + 4, 0, 2 * Math.PI);
        g.strokeStyle = ink;
        g.lineWidth = 1.5;
        g.stroke();
      }
      if (label) {
        g.font = `700 ${Math.min(14, rad * 0.9).toFixed(1)}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = ink;
        g.fillText(String(scope === 'series' ? s.idx : s.n), X(s.x), Y(s.y));
      }
    }
    g.globalAlpha = 1;
  }, [size, shown, scope, series, shot, group, target, spec, zoom.R, hit]);

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
  const missing = scope === 'series' ? unplaced.series : unplaced.match;
  const ring = ringAtRadius(spec, zoom.R);
  return (
    <figure className="trace trace--overview">
      <div ref={wrap} className="trace__canvas">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${scope === 'series' ? t.scopeSeries : t.scopeMatch}: ${shown.length}`}
          onClick={pick}
          onDoubleClick={zoom.fit}
        />
        <div className="trace__scope">
          <Segmented
            label={t.overviewScope}
            hideLabel
            full={false}
            value={scope}
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
        <span><i className="conf conf--verified" aria-hidden="true" /> {t.confVerified} {count('verified')}</span>
        <span><i className="conf conf--scatt" aria-hidden="true" /> {t.confScatt} {count('scatt-only')}</span>
        <span><i className="conf conf--arrow" aria-hidden="true" /> {t.confArrow} {count('arrow-only')}</span>
        {missing > 0 && <span>{t.confMissing} {missing}</span>}
      </p>
    </figure>
  );
}
