'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ringRadiusMm, type TargetSpec } from '@/lib/report/target';

/** Wheel travel: view radius changes by this factor per pixel (as an exponent). */
const WHEEL_RATE = 0.0018;
/** A trackpad pinch arrives as a wheel with ctrlKey and tiny deltas. */
const PINCH_WHEEL_RATE = 0.012;
/** Button step. */
const STEP = 1.4;

/**
 * Smooth zoom about the target centre. `fitR` is the automatic view; once the user zooms, their radius holds until
 * the view is reset. The wheel, a trackpad pinch and a two-finger touch pinch on `el` scale the view continuously
 * (between ring 1 and a little inside the ten); there are no buttons.
 */
export function useRingZoom(spec: TargetSpec, fitR: number, el: RefObject<HTMLElement | SVGSVGElement | null>, resetKey: unknown) {
  const [chosen, setChosen] = useState<{ key: unknown; R: number } | null>(null);
  const R = chosen && chosen.key === resetKey ? chosen.R : fitR;
  const live = useRef({ spec, fitR, resetKey });
  useEffect(() => {
    live.current = { spec, fitR, resetKey };
  });

  // Functional update: several wheel events in one frame each start from the previous result.
  const [scale] = useState(() => (factor: number) =>
    setChosen((prev) => {
      const { spec: s, fitR: f, resetKey: k } = live.current;
      const cur = prev && prev.key === k ? prev.R : f;
      const lo = ringRadiusMm(s, 10) * 0.7;
      const hi = ringRadiusMm(s, 1);
      return { key: k, R: Math.min(hi, Math.max(lo, cur * factor)) };
    }),
  );

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onWheel = (e: Event) => {
      const w = e as WheelEvent;
      w.preventDefault();
      // Wheel down zooms out, up zooms in.
      scale(Math.exp(w.deltaY * (w.ctrlKey ? PINCH_WHEEL_RATE : WHEEL_RATE)));
    };
    const pts = new Map<number, [number, number]>();
    let base = 0;
    const dist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    };
    const down = (e: Event) => {
      const p = e as PointerEvent;
      pts.set(p.pointerId, [p.clientX, p.clientY]);
      base = pts.size === 2 ? dist() : 0;
    };
    const move = (e: Event) => {
      const p = e as PointerEvent;
      if (!pts.has(p.pointerId)) return;
      pts.set(p.pointerId, [p.clientX, p.clientY]);
      if (pts.size !== 2 || !base) return;
      const d = dist();
      if (d > 0) {
        // Fingers apart zoom in: the view radius shrinks by the same ratio.
        scale(base / d);
        base = d;
      }
    };
    const up = (e: Event) => {
      pts.delete((e as PointerEvent).pointerId);
      base = 0;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    };
  }, [el, scale]);

  return {
    R,
    zoomed: chosen !== null && chosen.key === resetKey,
    zoomIn: () => scale(1 / STEP),
    zoomOut: () => scale(STEP),
    fit: () => setChosen(null),
  };
}
