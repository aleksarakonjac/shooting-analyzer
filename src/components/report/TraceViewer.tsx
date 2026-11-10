'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { sr } from '@/lib/i18n/sr';
import { ringAtRadius, viewRadiusMm, type TargetSpec } from '@/lib/report/target';
import { angleAt, endFor, pointAt, segmentsUpTo, type Replay, type SegmentKind } from '@/lib/scatt/replay';
import type { ScattTarget } from '@/lib/scatt/targets';
import { useRingZoom } from './useRingZoom';

const t = sr.report;

/** SCATT Expert's default trace colours (dark palette; the owner chose them for both themes). */
export const TRACE_COLOURS: Record<SegmentKind, string> = {
  before: '#09e57c',
  control: '#eac223',
  last250: '#2c97e7',
  after: '#cc3641',
};

const SPEEDS = ['0.25', '0.5', '1', '2'] as const;
const AFTERS = ['0.5', '1', '2'] as const;
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
  onBack,
}: {
  replay: Replay;
  spec: TargetSpec;
  target: ScattTarget;
  shotN: number;
  score: string;
  onBack: () => void;
}) {
  const [after, setAfter] = useState<(typeof AFTERS)[number]>('1');
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>('1');
  const end = endFor(replay, Number(after));
  const [posState, setPos] = useState<{ replay: Replay; pos: number } | null>(null);
  const pos = posState && posState.replay === replay ? Math.min(posState.pos, end) : end;
  const [playing, setPlaying] = useState(false);
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
      cur = Math.min(end, cur + ((now - last) / 1000) * replay.rate * Number(speed));
      last = now;
      setPos({ replay, pos: cur });
      if (cur >= end) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, replay, end, speed]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.w || !size.h) return;
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    const g = c.getContext('2d');
    if (!g) return;
    draw(g, size, replay, target, spec, zoom.R, pos, end);
  }, [size, replay, target, spec, zoom.R, pos, end]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (pos >= end - 0.5) setPos({ replay, pos: 0 });
    setPlaying(true);
  };
  const k = Math.floor(pos);
  const secs = (pos - replay.shot) / replay.rate;
  const tilt = angleAt(replay, k);
  const ring = ringAtRadius(spec, zoom.R);

  return (
    <figure className="trace">
      <div className="trace__head">
        <button type="button" className="button--quiet" onClick={onBack}>
          ← {t.traceBack}
        </button>
        <span className="trace__score num">{score}</span>
        <span className="trace__hold">
          {t.traceHold} <strong className="num">Ø {(2 * replay.hold.r).toFixed(1)} mm</strong>
        </span>
      </div>
      <div ref={wrap} className="trace__canvas">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${t.traceTitle(shotN)}: ${score}, ${t.traceHold} ${(2 * replay.hold.r).toFixed(1)} mm`}
          onDoubleClick={zoom.fit}
        />
        <div className="trace__zoom" role="group" aria-label={t.zoomRing(ring)}>
          <button type="button" onClick={zoom.zoomIn} aria-label={t.zoomIn} title={t.zoomIn}>+</button>
          <button type="button" onClick={zoom.zoomOut} aria-label={t.zoomOut} title={t.zoomOut}>−</button>
          {zoom.zoomed && (
            <button type="button" onClick={zoom.fit} title={t.zoomFit}>
              {t.zoomFit}
            </button>
          )}
        </div>
      </div>
      <div className="trace__bar">
        <button type="button" className="trace__play" onClick={toggle} aria-pressed={playing}>
          {playing ? `❚❚ ${t.tracePause}` : `▶ ${t.tracePlay}`}
        </button>
        <input
          type="range"
          className="trace__scrub"
          aria-label={t.tracePos}
          aria-valuetext={t.traceFromShot(secs.toFixed(2))}
          min={0}
          max={end}
          step={1}
          value={k}
          onChange={(e) => {
            setPlaying(false);
            setPos({ replay, pos: Number(e.target.value) });
          }}
        />
        <span className="trace__time num">{t.traceFromShot((secs >= 0 ? '+' : '') + secs.toFixed(2))}</span>
      </div>
      <div className="trace__opts">
        <Segmented label={t.traceSpeed} full={false} value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ id: s, label: `${s.replace('.', ',')}×` }))} />
        <Segmented label={t.traceAfter} full={false} value={after} onChange={setAfter} options={AFTERS.map((s) => ({ id: s, label: `${s.replace('.', ',')} s` }))} />
      </div>
      <Level angle={tilt} />
      <figcaption className="trace__legend">
        {(Object.keys(TRACE_COLOURS) as SegmentKind[]).map((kind) => (
          <span key={kind}>
            <i className="key key--trace" style={{ background: TRACE_COLOURS[kind] }} aria-hidden="true" /> {t.traceLegend[kind]}
          </span>
        ))}
        <span>{t.zoomRing(ring)}</span>
      </figcaption>
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
      <span className="level__label">{t.traceLevel}</span>
      <svg viewBox={`0 -12 ${W} ${H + 26}`} role="img" aria-label={angle === null ? t.traceNoTilt : `${t.traceLevel} ${angle.toFixed(1)}°`}>
        {ticks.map((d) => (
          <line key={d} x1={x(d)} x2={x(d)} y1={-2} y2={d % 5 === 0 ? -10 : -6} className={d % 5 === 0 ? 'level__tick level__tick--major' : 'level__tick'} />
        ))}
        <rect x={0} y={0} width={W} height={H} rx={H / 2} className="level__vial" />
        <line x1={W / 2 - 22} x2={W / 2 - 22} y1={4} y2={H - 4} className="level__mark" />
        <line x1={W / 2 + 22} x2={W / 2 + 22} y1={4} y2={H - 4} className="level__mark" />
        {angle !== null && <ellipse cx={x(angle)} cy={H / 2} rx={19} ry={12} className={level ? 'level__bubble level__bubble--ok' : 'level__bubble'} />}
        {[-LEVEL_MAX, -5, 0, 5, LEVEL_MAX].map((d) => (
          <text key={d} x={x(d)} y={H + 12} textAnchor="middle" className="level__num">
            {d}
          </text>
        ))}
      </svg>
      <span className="level__value num">{angle === null ? t.traceNoTilt : `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`}</span>
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
) {
  const { w, h, dpr } = size;
  const S = Math.min(w, h) / 2 / (R * 1.04);
  const X = (mm: number) => w / 2 + mm * S;
  const Y = (mm: number) => h / 2 - mm * S;
  const card = cssVar('--target-card', '#e9ecef');
  const ink = cssVar('--target-ink', '#14181b');
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
    else circle(rad, rad > black + 1e-9 ? ink : card, pen);
  }
  if (tg.innerTen) circle(tg.innerTen / 2, card, pen);
  const fontPx = Math.min(30, spec.stepMm * 0.22 * S);
  if (fontPx >= 7) {
    g.font = `600 ${fontPx.toFixed(1)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let n = 1; n <= 8; n++) {
      const ro = tg.rings[n] / 2;
      const rr = ro - (tg.rings[n] - tg.rings[n + 1]) / 4;
      g.fillStyle = ro > black + 1e-9 ? ink : card;
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
  // Trace.
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = Math.max(1, tg.traceW * 0.6 * S); // thinner than SCATT's default (owner's choice)
  for (const s of segmentsUpTo(r, pos, end)) {
    g.beginPath();
    g.moveTo(X(r.x[s.from]), Y(r.y[s.from]));
    for (let i = s.from + 1; i <= s.to; i++) g.lineTo(X(r.x[i]), Y(r.y[i]));
    g.strokeStyle = TRACE_COLOURS[s.kind];
    g.stroke();
  }
  // The hit, as a pellet of the real calibre, once the replay reaches it.
  if (pos >= r.shot) {
    g.beginPath();
    g.arc(X(r.x[r.shot]), Y(r.y[r.shot]), Math.max(3, (tg.caliber / 2) * S), 0, 2 * Math.PI);
    g.fillStyle = 'rgba(204,54,65,.12)';
    g.fill();
    g.strokeStyle = TRACE_COLOURS.after;
    g.lineWidth = 2;
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
