'use client';
import { useMemo } from 'react';
import { hrOption, type Selection } from '@/lib/report/charts';
import { hrStats } from '@/lib/report/derive';
import { hrAt } from '@/lib/report/hrAt';
import type { ReportView } from '@/lib/report/viewModel';
import { sr } from '@/lib/i18n/sr';
import { EChart } from './EChart';
import type { HrState } from './useHrSamples';

const t = sr.report;

/** Heart rate with every shot placed on the curve at the moment it was fired. */
export function HrPanel({
  hr,
  hasFile,
  view,
  selection,
  onSelect,
  tz,
  group,
}: {
  hr: HrState;
  hasFile: boolean;
  view: ReportView;
  selection: Selection;
  onSelect: (s: Selection) => void;
  tz: string;
  group: string;
}) {
  const samples = hr.status === 'ready' ? hr.samples : null;
  const option = useMemo(() => (samples?.length ? hrOption(samples, view, selection, tz) : null), [samples, view, selection, tz]);

  if (hr.status === 'loading') return <p role="status">{t.hrLoading}</p>;
  if (!samples?.length) {
    return (
      <div className="hr-empty">
        <p className="hr-empty__word">{t.noHr}</p>
        <p className="panel__empty">{hasFile ? t.hrOutside : t.hrNoFile}</p>
      </div>
    );
  }
  const stats = hrStats(samples)!;
  // Heart rate at the moment of each shot of the selected series: the figure the overlay cannot show at a glance.
  const sel = view.series.find((x) => x.idx === selection.series);
  const atShots = sel ? sel.shots.map((x) => (x.tMs === null ? null : hrAt(samples, x.tMs))).filter((b): b is number => b !== null) : [];
  const atAvg = atShots.length ? Math.round(atShots.reduce((a, b) => a + b, 0) / atShots.length) : null;
  return (
    <div className="chart-panel">
      <p className="chart-panel__legend">
        <span><i className="key key--raw" aria-hidden="true" /> {t.hr}</span>
        <span><i className="key key--line" aria-hidden="true" /> {t.hrRolling}</span>
        <span><i className="pip" data-band="top" aria-hidden="true" /> {t.hrShots}</span>
        {sel && atAvg !== null && (
          <span className="chart-panel__sel">
            {t.seriesLabel(sel.idx)}: {t.hrAtShots} <strong className="num">{atAvg}</strong>{' '}
            (<span className="num">{Math.min(...atShots).toFixed(0)}–{Math.max(...atShots).toFixed(0)}</span>)
          </span>
        )}
        <span className="chart-panel__stat">{t.hrAvg} <strong className="num">{stats.avg}</strong> · {t.hrMin} <span className="num">{stats.min}</span> · {t.hrMax} <span className="num">{stats.max}</span> {t.bpm}</span>
      </p>
      <EChart
        option={option}
        group={group}
        label={`${t.hr}: ${t.hrAvg} ${stats.avg} ${t.bpm}`}
        onPick={(d) => d?.n && onSelect({ series: d.series, shot: d.n })}
      />
    </div>
  );
}
