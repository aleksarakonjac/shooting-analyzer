'use client';
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
}: {
  /** SCATT analysis by SCATT shot id: adds aiming time, hold in the 10 and aim speed columns. */
  scatt?: Map<number, ShotAnalysis>;
  /** Every series open into its shots (otherwise only the selected one). */
  expanded?: boolean;
  /** Heart-rate samples, when the training has them: adds a "Puls" column to the shots. */
  hr?: HrSample[];
  view: ReportView;
  selection: Selection;
  onSelect: (s: Selection) => void;
  tz: string;
}) {
  const clock = new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmt = (v: number) => v.toFixed(view.decimal ? 1 : 0);
  const hrBpm = (tMs: number | null) => {
    const b = tMs !== null && hr ? hrAt(hr, tMs) : null;
    return b === null ? '—' : Math.round(b);
  };
  if (view.series.length === 0) return <p className="panel__empty">{t.noMatch}</p>;
  // Running match total after each series: the finals-scoreboard figure.
  const cumulative = view.series.reduce<number[]>((acc, s) => [...acc, Math.round(((acc.at(-1) ?? 0) + s.total) * 10) / 10], []);
  return (
    <div className="board-wrap">
      <ol className="board" aria-label={t.series}>
      {view.series.map((s, i) => {
        const current = selection.series === s.idx;
        const open = expanded || current;
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
              <table className="shots">
                <caption className="sr-only">{t.seriesLabel(s.idx)}</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th><th scope="col">Pogodak</th><th scope="col">Vreme</th>{hr?.length ? <th scope="col">Puls</th> : null}
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
                      <td className="num">
                        <i className="pip" data-band={sh.band} aria-hidden="true" /> {fmt(sh.value)}
                        {sh.inner && <span className="shots__inner" title="Unutrašnja desetka">*</span>}
                      </td>
                      <td className="num">{sh.tMs !== null ? clock.format(sh.tMs) : '—'}</td>
                      {hr?.length ? <td className="num">{hrBpm(sh.tMs)}</td> : null}
                      {scatt && <ScattCells a={sh.scattId !== null ? scatt.get(sh.scattId) : undefined} />}
                    </tr>
                  ))}
                </tbody>
              </table>
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
