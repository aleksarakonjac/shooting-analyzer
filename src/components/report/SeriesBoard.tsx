'use client';
import { sr } from '@/lib/i18n/sr';
import type { HrSample } from '@/lib/parsers/tcx';
import type { Selection } from '@/lib/report/charts';
import { hrAt } from '@/lib/report/hrAt';
import type { ReportView } from '@/lib/report/viewModel';

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
}: {
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
  return (
    <ol className="board" aria-label={t.series}>
      {view.series.map((s, i) => {
        const open = selection.series === s.idx;
        const prev = i > 0 ? view.series[i - 1].position : null;
        const posHead = s.position && s.position !== prev ? sr.newTraining.positionGroup[s.position] : null;
        return (
          <li key={s.id} className="board__item" data-testid="series">
            {posHead && <div className="board__pos">{posHead}</div>}
            <button
              type="button"
              className="board__row"
              aria-expanded={open}
              aria-current={open ? 'true' : undefined}
              onClick={() => onSelect({ series: open ? null : s.idx, shot: null })}
            >
              <span className="board__idx num">{s.idx}</span>
              <span className="board__pips" aria-hidden="true">
                {s.shots.map((sh) => (
                  <i key={sh.n} className="pip" data-band={sh.band} data-inner={sh.inner || undefined} />
                ))}
              </span>
              <span className="board__group num">{s.groupMm !== null ? `${s.groupMm.toFixed(1)} mm` : ''}</span>
              <strong className="board__total num">{fmt(s.total)}</strong>
            </button>
            {open && (
              <table className="shots">
                <caption className="sr-only">{t.seriesLabel(s.idx)}</caption>
                <thead>
                  <tr><th scope="col">#</th><th scope="col">Pogodak</th><th scope="col">Vreme</th>{hr?.length ? <th scope="col">Puls</th> : null}</tr>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        );
      })}
    </ol>
  );
}
