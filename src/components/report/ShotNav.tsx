'use client';
import { useRef, type TouchEvent } from 'react';
import type { Selection } from '@/lib/report/charts';
import type { ReportView } from '@/lib/report/viewModel';
import { sr } from '@/lib/i18n/sr';

const t = sr.report;
const SWIPE_PX = 48;

/**
 * Phone navigation under the target: the shots of the current series as a row to tap,
 * and the previous / next series (also by swiping the row left or right).
 */
export function ShotNav({ view, selection, onSelect }: { view: ReportView; selection: Selection; onSelect: (s: Selection) => void }) {
  const at = view.series.findIndex((s) => s.idx === selection.series);
  const index = at < 0 ? 0 : at;
  const series = view.series[index];
  const start = useRef<{ x: number; y: number } | null>(null);
  if (!series) return null;

  const pickedPos = series.shots.findIndex((sh) => sh.n === selection.shot);
  // Moving to another series keeps the shot position, so stepping through series compares like with like.
  const goSeries = (d: number) => {
    const to = view.series[index + d];
    if (!to) return;
    onSelect({ series: to.idx, shot: pickedPos >= 0 ? (to.shots[pickedPos]?.n ?? null) : null });
  };

  const down = (e: TouchEvent) => {
    const p = e.touches[0];
    start.current = { x: p.clientX, y: p.clientY };
  };
  const up = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    const p = e.changedTouches[0];
    if (!s || !p) return;
    const dx = p.clientX - s.x;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(p.clientY - s.y) * 1.5) goSeries(dx < 0 ? 1 : -1);
  };

  return (
    <nav className="shot-nav" aria-label={t.shotNav}>
      <div className="shot-nav__series">
        <button type="button" className="button--quiet" onClick={() => goSeries(-1)} disabled={index === 0} aria-label={t.prevSeries}>‹</button>
        <strong aria-live="polite">{t.seriesLabel(series.idx)}</strong>
        <button type="button" className="button--quiet" onClick={() => goSeries(1)} disabled={index >= view.series.length - 1} aria-label={t.nextSeries}>›</button>
      </div>
      <ol className="shot-nav__shots" onTouchStart={down} onTouchEnd={up}>
        {series.shots.map((sh) => (
          <li key={sh.n}>
            <button
              type="button"
              className="shot-nav__shot"
              data-band={sh.band}
              aria-pressed={sh.n === selection.shot}
              aria-label={t.shotNavShot(sh.idx, sh.value.toFixed(view.decimal ? 1 : 0))}
              onClick={() => onSelect({ series: series.idx, shot: sh.n })}
            >
              <small>{sh.idx}</small>
              <span className="num">{sh.value.toFixed(view.decimal ? 1 : 0)}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
