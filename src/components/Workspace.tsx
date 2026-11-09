'use client';
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

export interface WorkspacePanel {
  id: string;
  title: string;
  /** Guide words: what part of the content is in view, e.g. "Serija 3 · pogoci 21–30". */
  range?: ReactNode;
  actions?: ReactNode;
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
  panels,
  cols = 12,
  rows,
  label,
}: {
  strip: ReactNode;
  panels: WorkspacePanel[];
  cols?: number;
  rows?: number;
  /** Accessible name of the phone tab list. */
  label: string;
}) {
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

  const gridStyle = { '--ws-cols': cols, ...(rows ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : {}) } as CSSProperties;

  return (
    <div className="ws">
      <header className="ws__strip">{strip}</header>
      <div className="ws__tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
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
      <div className="ws__grid" style={gridStyle}>
        {panels.map((p) => (
          <section
            key={p.id}
            id={`${base}-panel-${p.id}`}
            className="panel"
            aria-labelledby={`${base}-title-${p.id}`}
            data-panel={p.id}
            data-active={p.id === current ? '' : undefined}
            data-wide={p.wide ? '' : undefined}
            style={{ gridColumn: p.col, gridRow: p.row }}
          >
            <div className="panel__head">
              <h2 className="panel__title" id={`${base}-title-${p.id}`}>{p.title}</h2>
              {p.range && <span className="panel__range">{p.range}</span>}
              {p.actions && <div className="panel__actions">{p.actions}</div>}
            </div>
            <div className={p.flush ? 'panel__body panel__body--flush' : 'panel__body'}>{p.children}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
