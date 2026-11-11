'use client';
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

export interface WorkspacePanel {
  id: string;
  title: string;
  /** Guide words: what part of the content is in view, e.g. "Serija 3 · pogoci 21–30". */
  range?: ReactNode;
  actions?: ReactNode;
  /** Hide the header row visually (title stays for screen readers). */
  headless?: boolean;
  /** A slide-in column on the right of the desktop grid; the other panels fill the rest. */
  side?: boolean;
  /** A side panel that is shut: stays mounted so it can slide, hidden from tabs and assistive tech. */
  closed?: boolean;
  /** Grid placement on desktop, e.g. { col: '1 / 4', row: '1 / 3' }. */
  col?: string;
  row?: string;
  /** Spans both columns on tablets. */
  wide?: boolean;
  /** No padding in the body (lists and charts that draw to the edge). */
  flush?: boolean;
  children: ReactNode;
}

/**
 * A screen as a broadcast board: a strip on top and a grid of panels that fills the viewport.
 * Desktop shows every panel and each scrolls on its own; a phone shows one panel per tab.
 */
export function Workspace({
  strip,
  panels: allPanels,
  cols = 12,
  rows,
  rowTemplate,
  label,
  resizable,
}: {
  /** Panels side by side in one row with draggable splitters; widths are kept per `id`. */
  resizable?: { id: string; widths: number[]; /** Smallest width of each column, in px. */ minPx: number[] };
  /** Explicit row sizes, e.g. 'auto repeat(5, minmax(0, 1fr))' when one row should fit its content. */
  rowTemplate?: string;
  strip: ReactNode;
  panels: WorkspacePanel[];
  cols?: number;
  rows?: number;
  /** Accessible name of the phone tab list. */
  label: string;
}) {
  const panels = allPanels.filter((p) => !p.closed);
  const hasSide = allPanels.some((p) => p.side);
  const base = useId();
  const [active, setActive] = useState(panels[0]?.id);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = panels.some((p) => p.id === active) ? active : panels[0]?.id;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = panels.findIndex((p) => p.id === current);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % panels.length
      : e.key === 'ArrowLeft' ? (i - 1 + panels.length) % panels.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? panels.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(panels[next].id);
    tabs.current[next]?.focus();
  };

  const widths = useSplit(resizable);
  const template = rowTemplate ?? (rows ? `repeat(${rows}, minmax(0, 1fr))` : undefined);
  const gridStyle = {
    '--ws-cols': cols,
    ...(template ? { gridTemplateRows: template } : {}),
    ...(widths ? { '--ws-split': widths.values.map((w, i) => `minmax(${cfg0(resizable, i)}px, ${w}fr)`).join(' ') } : {}),
  } as CSSProperties;

  return (
    <div className="ws">
      <header className="ws__strip">{strip}</header>
      <div className="ws__tabs" role="tablist" aria-label={label} onKeyDown={onKey} hidden={panels.length < 2}>
        {panels.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${p.id}`}
            className="ws__tab"
            aria-selected={p.id === current}
            aria-controls={`${base}-panel-${p.id}`}
            tabIndex={p.id === current ? 0 : -1}
            onClick={() => setActive(p.id)}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div className={[hasSide ? 'ws__grid ws__grid--side' : 'ws__grid', widths ? 'ws__grid--split' : ''].filter(Boolean).join(' ')} style={gridStyle} ref={widths?.grid}>
        {allPanels.map((p) => (
          <section
            key={p.id}
            id={`${base}-panel-${p.id}`}
            className="panel"
            aria-labelledby={`${base}-title-${p.id}`}
            data-panel={p.id}
            data-active={p.id === current ? '' : undefined}
            data-wide={p.wide ? '' : undefined}
            data-side={p.side ? '' : undefined}
            data-closed={p.closed ? '' : undefined}
            inert={p.closed || undefined}
            style={{ gridColumn: widths ? allPanels.indexOf(p) + 1 : p.col, gridRow: p.row }}
          >
            <div className={p.headless ? 'sr-only' : 'panel__head'}>
              <h2 className="panel__title" id={`${base}-title-${p.id}`}>{p.title}</h2>
              {p.range && <span className="panel__range">{p.range}</span>}
              {p.actions && <div className="panel__actions">{p.actions}</div>}
            </div>
            <div className={p.flush ? 'panel__body panel__body--flush' : 'panel__body'}>{p.children}</div>
          </section>
        ))}
        {widths?.values.slice(0, -1).map((_, i) => {
          const left = widths.values.slice(0, i + 1).reduce((a, b) => a + b, 0) / widths.total;
          return (
            <div
              key={i}
              className="ws__split"
              role="separator"
              aria-orientation="vertical"
              aria-label={`${allPanels[i].title} / ${allPanels[i + 1].title}`}
              aria-valuenow={Math.round((widths.values[i] / widths.total) * 100)}
              tabIndex={0}
              style={{ left: `${left * 100}%` }}
              onPointerDown={(e) => widths.start(i, e)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') { e.preventDefault(); widths.nudge(i, -0.25); }
                if (e.key === 'ArrowRight') { e.preventDefault(); widths.nudge(i, 0.25); }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Column widths (in fr) that the user drags, remembered in this browser. */
function cfg0(r: { minPx: number[] } | undefined, i: number): number {
  return r?.minPx[i] ?? 0;
}

function useSplit(cfg: { id: string; widths: number[]; minPx: number[] } | undefined) {
  const grid = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState(cfg?.widths ?? []);
  const key = cfg ? `ws-split:${cfg.id}` : '';
  useEffect(() => {
    if (!cfg) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as number[] | null;
      // Browser storage is only readable after mount, so the saved widths are applied here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved) && saved.length === cfg.widths.length && saved.every((n) => typeof n === 'number' && n > 0)) setValues(saved);
    } catch {
      /* storage blocked: keep the defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!cfg) return null;
  const total = values.reduce((a, b) => a + b, 0);
  const save = (v: number[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage blocked */
    }
  };
  const move = (base: number[], i: number, delta: number) => {
    const next = [...base];
    const width = grid.current?.getBoundingClientRect().width || 1;
    const minFr = (k: number) => (cfg.minPx[k] / width) * total;
    const d = Math.max(minFr(i) - base[i], Math.min(base[i + 1] - minFr(i + 1), delta));
    next[i] = base[i] + d;
    next[i + 1] = base[i + 1] - d;
    return next;
  };
  const start = (i: number, e: ReactPointerEvent<HTMLDivElement>) => {
    const width = grid.current?.getBoundingClientRect().width;
    if (!width) return;
    e.preventDefault();
    const x0 = e.clientX;
    const base = values;
    let last = base;
    const onMove = (ev: PointerEvent) => {
      last = move(base, i, ((ev.clientX - x0) / width) * total);
      setValues(last);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      save(last);
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const nudge = (i: number, delta: number) => {
    const next = move(values, i, delta);
    setValues(next);
    save(next);
  };
  return { grid, values, total, start, nudge };
}
