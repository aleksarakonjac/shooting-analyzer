'use client';
import { useEffect, useRef, type UIEvent } from 'react';
import { sr } from '@/lib/i18n/sr';
import type { HrSample } from '@/lib/parsers/tcx';
import type { Selection } from '@/lib/report/charts';
import { hrAt } from '@/lib/report/hrAt';
import type { ReportView } from '@/lib/report/viewModel';
import type { ShotAnalysis } from '@/lib/scatt/analysis';

const t = sr.report;

/**
 * The match as a finals leaderboard: one row per series with its pips and total.
 * The selected series is the white broadcast bar and opens into its shots.
 */
export function SeriesBoard({
  view,
  selection,
  onSelect,
  tz,
  hr,
  scatt,
  expanded = true,
  folded = false,
}: {
  /** SCATT analysis by SCATT shot id: adds aiming time, hold in the 10 and aim speed columns. */
  scatt?: Map<number, ShotAnalysis>;
  /** Every series open into its shots (otherwise only the selected one). */
  expanded?: boolean;
  /** Every series closed to its row, the selected one too (the selection itself is untouched). */
  folded?: boolean;
  /** Heart-rate samples, when the training has them: adds a "Puls" column to the shots. */
  hr?: HrSample[];
  view: ReportView;
  selection: Selection;
  onSelect: (s: Selection) => void;
  tz: string;
}) {
  const clock = new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  // Time since the previous timed shot: the gap says something, the clock time alone does not.
  // The first shot of a series follows the break, so it shows the break in muted type; the first of the match has no gap. Whole seconds, minutes and seconds from a minute on, units in small type.
  const gaps = new Map<number, { s: number; afterBreak: boolean }>();
  {
    let prev: { tMs: number; series: number } | null = null;
    for (const se of view.series) {
      for (const sh of se.shots) {
        if (sh.tMs === null) continue;
        if (prev) gaps.set(sh.n, { s: (sh.tMs - prev.tMs) / 1000, afterBreak: prev.series !== se.idx });
        prev = { tMs: sh.tMs, series: se.idx };
      }
    }
  }
  const fmt = (v: number) => v.toFixed(view.decimal ? 1 : 0);
  const hrBpm = (tMs: number | null) => {
    const b = tMs !== null && hr ? hrAt(hr, tMs) : null;
    return b === null ? '—' : Math.round(b);
  };
  const box = useRef<HTMLDivElement>(null);
  // The open series tables share one horizontal position, so the columns line up whichever one is swiped.
  const syncing = useRef(false);
  const syncScroll = (e: UIEvent<HTMLElement>) => {
    const from = e.target as HTMLElement;
    if (syncing.current || !from.classList.contains('board__scroll')) return;
    syncing.current = true;
    box.current?.querySelectorAll<HTMLElement>('.board__scroll').forEach((el) => {
      if (el !== from && Math.abs(el.scrollLeft - from.scrollLeft) > 1) el.scrollLeft = from.scrollLeft;
    });
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };
  // Keep the selected shot in view when it is changed from the keyboard.
  useEffect(() => {
    box.current?.querySelector('tr[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selection.shot]);
  if (view.series.length === 0) return <p className="panel__empty">{t.noMatch}</p>;
  // Running match total after each series: the finals-scoreboard figure.
  const cumulative = view.series.reduce<number[]>((acc, s) => [...acc, Math.round(((acc.at(-1) ?? 0) + s.total) * 10) / 10], []);
  return (
    <div className="board-wrap" ref={box} data-folded={folded || undefined}>
      <ol className="board" aria-label={t.series} onScrollCapture={syncScroll}>
      {view.series.map((s, i) => {
        const current = selection.series === s.idx;
        const open = !folded && (expanded || current);
        const prev = i > 0 ? view.series[i - 1].position : null;
        const posHead = s.position && s.position !== prev ? sr.newTraining.positionGroup[s.position] : null;
        return (
          <li key={s.id} className="board__item" data-testid="series">
            {posHead && <div className="board__pos">{posHead}</div>}
            <button
              type="button"
              className="board__row"
              aria-expanded={open}
                            aria-current={current ? 'true' : undefined}
              onClick={() => onSelect({ series: current ? null : s.idx, shot: null })}
            >
                            <span className="board__name">{t.seriesLabel(s.idx)}</span>
              <span className="board__group num">{s.groupMm !== null ? `${s.groupMm.toFixed(1)} mm` : ''}</span>
              <span className="board__totals">
                <strong className="board__total num">{fmt(s.total)}</strong>
                <small className="board__cum num" title={t.cumulative}>Σ {fmt(cumulative[i])}</small>
              </span>
            </button>
            {open && (
              <div className="board__scroll">
              <table className="shots">
                <caption className="sr-only">{t.seriesLabel(s.idx)}</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th><th scope="col" title="Pogodak" className="shots__shot-head"><TargetIcon /><span className="sr-only">Pogodak</span></th><th scope="col" title="Vreme od prethodnog pogotka (s)">Δt</th>{hr?.length ? <th scope="col">Puls</th> : null}
                    {scatt && (
                      <>
                        <th scope="col" title={t.scattAimTitle}>{t.scattAim}</th>
                        <th scope="col" title={t.scattHoldTitle}>{t.scattHold}</th>
                        <th scope="col" title={t.scattSpeed1Title}>{t.scattSpeed1}</th>
                        <th scope="col" title={t.scattSpeed250Title}>{t.scattSpeed250}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {s.shots.map((sh) => (
                    <tr
                      key={sh.n}
                      aria-selected={selection.shot === sh.n}
                      onClick={() => onSelect({ series: s.idx, shot: selection.shot === sh.n ? null : sh.n })}
                    >
                      <td className="num">{sh.n}</td>
                      <td className="num shots__value">
                        <i className="pip" data-band={sh.band} aria-hidden="true" /> {fmt(sh.value)}
                        {sh.inner && <span className="shots__inner" title="Unutrašnja desetka">*</span>}
                      </td>
                      <td className={gaps.get(sh.n)?.afterBreak ? 'num shots__break' : 'num'} title={sh.tMs !== null ? clock.format(sh.tMs) : undefined}>
                        {gaps.has(sh.n) ? <Gap seconds={gaps.get(sh.n)!.s} /> : '—'}
                      </td>
                      {hr?.length ? <td className="num">{hrBpm(sh.tMs) === '—' ? '—' : <><Heart />{hrBpm(sh.tMs)}</>}</td> : null}
                      {scatt && <ScattCells a={sh.scattId !== null ? scatt.get(sh.scattId) : undefined} />}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </li>
        );
      })}
      </ol>
    </div>
  );
}

/** The SCATT figures of one shot, or dashes when it has no trace. */
function ScattCells({ a }: { a: ShotAnalysis | undefined }) {
  const m = a?.metrics;
  return (
    <>
      <td className="num">{a ? (a.aimingMs / 1000).toFixed(1) : '—'}</td>
      <td className="num">{m ? `${m.hold10Abs}%` : '—'}</td>
      <td className="num">{m ? m.speed.toFixed(1) : '—'}</td>
      <td className="num">{m ? m.speed250.toFixed(1) : '—'}</td>
    </>
  );
}

/** A gap in whole seconds; from a minute on, minutes and seconds. The units are small and quiet. */
function Gap({ seconds }: { seconds: number }) {
  const whole = Math.round(seconds);
  const unit = (u: string) => <small className="shots__unit"> {u}</small>;
  if (whole < 60) return <>{whole}{unit('s')}</>;
  return <>{Math.floor(whole / 60)}:{String(whole % 60).padStart(2, '0')}</>;
}

/** A small heart before a pulse value: drawn, in the text colour, no emoji. */
function Heart() {
  return (
    <svg className="shots__heart" viewBox="0 0 16 16" width="9" height="9" aria-hidden="true" fill="currentColor">
      <path d="M8 14.2 2.1 8.4A3.7 3.7 0 0 1 7.3 3.1L8 3.8l.7-.7a3.7 3.7 0 0 1 5.2 5.3L8 14.2z" />
    </svg>
  );
}

/** A small target (rings and a centre dot) for the shot column header: drawn, in the text colour. */
function TargetIcon() {
  return (
    <svg className="shots__icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
