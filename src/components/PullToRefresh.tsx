'use client';
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sr } from '@/lib/i18n/sr';

/** How far (px, after damping) the page must be pulled before letting go refreshes it. */
const THRESHOLD = 70;
/** The indicator stops following the finger past this. */
const MAX_PULL = 110;
/** A pull follows the finger at half speed, the familiar rubber-band feel. */
const DAMPING = 0.5;
/** The spinner shows at least this long, so a quick refresh still reads as one. */
const MIN_SPIN_MS = 500;

type State = 'idle' | 'pull' | 'ready' | 'refreshing';

// A phone or tablet: a coarse pointer (the touch screen). Off on a laptop, mouse or trackpad.
const coarse = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const subscribe = (cb: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia('(pointer: coarse)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

/** Where a touch starts that has its own gesture (target zoom, charts, typing, dialogs) or opted out. */
function ownsGesture(el: Element | null): boolean {
  return !!el?.closest('canvas, input, textarea, select, [contenteditable="true"], [data-no-pull], [role="dialog"], [role="slider"]');
}

/** True when nothing between the touch and the page is scrolled down: the content under the finger is at its top. */
function atTop(el: Element | null): boolean {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return false;
  }
  return (document.scrollingElement?.scrollTop ?? 0) <= 0;
}

/**
 * Pull down from the top to refresh, on a phone held either way (an installed web app has no browser reload).
 * Anywhere the content under the finger is already at its top, a downward pull shows the indicator; letting go
 * past the threshold refreshes the page's data in place (router.refresh): the page, the open tab, the selection
 * and every other on-screen state stay as they were.
 */
export function PullToRefresh({ enabled, onRefresh }: { enabled?: boolean; onRefresh?: () => Promise<void> | void }) {
  const router = useRouter();
  const isCoarse = useSyncExternalStore(subscribe, coarse, () => false);
  const on = enabled ?? isCoarse;
  const [state, setState] = useState<State>('idle');
  const [pull, setPull] = useState(0);
  const [pending, startTransition] = useTransition();
  const refreshRef = useRef(onRefresh);
  const routerRef = useRef(router);
  useEffect(() => {
    refreshRef.current = onRefresh;
    routerRef.current = router;
  });
  const stateRef = useRef<State>('idle');
  const setBoth = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  // The built-in refresh: server data again for the same page; finishes when the transition does (below).
  const spinningSince = useRef(0);
  useEffect(() => {
    if (state !== 'refreshing' || refreshRef.current || pending) return;
    const left = Math.max(0, MIN_SPIN_MS - (Date.now() - spinningSince.current));
    const id = window.setTimeout(() => {
      setBoth('idle');
      setPull(0);
    }, left);
    return () => window.clearTimeout(id);
  }, [state, pending]);

  useEffect(() => {
    if (!on) return;
    let start: { x: number; y: number; target: Element | null } | null = null;
    let decided: 'pull' | 'other' | null = null;
    let dist = 0;

    const reset = () => {
      start = null;
      decided = null;
      dist = 0;
    };
    const onStart = (e: TouchEvent) => {
      if (stateRef.current === 'refreshing' || e.touches.length !== 1) return reset();
      const t = e.touches[0];
      const target = e.target instanceof Element ? e.target : null;
      if (ownsGesture(target)) return reset();
      start = { x: t.clientX, y: t.clientY, target };
      decided = null;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start || decided === 'other' || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (decided === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // Down, mostly vertical, from content at its top: a pull. Anything else is the page's own gesture.
        decided = dy > 0 && Math.abs(dy) > Math.abs(dx) && atTop(start.target) ? 'pull' : 'other';
        if (decided === 'other') return;
      }
      // The page does not bounce under the pull.
      if (e.cancelable) e.preventDefault();
      dist = Math.max(0, Math.min(MAX_PULL, dy * DAMPING));
      setPull(dist);
      setBoth(dist >= THRESHOLD ? 'ready' : dist > 0 ? 'pull' : 'idle');
    };
    const onEnd = () => {
      if (decided === 'pull' && dist >= THRESHOLD) {
        setBoth('refreshing');
        setPull(THRESHOLD);
        spinningSince.current = Date.now();
        const custom = refreshRef.current;
        if (custom) {
          void Promise.resolve(custom()).finally(() => {
            setBoth('idle');
            setPull(0);
          });
        } else {
          startTransition(() => routerRef.current.refresh());
        }
      } else if (stateRef.current !== 'refreshing') {
        setBoth('idle');
        setPull(0);
      }
      reset();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
    // Listeners stay for the whole gesture: they read the latest props through refs.
  }, [on]);

  const t = sr.pull;
  const label = state === 'refreshing' ? t.refreshing : state === 'ready' ? t.release : t.pull;
  return (
    <div
      className="ptr"
      role="status"
      aria-live="polite"
      data-state={state}
      aria-hidden={state === 'idle'}
      style={{ transform: `translate(-50%, ${pull - 48}px)` }}
    >
      <span className="ptr__disc" aria-hidden="true">
        {state === 'refreshing' ? (
          <svg className="ptr__spin" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.2-8.55" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${Math.min(1, pull / THRESHOLD) * 180}deg)` }}>
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        )}
      </span>
      <span className="ptr__label">{label}</span>
    </div>
  );
}
