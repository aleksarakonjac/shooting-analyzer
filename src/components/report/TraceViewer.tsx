'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sr } from '@/lib/i18n/sr';
import { ringAtRadius, viewRadiusMm, type TargetSpec } from '@/lib/report/target';
import { angleAt, endFor, pointAt, segmentsUpTo, startFor, type Replay, type SegmentKind } from '@/lib/scatt/replay';
import type { ScattTarget } from '@/lib/scatt/targets';
import { cssVar, drawTarget, viewTransform } from '@/lib/scatt/drawTarget';
import { useRingZoom } from './useRingZoom';
import { DEFAULT_HIT, DEFAULT_TRACE_COLOURS, useReplaySettings, type OverlayKey } from './replaySettings';
import { TraceSettings } from './TraceSettings';
import { isTypingTarget } from './keys';

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
  // While playing, the playback loop owns the position (a render that has not committed yet must not pull it back);
  // otherwise it follows what is shown.
  useEffect(() => {
    if (!playing) posRef.current = pos;
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
      posRef.current = cur;
      last = now;
      setPos({ replay, pos: cur });
      if (cur >= end) {
        setPlaying(false);
        // Autoplay: hand over to the next shot after a short beat.
        if (autoplay === 'next' && onNext) endTimer.current = window.setTimeout(() => { chain.current = true; onNext(); }, 600);
      } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, replay, end, speed, start, autoplay, onNext]);

  // A shot that follows an autoplayed one (the autoplay setting) starts by itself; leaving or changing shots cancels a
  // pending hand-over. Any other change of shot, by the user, stops the playback and shows the new shot as it is before playing.
  useEffect(() => {
    if (chain.current) {
      chain.current = false;
      posRef.current = start;
      setPos({ replay, pos: start });
      setPlaying(true);
    } else {
      // Back to the view before any playback: the whole trace and hit drawn, the aiming time shown, nothing running.
      setPlaying(false);
      setPos(null);
      posRef.current = end;
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
    if (pos >= end - 0.5) {
      posRef.current = start;
      setPos({ replay, pos: start });
    }
    setPlaying(true);
  };
  // Space plays or pauses, Left / Right go a second back or forward.
  const toggleRef = useRef(toggle);
  const seekRef = useRef<(d: number) => void>(() => {});
  useEffect(() => {
    toggleRef.current = toggle;
    seekRef.current = (d) => {
      const to = Math.max(start, Math.min(end, posRef.current + d * replay.rate));
      posRef.current = to;
      setPos({ replay, pos: to });
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== ' ' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Typing fields keep their keys. Everything else (selectors, buttons, the slider) gives way: Space plays or
      // pauses, Left / Right rewind or forward by a second.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === ' ') toggleRef.current();
      else seekRef.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    // A focused button would still be "clicked" by Space on key release.
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== ' ' || isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, []);
  const k = Math.floor(pos);
  // The replay has been moved by playing or scrubbing (the position is only set then).
  const touched = posState !== null && posState.replay === replay;
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
                // Before the replay has been started: the aiming time. Once it runs (or is scrubbed) the figure is the moment
                // of the replay against the shot: −3.42 before it, 0.00 at it, 0.30 after it.
                aiming: [t.traceAiming, touched ? clockText(secs) : stats?.aimingS == null ? '—' : `${stats.aimingS.toFixed(1)} s`],
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
            posRef.current = Number(e.target.value);
            setPos({ replay, pos: Number(e.target.value) });
          }}
        />
        {settings && (
          <button
            type="button"
            className="trace__auto"
            aria-pressed={autoplay === 'next'}
            aria-label={t.autoNext}
            title={autoplay === 'next' ? t.autoNextOn : t.autoNextOff}
            onClick={() => settings.set({ autoplay: autoplay === 'next' ? 'off' : 'next' })}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
              <path d="M2.5 3v10a.5.5 0 0 0 .78.42L9.8 8.4a.5.5 0 0 0 0-.8L3.28 2.58A.5.5 0 0 0 2.5 3zM11.5 2.5h2v11h-2z" />
            </svg>
          </button>
        )}
      </div>
      <Level angle={tilt} />
      </div>
    </figure>
  );
}

/** The replay's distance to the shot in seconds: −3.42 before it, 0.00 at it, 0.30 after (no plus sign). */
function clockText(secs: number): string {
  const s = Math.round(secs * 100) / 100;
  return `${s < 0 ? '−' : ''}${Math.abs(s).toFixed(2)} s`;
}

/** The weapon tilt as a thin scale: a line with ticks at 0, ±5 and ±10°, the level zone (±0.5°) thicker, and a dot at the smoothed angle (clamped at ±10°). */
function Level({ angle }: { angle: number | null }) {
  const W = 300;
  const H = 20;
  const m = 8; // room for the dot at the ends
  const x = (deg: number) => m + ((Math.max(-LEVEL_MAX, Math.min(LEVEL_MAX, deg)) + LEVEL_MAX) / (2 * LEVEL_MAX)) * (W - 2 * m);
  const level = angle !== null && Math.abs(angle) <= 0.5;
  return (
    <div className="level">
      <div className="level__head">
        <span className="level__label">{t.traceLevel}</span>
        <span className="level__value num">{angle === null ? t.traceNoTilt : `${angle >= 0 ? '+' : ''}${angle.toFixed(1)}°`}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={angle === null ? t.traceNoTilt : `${t.traceLevel} ${angle.toFixed(1)}°`}>
        <line x1={x(-LEVEL_MAX)} x2={x(LEVEL_MAX)} y1={H / 2} y2={H / 2} className="level__line" />
        <line x1={x(-0.5)} x2={x(0.5)} y1={H / 2} y2={H / 2} className="level__zone" />
        {[-LEVEL_MAX, -5, 0, 5, LEVEL_MAX].map((d) => (
          <line key={d} x1={x(d)} x2={x(d)} y1={d === 0 ? 3 : 6} y2={d === 0 ? H - 3 : H - 6} className={d === 0 ? 'level__tick level__tick--zero' : 'level__tick'} />
        ))}
        {angle !== null && <circle cx={x(angle)} cy={H / 2} r={4.5} className={level ? 'level__dot level__dot--ok' : 'level__dot'} />}
      </svg>
    </div>
  );
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
  const { S, X, Y } = viewTransform(size, R);
  const ink = cssVar('--target-ink', '#14181b');
  drawTarget(g, size, tg, spec, R);
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
