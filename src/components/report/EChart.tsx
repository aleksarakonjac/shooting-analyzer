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
 * Charts with a zoom slider zoom by it; the time charts also pinch to zoom and swipe sideways to pan (see `zoomPinch` in
 * charts.ts), while a plain wheel and a vertical swipe stay with the page. A button resets.
 */
export function EChart({
  option,
  group,
  label,
  onPick,
  pinTooltip,
  cursorDot,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  option: any;
  group?: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPick?: (data: any) => void;
  /**
   * A click on a point keeps its tooltip open (the pointer no longer moves it). A click anywhere else, or a swipe on a
   * touch screen, lets it go and the tooltip follows the pointer again.
   */
  pinTooltip?: boolean;
  /**
   * Where to put the dot of the series with id `pulse-cursor` for the x value of the axis pointer (the line that follows
   * the pointer), or null for none. The dot sits on the pulse line where the pointer line crosses it.
   */
  cursorDot?: (x: number) => [number, number] | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const pick = useRef(onPick);
  const pinnable = useRef(pinTooltip);
  const dotAt = useRef(cursorDot);
  // The pinned point (its shot number) and the hooks that release / show it again; set up with the chart.
  const pin = useRef<{ n: number | null; release: () => void; show: (n: number) => void } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    pick.current = onPick;
    pinnable.current = pinTooltip;
    dotAt.current = cursorDot;
  }, [onPick, pinTooltip, cursorDot]);

  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | null = null;
    let cleanup: (() => void) | null = null;
    loadEcharts().then((core) => {
      if (!alive || !el.current) return;
      const c = core.init(el.current, undefined, { renderer: 'canvas' });
      chart.current = c;
      if (group) {
        c.group = group;
        core.connect(group);
      }
      let pinned = false;
      let pinnedN: number | null = null;
      // The dot is set on the next frame, never inside the axis-pointer event itself: linked charts (the group) dispatch that
      // event from within their own update, and a setOption there breaks ECharts' data handling.
      let dotFrame = 0;
      let dotPoint: [number, number] | null = null;
      const setDot = (point: [number, number] | null) => {
        dotPoint = point;
        if (dotFrame) return;
        dotFrame = requestAnimationFrame(() => {
          dotFrame = 0;
          if (c.isDisposed()) return;
          try {
            c.setOption({ series: [{ id: 'pulse-cursor', data: dotPoint ? [dotPoint] : [] }] }, { lazyUpdate: true });
          } catch {
            /* the chart is being rebuilt: the next pointer move sets the dot again */
          }
        });
      };
      c.on('updateAxisPointer', (e: unknown) => {
        if (!dotAt.current) return;
        const x = (e as { axesInfo?: { axisDim: string; value: number }[] }).axesInfo?.find((a) => a.axisDim === 'x')?.value;
        setDot(typeof x === 'number' ? dotAt.current(x) : null);
      });
      c.on('globalout', () => {
        if (!pinned && dotAt.current) setDot(null);
      });
      const unpin = () => {
        if (!pinned) return;
        pinned = false;
        pinnedN = null;
        if (dotAt.current) setDot(null);
        c.setOption({ tooltip: { triggerOn: 'mousemove|click', alwaysShowContent: false } });
        c.dispatchAction({ type: 'hideTip' });
      };
      // Before the chart's data is replaced the pinned tooltip is put away (its references to the old series would
      // otherwise break ECharts), and once the new data is in it is shown again for the same shot.
      const release = () => {
        if (!pinned) return;
        c.dispatchAction({ type: 'hideTip' });
        c.setOption({ tooltip: { triggerOn: 'mousemove|click', alwaysShowContent: false } });
      };
      const show = (n: number) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = ((c.getOption() as any).series?.[0]?.data ?? []) as { n?: number }[];
        const dataIndex = data.findIndex((d) => d.n === n);
        if (dataIndex < 0) {
          unpin();
          return;
        }
        c.setOption({ tooltip: { triggerOn: 'none', alwaysShowContent: true } });
        try {
          c.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex });
        } catch {
          unpin();
        }
      };
      pin.current = {
        get n() {
          return pinnedN;
        },
        release,
        show,
      };
      // A click that did not land on a point lets the pinned tooltip go: the point's own handler runs between the
      // capture and bubble listeners of the host below, and marks the click as a pin.
      let pinnedByThisClick = false;
      c.on('click', (p) => {
        pick.current?.(p.data);
        if (pinnable.current && p.componentType === 'series' && p.seriesType === 'scatter') {
          pinnedByThisClick = true;
          pinned = true;
          pinnedN = (p.data as { n?: number } | undefined)?.n ?? null;
          c.setOption({ tooltip: { triggerOn: 'none', alwaysShowContent: true } });
          try {
            c.dispatchAction({ type: 'showTip', seriesIndex: p.seriesIndex, dataIndex: p.dataIndex });
          } catch {
            pinned = false;
          }
        }
      });
      // A swipe on a touch screen does the same, and the tooltip then follows the finger along the line.
      let touchFrom: { x: number; y: number } | null = null;
      const host = el.current;
      const onTouchStart = (e: TouchEvent) => {
        touchFrom = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      };
      const onTouchMove = (e: TouchEvent) => {
        if (touchFrom && Math.hypot(e.touches[0].clientX - touchFrom.x, e.touches[0].clientY - touchFrom.y) > 8) unpin();
      };
      const onClickCapture = () => {
        pinnedByThisClick = false;
      };
      const onClickBubble = () => {
        if (!pinnedByThisClick) unpin();
      };
      host.addEventListener('click', onClickCapture, true);
      host.addEventListener('click', onClickBubble);
      // A plain wheel scrolls the page; only a pinch (a wheel with ctrl, as a trackpad sends it) reaches the chart's zoom.
      const onWheel = (e: WheelEvent) => {
        if (!e.ctrlKey) e.stopImmediatePropagation();
      };
      host.addEventListener('wheel', onWheel, { capture: true, passive: true });
      host.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
      host.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
      cleanup = () => {
        cancelAnimationFrame(dotFrame);
        host.removeEventListener('click', onClickCapture, true);
        host.removeEventListener('click', onClickBubble);
        host.removeEventListener('wheel', onWheel, true);
        host.removeEventListener('touchstart', onTouchStart, true);
        host.removeEventListener('touchmove', onTouchMove, true);
      };
      c.on('datazoom', () => {
        const w = currentWindow(c);
        setZoomed(w.start > 0.01 || w.end < 99.99);
      });
      ro = new ResizeObserver(() => c.resize());
      ro.observe(el.current);
    });
    return () => {
      alive = false;
      cleanup?.();
      ro?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, [group]);

  useEffect(() => {
    let raf = 0;
    let raf2 = 0;
    const apply = () => {
      const c = chart.current;
      if (!c) {
        raf = requestAnimationFrame(apply);
        return;
      }
      const held = pin.current?.n ?? null;
      if (held !== null) pin.current?.release();
      c.setOption(option, { replaceMerge: ['series'], lazyUpdate: true });
      // Two frames on: the update has been flushed and the shot's new data index can be looked up.
      if (held !== null) raf = requestAnimationFrame(() => (raf2 = requestAnimationFrame(() => !c.isDisposed() && pin.current?.show(held))));
    };
    apply();
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(raf2);
    };
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
