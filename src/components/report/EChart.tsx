'use client';
import { useEffect, useRef } from 'react';
import type { ECharts } from 'echarts/core';

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

/**
 * One ECharts canvas that follows its container size. Charts sharing a `group`
 * move their cursors and zoom together. `onPick` gets the clicked point's data.
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

  return <div ref={el} className="echart" role="img" aria-label={label} />;
}
