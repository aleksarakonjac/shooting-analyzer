'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { timelineOption, type Selection } from '@/lib/report/charts';
import type { ReportView } from '@/lib/report/viewModel';
import { Workspace, type WorkspacePanel } from '@/components/Workspace';
import { EChart } from './EChart';
import { HrPanel } from './HrPanel';
import { useHrSamples } from './useHrSamples';
import { SeriesBoard } from './SeriesBoard';
import { TargetPlot } from './TargetPlot';

const t = sr.report;

/** The training report: every panel follows one selection (series, shot). */
export function ReportWorkspace({
  strip,
  view,
  discipline,
  tz,
  hr,
  finals,
  other,
}: {
  strip: ReactNode;
  view: ReportView;
  discipline: DisciplineId;
  tz: string;
  hr: { tcxPath: string | null; offsetMs: number; window: { fromMs: number; toMs: number } | null };
  /** Server-rendered finals panel content, or null when the discipline has no finals. */
  finals: ReactNode | null;
  other: ReactNode;
}) {
  const [sel, setSel] = useState<Selection>({ series: view.series[0]?.idx ?? null, shot: null });
  const group = 'report-time';
  const hrState = useHrSamples(hr.tcxPath, hr.offsetMs, hr.window);
  const samples = hrState.status === 'ready' ? hrState.samples : undefined;
  const timeline = useMemo(() => (view.timedShots ? timelineOption(view, sel, tz, samples) : null), [view, sel, tz, samples]);
  const series = view.series.find((s) => s.idx === sel.series);
  const fmtClock = (ms: number) => new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  const times = view.series.flatMap((s) => s.shots).map((s) => s.tMs).filter((x): x is number => x !== null);
  const span = times.length ? `${fmtClock(Math.min(...times))}–${fmtClock(Math.max(...times))}` : undefined;

  const panels: WorkspacePanel[] = [
    {
      id: 'series',
      title: t.series,
      range: series ? `${t.seriesLabel(series.idx)} · pogoci ${series.firstShot}–${series.lastShot}` : `${view.series.length} serija · ${view.shotCount} pogodaka`,
      col: '1 / 5',
      row: finals ? '1 / 6' : '1 / 7',
      flush: true,
      children: <SeriesBoard view={view} selection={sel} onSelect={setSel} tz={tz} hr={samples} />,
    },
    {
      id: 'target',
      title: t.target,
      range: series ? t.seriesLabel(series.idx) : undefined,
      col: '5 / 9',
      row: '1 / 4',
      children: view.series.length ? <TargetPlot discipline={discipline} series={view.series} selected={sel.series} /> : <p className="panel__empty">{t.noMatch}</p>,
    },
    {
      id: 'time',
      title: t.timeline,
      range: span,
      col: '9 / 13',
      row: '1 / 4',
      children: timeline ? (
        <div className="chart-panel">
          <p className="chart-panel__legend">
            <span><i className="pip" data-band="top" aria-hidden="true" /> {view.decimal ? '10.5+' : '10'}</span>
            <span><i className="pip" data-band="ten" aria-hidden="true" /> {view.decimal ? '10.0–10.4' : '9'}</span>
            <span><i className="pip" data-band="nine" aria-hidden="true" /> {view.decimal ? '9.x' : '8'}</span>
            <span><i className="pip" data-band="low" aria-hidden="true" /> {view.decimal ? '< 9' : '< 8'}</span>
            {samples?.length ? <span><i className="key key--hr" aria-hidden="true" /> {t.hr} ({t.hrRolling})</span> : null}
            <span className="chart-panel__stat">{view.timedShots} / {view.shotCount} sa vremenom</span>
          </p>
          <EChart
            option={timeline}
            group={group}
            label={`${t.timeline}: ${view.timedShots} pogodaka`}
            onPick={(d) => d?.n && setSel({ series: d.series, shot: d.n })}
          />
        </div>
      ) : (
        <p className="panel__empty">{t.noShotTimes}</p>
      ),
    },
    {
      id: 'hr',
      title: t.hr,
      col: finals ? '5 / 9' : '5 / 10',
      row: '4 / 7',
      children: <HrPanel hr={hrState} hasFile={hr.tcxPath !== null} view={view} selection={sel} onSelect={setSel} tz={tz} group={group} />,
    },
    finals
      ? { id: 'finals', title: sr.finals.title, col: '9 / 13', row: '4 / 7', children: finals }
      : { id: 'other', title: t.other, col: '10 / 13', row: '4 / 7', children: other },
  ];
  if (finals) panels.push({ id: 'other', title: t.other, col: '1 / 5', row: '6 / 7', children: other });

  return <Workspace label={t.panels} strip={strip} panels={panels} rows={6} />;
}
