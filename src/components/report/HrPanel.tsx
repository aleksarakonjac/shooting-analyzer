'use client';
import { useMemo } from 'react';
import { hrOption, type Selection } from '@/lib/report/charts';
import { hrStats } from '@/lib/report/derive';
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
  return (
    <div className="chart-panel">
      <p className="chart-panel__legend">
        <span><i className="key key--raw" aria-hidden="true" /> {t.hr}</span>
        <span><i className="key key--line" aria-hidden="true" /> {t.hrRolling}</span>
        <span><i className="pip" data-band="top" aria-hidden="true" /> {t.hrShots}</span>
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
