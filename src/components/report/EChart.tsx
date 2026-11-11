'use client';
import { useEffect, useRef, useState } from 'react';
import type { ECharts } from 'echarts/core';
import { sr } from '@/lib/i18n/sr';
import type { ZoomWindow } from '@/lib/report/zoom';

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
 * Charts with a zoom slider are zoomed only by that slider (no wheel, pinch or drag gestures); a button resets.
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
