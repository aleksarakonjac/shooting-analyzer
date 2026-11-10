'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { zoomRing, type TargetSpec } from '@/lib/report/target';

/** Wheel travel (pixels) for one ring step. */
const WHEEL_STEP = 80;
/** Pinch: finger distance ratio for one ring step. */
const PINCH_STEP = 1.25;

/**
 * Ring-by-ring zoom about the target centre, as in SCATT. `fitR` is the automatic view; once the
 * user zooms, their ring holds until "Prilagodi". The wheel and a two-finger pinch on `el` step too.
 */
export function useRingZoom(spec: TargetSpec, fitR: number, el: RefObject<HTMLElement | SVGSVGElement | null>, resetKey: unknown) {
  const [chosen, setChosen] = useState<{ key: unknown; R: number } | null>(null);
  const R = chosen && chosen.key === resetKey ? chosen.R : fitR;
  const live = useRef({ spec, fitR, resetKey });
  useEffect(() => {
    live.current = { spec, fitR, resetKey };
  });

  // Functional update: several wheel steps in one event each start from the previous one.
  const [step] = useState(() => (dir: 'in' | 'out') =>
    setChosen((prev) => {
      const { spec: s, fitR: f, resetKey: k } = live.current;
      const cur = prev && prev.key === k ? prev.R : f;
      return { key: k, R: zoomRing(s, cur, dir) };
    }),
  );

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let acc = 0;
    const onWheel = (e: Event) => {
      const w = e as WheelEvent;
      w.preventDefault();
      acc += w.deltaY;
      while (Math.abs(acc) >= WHEEL_STEP) {
        step(acc < 0 ? 'in' : 'out');
        acc -= Math.sign(acc) * WHEEL_STEP;
      }
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
      if (d / base >= PINCH_STEP) {
        step('in');
        base = d;
      } else if (base / d >= PINCH_STEP) {
        step('out');
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
  }, [el, step]);

  return {
    R,
    zoomed: chosen !== null && chosen.key === resetKey,
    zoomIn: () => step('in'),
    zoomOut: () => step('out'),
    fit: () => setChosen(null),
  };
}
