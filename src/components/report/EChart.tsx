'use client';
import { useEffect, useRef, useState } from 'react';
import type { ECharts } from 'echarts/core';
import { sr } from '@/lib/i18n/sr';
import { panWindow, wheelGesture, zoomWindow, type ZoomWindow } from '@/lib/report/zoom';

/** Loads only the ECharts parts we use, on the client. */
async function loadEcharts() {
  const [core, charts, comps, renderers] = await Promise.all([
    import('echarts/core'),
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers'),
  ]);
  core.use([
    charts.LineChart,
    charts.BarChart,
    charts.ScatterChart,
    comps.GridComponent,
    comps.TooltipComponent,
    comps.DataZoomComponent,
    comps.MarkAreaComponent,
    comps.MarkLineComponent,
    comps.AxisPointerComponent,
    comps.LegendComponent,
    renderers.CanvasRenderer,
  ]);
  return core;
}

/** The chart's current x window, from its first dataZoom component. */
function currentWindow(c: ECharts): ZoomWindow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dz = (c.getOption() as any).dataZoom?.[0];
  return { start: dz?.start ?? 0, end: dz?.end ?? 100 };
}

/**
 * One ECharts canvas that follows its container size. Charts sharing a `group`
 * move their cursors and zoom together. `onPick` gets the clicked point's data.
 * Pinch and the mouse wheel zoom around the pointer, a sideways swipe or a drag pans, and a button resets.
 */
export function EChart({
  option,
  group,
  label,
  onPick,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  option: any;
  group?: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPick?: (data: any) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const pick = useRef(onPick);
  const wrap = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    loadEcharts().then((core) => {
      if (!alive || !el.current) return;
      const c = core.init(el.current, undefined, { renderer: 'canvas' });
      chart.current = c;
      if (group) {
        c.group = group;
        core.connect(group);
      }
      c.on('click', (p) => pick.current?.(p.data));
      c.on('datazoom', () => {
        const w = currentWindow(c);
        setZoomed(w.start > 0.01 || w.end < 99.99);
      });
      ro = new ResizeObserver(() => c.resize());
      ro.observe(el.current);
    });
    return () => {
      alive = false;
      ro?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, [group]);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      if (chart.current) chart.current.setOption(option, { replaceMerge: ['series'], lazyUpdate: true });
      else raf = requestAnimationFrame(apply);
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [option]);

  // Our own wheel handling runs first (capture) and keeps the chart's coarse built-in wheel zoom out;
  // touch pinch and drag stay with ECharts.
  useEffect(() => {
    const box = wrap.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      const c = chart.current;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!c || !(c.getOption() as any).dataZoom?.length) return;
      e.preventDefault();
      e.stopPropagation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const grid = (c.getOption() as any).grid?.[0] ?? {};
      const left = typeof grid.left === 'number' ? grid.left : 0;
      const right = typeof grid.right === 'number' ? grid.right : 0;
      const rect = box.getBoundingClientRect();
      const plot = Math.max(1, rect.width - left - right);
      const g = wheelGesture(e, plot);
      const w = currentWindow(c);
      const at = Math.min(1, Math.max(0, (e.clientX - rect.left - left) / plot));
      const next = g.kind === 'zoom' ? zoomWindow(w, at, g.factor) : panWindow(w, g.share);
      c.dispatchAction({ type: 'dataZoom', start: next.start, end: next.end });
    };
    box.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => box.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return (
    <div ref={wrap} className="echart-wrap">
      <div ref={el} className="echart" role="img" aria-label={label} />
      {zoomed && (
        <button
          type="button"
          className="button--quiet echart__reset"
          onClick={() => chart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })}
        >
          {sr.report.zoomReset}
        </button>
      )}
    </div>
  );
}
