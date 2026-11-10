'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { rhythmOption, scattMetricOption, timelineOption, type ScattMetric, type Selection } from '@/lib/report/charts';
import { shotRhythm } from '@/lib/report/rhythm';
import { bandLegend } from '@/lib/report/target';
import { Segmented } from '@/components/ui/Segmented';
import type { ReportView } from '@/lib/report/viewModel';
import { Workspace, type WorkspacePanel } from '@/components/Workspace';
import { EChart } from './EChart';
import { HrPanel } from './HrPanel';
import { HrAlign } from './HrAlign';
import { hrAvgOverShots } from '@/lib/report/derive';
import { useHrSamples } from './useHrSamples';
import { SeriesBoard } from './SeriesBoard';
import { TargetPlot, type ShotHole } from './TargetPlot';
import { useScattAnalysis } from './useScattAnalysis';

const t = sr.report;

/** The training report: every panel follows one selection (series, shot). */
export function ReportWorkspace({
  strip,
  view,
  discipline,
  tz,
  hr,
  scattPath = null,
  trainingId,
  canEdit = false,
}: {
  trainingId: string;
  /** Stored SCATT file: its aim traces give shot positions and per-shot metrics. */
  scattPath?: string | null;
  canEdit?: boolean;
  strip: ReactNode;
  view: ReportView;
  discipline: DisciplineId;
  tz: string;
  hr: { tcxPath: string | null; offsetMs: number; zone: string | null; window: { fromMs: number; toMs: number } | null };
}) {
  const [sel, setSel] = useState<Selection>({ series: view.series[0]?.idx ?? null, shot: null });
  const group = 'report-time';
  // Offset and zone are previewed live; the stored values change only on save.
  const [hrOffsetS, setHrOffsetS] = useState(Math.round(hr.offsetMs / 1000));
  const [hrZone, setHrZone] = useState(hr.zone ?? '');
  const zoneValid = useMemo(() => {
    if (!hrZone) return true;
    try {
      new Intl.DateTimeFormat('en', { timeZone: hrZone });
      return true;
    } catch {
      return false;
    }
  }, [hrZone]);
  const hrState = useHrSamples(hr.tcxPath, hrOffsetS * 1000, hr.window, zoneValid ? hrZone || null : hr.zone);
  const samples = hrState.status === 'ready' ? hrState.samples : undefined;
  const pipLegend = bandLegend(view.decimal, view.pipTop);
  const scatt = useScattAnalysis(scattPath, discipline);
  const byShot = scatt.status === 'ready' ? scatt.byShot : null;
  const [chart, setChart] = useState<'score' | 'rhythm' | ScattMetric>('score');
  const metricChart = useMemo(
    () => (byShot && chart !== 'score' && chart !== 'rhythm' ? scattMetricOption(view, byShot, chart, sel) : null),
    [byShot, chart, view, sel],
  );
  const timeline = useMemo(() => (view.timedShots ? timelineOption(view, sel, tz, samples) : null), [view, sel, tz, samples]);
  const rhythm = useMemo(() => shotRhythm(view), [view]);
  const rhythmChart = useMemo(() => (rhythm.points.length ? rhythmOption(rhythm, sel) : null), [rhythm, sel]);
  const series = view.series.find((s) => s.idx === sel.series);
  // Positions of the selected series' shots from the SCATT traces, the selected shot drawn last (on top).
  const holes: ShotHole[] = (series?.shots ?? [])
    .map((sh) => {
      const a = sh.scattId !== null ? byShot?.get(sh.scattId) : undefined;
      return a && !a.missed ? { n: sh.n, x: a.x, y: a.y, selected: sh.n === sel.shot } : null;
    })
    .filter((h): h is ShotHole => h !== null)
    .sort((a, b) => Number(a.selected) - Number(b.selected));
  const fmtClock = (ms: number) => new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  const times = view.series.flatMap((s) => s.shots).map((s) => s.tMs).filter((x): x is number => x !== null);
  const span = times.length ? `${fmtClock(Math.min(...times))}–${fmtClock(Math.max(...times))}` : undefined;

  const panels: WorkspacePanel[] = [
    {
      id: 'series',
      title: t.series,
      range: series ? `${t.seriesLabel(series.idx)} · pogoci ${series.firstShot}–${series.lastShot}` : `${view.series.length} serija · ${view.shotCount} pogodaka`,
      col: '1 / 5',
      row: '1 / 7',
      flush: true,
      children: <SeriesBoard view={view} selection={sel} onSelect={setSel} tz={tz} hr={samples} scatt={byShot ?? undefined} />,
    },
    {
      id: 'target',
      title: t.target,
      range: series ? t.seriesLabel(series.idx) : undefined,
      col: '5 / 9',
      row: '1 / 4',
      children: view.series.length ? <TargetPlot discipline={discipline} series={view.series} selected={sel.series} holes={holes} caliberMm={scatt.status === 'ready' ? scatt.caliberMm : undefined} /> : <p className="panel__empty">{t.noMatch}</p>,
    },
    {
      id: 'time',
      title: t.timeline,
      range: span,
      col: '9 / 13',
      row: '1 / 4',
      children: timeline ? (
        <div className="chart-panel">
          <div className="chart-panel__legend">
            <Segmented
              label={t.chartPick}
              hideLabel
              full={false}
              value={chart}
              onChange={setChart}
              options={[
                { id: 'score', label: t.chartScore },
                { id: 'rhythm', label: t.chartRhythm },
                ...(byShot
                  ? [
                      { id: 'hold10Abs' as const, label: t.chartHold },
                      { id: 'speed250' as const, label: t.chartSpeed },
                    ]
                  : []),
              ]}
            />
            {chart === 'score' ? (
              <>
                {pipLegend.map((b) => (
                  <span key={b.band}><i className="pip" data-band={b.band} aria-hidden="true" /> {b.label}</span>
                ))}
                {samples?.length ? <span><i className="key key--hr" aria-hidden="true" /> {t.hr} ({t.hrRolling})</span> : null}
                <span className="chart-panel__stat">{view.timedShots} / {view.shotCount} sa vremenom</span>
              </>
            ) : chart !== 'rhythm' ? (
              <span className="chart-panel__stat">
                {t.scattStability} <strong className="num">{scatt.status === 'ready' ? scatt.stability : '—'}</strong>
              </span>
            ) : (
              <span className="chart-panel__stat">
                {rhythm.meanS !== null ? (
                  <>
                    {t.rhythmMean} <strong className="num">{rhythm.meanS.toFixed(1)} s</strong> · {t.rhythmSpread} <span className="num">± {rhythm.sdS!.toFixed(1)} s</span>
                  </>
                ) : (
                  t.rhythmNone
                )}
              </span>
            )}
          </div>
          {chart === 'score' ? (
            <EChart
              key="score"
              option={timeline}
              group={group}
              label={`${t.timeline}: ${view.timedShots} pogodaka`}
              onPick={(d) => d?.n && setSel({ series: d.series, shot: d.n })}
            />
          ) : chart !== 'rhythm' ? (
            metricChart ? (
              <EChart key={chart} option={metricChart} label={chart} onPick={(d) => d?.n && setSel({ series: d.series, shot: d.n })} />
            ) : (
              <p className="panel__empty">{t.scattNone}</p>
            )
          ) : rhythmChart ? (
            <EChart
              key="rhythm"
              option={rhythmChart}
              label={`${t.chartRhythm}: ${t.rhythmMean} ${rhythm.meanS ?? '—'} s`}
              onPick={(d) => d?.n && setSel({ series: d.series, shot: d.n })}
            />
          ) : (
            <p className="panel__empty">{t.rhythmNone}</p>
          )}
        </div>
      ) : (
        <p className="panel__empty">{t.noShotTimes}</p>
      ),
    },
    {
      id: 'hr',
      title: t.hr,
      col: '5 / 13',
      row: '4 / 7',
      children: (
        <div className="hr-wrap">
          {canEdit && hr.tcxPath !== null && (
            <HrAlign
              trainingId={trainingId}
              offsetS={hrOffsetS}
              zone={hrZone}
              avgBpm={samples ? hrAvgOverShots(samples, view.series.flatMap((s) => s.shots.map((x) => x.tMs))) : null}
              ready={hrState.status === 'ready' && zoneValid}
              fallbackTz={tz}
              onOffset={setHrOffsetS}
              onZone={setHrZone}
            />
          )}
          <HrPanel hr={hrState} hasFile={hr.tcxPath !== null} view={view} selection={sel} onSelect={setSel} tz={tz} group={group} />
        </div>
      ),
    },
  ];

  return <Workspace label={t.panels} strip={strip} panels={panels} rows={6} />;
}
