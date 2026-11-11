'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sr } from '@/lib/i18n/sr';
import { ringAtRadius, viewRadiusMm, type TargetSpec } from '@/lib/report/target';
import { angleAt, endFor, pointAt, segmentsUpTo, startFor, type Replay, type SegmentKind } from '@/lib/scatt/replay';
import type { ScattTarget } from '@/lib/scatt/targets';
import { useRingZoom } from './useRingZoom';
import { DEFAULT_HIT, DEFAULT_TRACE_COLOURS, useReplaySettings, type OverlayKey } from './replaySettings';
import { TraceSettings } from './TraceSettings';

const t = sr.report;

/** Degrees at the ends of the level vial. */
const LEVEL_MAX = 10;
/** Seconds before the shot that the automatic view fits (SCATT aimingTraceDisplaySecondsBeforeShot). */
const FIT_S = 5;

/**
 * One shot's aim trace over the target, replayed as in SCATT: play/pause, speed, scrubber,
 * how long after the shot to show, ring-by-ring zoom about the centre and a level vial for the tilt.
 */
export function TraceViewer({
  replay,
  spec,
  target,
  shotN,
  score,
  stats,
  onNext,
  onBack,
}: {
  replay: Replay;
  spec: TargetSpec;
  target: ScattTarget;
  shotN: number;
  score: string;
  /** SCATT figures of this shot, drawn over the target like the SCATT program does. */
  stats?: { speed250: number | null; aimingS: number | null; hold10: number | null; speed1: number | null };
  /** Go on with the next shot (autoplay); absent when this is the last one. */
  onNext?: () => void;
  onBack: () => void;
}) {
  const settings = useReplaySettings();
  const after = settings?.after ?? 1;
  const speed = settings?.speed ?? '1';
  const before = settings?.before ?? 15;
  const overlay = settings?.overlay ?? ['score', 'speed250', 'aiming'];
  const look = { hit: settings?.hit ?? DEFAULT_HIT, colours: settings?.colours ?? DEFAULT_TRACE_COLOURS };
  const autoplay = settings?.autoplay ?? 'off';
  const end = endFor(replay, Number(after));
  const start = startFor(replay, Number(before));
  const [posState, setPos] = useState<{ replay: Replay; pos: number } | null>(null);
  const pos = posState && posState.replay === replay ? Math.max(start, Math.min(posState.pos, end)) : end;
  const [playing, setPlaying] = useState(false);
  const chain = useRef(false);
  const endTimer = useRef<number | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, dpr: 1 });

  const fitR = useMemo(() => {
    const from = Math.max(0, replay.shot - FIT_S * replay.rate);
    let reach = replay.hold.r + Math.hypot(replay.hold.x, replay.hold.y);
    for (let i = from; i <= replay.shot; i++) reach = Math.max(reach, Math.hypot(replay.x[i], replay.y[i]));
    return viewRadiusMm(spec, reach + target.caliber / 2);
  }, [replay, spec, target]);
  const zoom = useRingZoom(spec, fitR, canvas, replay);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height, dpr: window.devicePixelRatio || 1 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  });

  // Playback: advance by real time times the speed; stop at the end.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let cur = posRef.current;
    let raf = 0;
    const tick = (now: number) => {
      // Start from where the replay is now, so a jump with the arrow keys is picked up while playing.
      cur = Math.min(end, posRef.current + ((now - last) / 1000) * replay.rate * Number(speed));
      last = now;
      setPos({ replay, pos: cur });
      if (cur >= end) {
        setPlaying(false);
        // Autoplay: run the same shot again, or hand over to the next one after a short beat.
        if (autoplay === 'loop') endTimer.current = window.setTimeout(() => { setPos({ replay, pos: start }); setPlaying(true); }, 600);
        else if (autoplay === 'next' && onNext) endTimer.current = window.setTimeout(() => { chain.current = true; onNext(); }, 600);
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, replay, end, speed, start, autoplay, onNext]);

  // A shot that follows an autoplayed one starts by itself; leaving or changing shots cancels a pending hand-over.
  useEffect(() => {
    if (chain.current) {
      chain.current = false;
      setPos({ replay, pos: start });
      setPlaying(true);
    }
    return () => window.clearTimeout(endTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    const g = c.getContext('2d');
    if (!g) return;
    draw(g, size, replay, target, spec, zoom.R, pos, end, start, look);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, replay, target, spec, zoom.R, pos, end, start, look.hit, look.colours]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (pos >= end - 0.5) setPos({ replay, pos: start });
    setPlaying(true);
  };
  // Space plays or pauses, Left / Right go a second back or forward, unless a field, button, slider or popup has the keyboard.
  const toggleRef = useRef(toggle);
  const seekRef = useRef<(d: number) => void>(() => {});
  useEffect(() => {
    toggleRef.current = toggle;
    seekRef.current = (d) => setPos({ replay, pos: Math.max(start, Math.min(end, posRef.current + d * replay.rate)) });
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== ' ' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="slider"], [role="radio"], [role="radiogroup"], [role="dialog"], [role="listbox"], [role="menu"]')) return;
      e.preventDefault();
      if (e.key === ' ') toggleRef.current();
      else seekRef.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const k = Math.floor(pos);
  const secs = (pos - replay.shot) / replay.rate;
  const tilt = angleAt(replay, k);
  const ring = ringAtRadius(spec, zoom.R);

  return (
    <figure className="trace">
      <div ref={wrap} className="trace__canvas">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${t.traceTitle(shotN)}: ${score}, ${t.traceHold} ${(2 * replay.hold.r).toFixed(1)} mm`}
          onDoubleClick={zoom.fit}
        />
        <button type="button" className="trace__back" onClick={onBack}>
          ← {t.traceBack}
        </button>
        {overlay.length > 0 && (
          <dl className="trace__stats">
            {overlay.map((k) => {
              const item: Record<OverlayKey, [string, string, string?]> = {
                shot: [t.traceShot, String(shotN)],
                score: [t.traceScore, score, 'trace__stat--score'],
                speed250: [t.traceSpeed250, stats?.speed250 == null ? '—' : stats.speed250.toFixed(1)],
                aiming: [t.traceAiming, stats?.aimingS == null ? '—' : `${stats.aimingS.toFixed(1)} s`],
                hold: [t.traceHold, `${(2 * replay.hold.r).toFixed(1)} mm`],
                hold10: [t.scattHoldLabel, stats?.hold10 == null ? '—' : `${stats.hold10}%`],
                speed1: [t.traceSpeed1, stats?.speed1 == null ? '—' : stats.speed1.toFixed(1)],
              };
              const [label, value, cls] = item[k];
              return (
                <div key={k} className={cls}><dt>{label}</dt><dd className="num">{value}</dd></div>
              );
            })}
          </dl>
        )}
        <div className="trace__cog-wrap"><TraceSettings /></div>
        <div className="trace__zoom" role="status" aria-label={t.zoomRing(ring)}>
          {zoom.zoomed && (
            <button type="button" onClick={zoom.fit} title={t.zoomFit}>
              {t.zoomFit}
            </button>
          )}
        </div>
      </div>
      <div className="trace__foot">
      <div className="trace__bar">
        <button type="button" className="trace__play" onClick={toggle} aria-pressed={playing} aria-label={playing ? t.tracePause : t.tracePlay} title={playing ? t.tracePause : t.tracePlay}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
            {playing ? <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" /> : <path d="M4 2.2v11.6a.5.5 0 0 0 .76.43l9.2-5.8a.5.5 0 0 0 0-.86l-9.2-5.8A.5.5 0 0 0 4 2.2z" />}
          </svg>
        </button>
        <input
          type="range"
          className="trace__scrub"
          aria-label={t.tracePos}
          aria-valuetext={t.traceFromShot(secs.toFixed(2))}
          min={start}
          max={end}
          step={1}
          value={k}
          style={{ '--p': `${end > start ? ((k - start) / (end - start)) * 100 : 100}%` } as React.CSSProperties}
          onChange={(e) => {
            setPlaying(false);
            setPos({ replay, pos: Number(e.target.value) });
          }}
        />
      </div>
      <Level angle={tilt} />
      </div>
    </figure>
  );
}

/** Spirit level for the weapon tilt: the bubble moves with the smoothed angle, clamped at ±10°. */
function Level({ angle }: { angle: number | null }) {
  const ticks = Array.from({ length: 2 * LEVEL_MAX + 1 }, (_, i) => i - LEVEL_MAX);
  const W = 300;
  const H = 34;
  const half = W / 2 - H / 2;
  const x = (deg: number) => W / 2 + (Math.max(-LEVEL_MAX, Math.min(LEVEL_MAX, deg)) / LEVEL_MAX) * half;
  const level = angle !== null && Math.abs(angle) <= 0.5;
  return (
    <div className="level">
      <div className="level__head">
        <span className="level__label">{t.traceLevel}</span>
        <span className="level__value num">{angle === null ? t.traceNoTilt : `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`}</span>
      </div>
      <svg viewBox={`0 -12 ${W} ${H + 26}`} role="img" aria-label={angle === null ? t.traceNoTilt : `${t.traceLevel} ${angle.toFixed(1)}°`}>
        {ticks.map((d) => (
          <line key={d} x1={x(d)} x2={x(d)} y1={-2} y2={d % 5 === 0 ? -10 : -6} className={d % 5 === 0 ? 'level__tick level__tick--major' : 'level__tick'} />
        ))}
        <rect x={0} y={0} width={W} height={H} rx={H / 2} className="level__vial" />
        <line x1={W / 2 - 22} x2={W / 2 - 22} y1={4} y2={H - 4} className="level__mark" />
        <line x1={W / 2 + 22} x2={W / 2 + 22} y1={4} y2={H - 4} className="level__mark" />
        {angle !== null && <circle cx={x(angle)} cy={H / 2} r={13} className={level ? 'level__bubble level__bubble--ok' : 'level__bubble'} />}
        {[-LEVEL_MAX, -5, 0, 5, LEVEL_MAX].map((d) => (
          <text key={d} x={x(d)} y={H + 12} textAnchor="middle" className="level__num">
            {d}
          </text>
        ))}
      </svg>
    </div>
  );
}

function cssVar(name: string, fallback: string): string {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '';
  return v || fallback;
}

/** Target, hold circle, trace segments, the moving aim point and the hit, all in mm scaled to the view radius R. */
function draw(
  g: CanvasRenderingContext2D,
  size: { w: number; h: number; dpr: number },
  r: Replay,
  tg: ScattTarget,
  spec: TargetSpec,
  R: number,
  pos: number,
  end: number,
  start: number,
  look: { hit: string; colours: Record<SegmentKind, string> },
) {
  const { w, h, dpr } = size;
  const S = Math.min(w, h) / 2 / (R * 1.04);
  const X = (mm: number) => w / 2 + mm * S;
  const Y = (mm: number) => h / 2 - mm * S;
  const card = cssVar('--target-card', '#e9ecef');
  const ink = cssVar('--target-ink', '#14181b');
  const dim = cssVar('--target-dim', '#7f8aa8');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = card;
  g.fillRect(0, 0, w, h);
  const disc = (rad: number, fill: string) => {
    g.beginPath();
    g.arc(X(0), Y(0), rad * S, 0, 2 * Math.PI);
    g.fillStyle = fill;
    g.fill();
  };
  const circle = (rad: number, stroke: string, width: number) => {
    g.beginPath();
    g.arc(X(0), Y(0), rad * S, 0, 2 * Math.PI);
    g.strokeStyle = stroke;
    g.lineWidth = width;
    g.stroke();
  };
  const black = tg.black / 2;
  disc(black, ink);
  const pen = Math.max(0.75, spec.stepMm * 0.02 * S);
  for (let n = 1; n <= 10; n++) {
    const rad = tg.rings[n] / 2;
    if (n === 10 && (!tg.innerTen || rad * S < 3)) disc(Math.max(rad, 1.5 / S), card);
    else circle(rad, rad > black + 1e-9 ? ink : dim, pen);
  }
  if (tg.innerTen) circle(tg.innerTen / 2, dim, pen);
  const fontPx = Math.min(30, spec.stepMm * 0.22 * S);
  if (fontPx >= 7) {
    g.font = `600 ${fontPx.toFixed(1)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let n = 1; n <= 8; n++) {
      const ro = tg.rings[n] / 2;
      const rr = ro - (tg.rings[n] - tg.rings[n + 1]) / 4;
      g.fillStyle = ro > black + 1e-9 ? ink : dim;
      for (const [sx, sy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) g.fillText(String(n), X(rr * sx), Y(rr * sy));
    }
  }
  // Hold circle of the control interval.
  g.beginPath();
  g.arc(X(r.hold.x), Y(r.hold.y), r.hold.r * S, 0, 2 * Math.PI);
  g.setLineDash([6, 4]);
  g.strokeStyle = 'rgba(235,237,242,.8)';
  g.lineWidth = 1.25;
  g.stroke();
  g.setLineDash([]);
  // The hit, a solid pellet of the real calibre, once the replay reaches it. Drawn first so the trace runs over it.
  if (pos >= r.shot) {
    g.beginPath();
    g.arc(X(r.x[r.shot]), Y(r.y[r.shot]), Math.max(3, (tg.caliber / 2) * S), 0, 2 * Math.PI);
    g.fillStyle = look.hit;
    g.fill();
    g.strokeStyle = ink;
    g.lineWidth = 1.5;
    g.stroke();
  }
  // Trace.
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = Math.max(1, tg.traceW * 0.6 * S); // thinner than SCATT's default (owner's choice)
  for (const s of segmentsUpTo(r, pos, end, start)) {
    g.beginPath();
    g.moveTo(X(r.x[s.from]), Y(r.y[s.from]));
    for (let i = s.from + 1; i <= s.to; i++) g.lineTo(X(r.x[i]), Y(r.y[i]));
    g.strokeStyle = look.colours[s.kind];
    g.stroke();
  }
  const p = pointAt(r, Math.min(pos, end));
  g.beginPath();
  g.arc(X(p.x), Y(p.y), Math.max(3.5, 0.3 * spec.stepMm * 0.1 * S), 0, 2 * Math.PI);
  g.fillStyle = '#fff';
  g.fill();
  g.strokeStyle = '#14181b';
  g.lineWidth = 1.25;
  g.stroke();
}
