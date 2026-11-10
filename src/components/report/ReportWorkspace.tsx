'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { coordinationOption, rhythmOption, type TracePick, scattMetricOption, shotSpeedOption, timelineOption, type Selection } from '@/lib/report/charts';
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
import { TargetNotes, TargetPlot, type ShotHole } from './TargetPlot';
import { useReplay, useReplays, useScattAnalysis } from './useScattAnalysis';
import { ScopeBar } from './ScopeBar';
import { TraceViewer } from './TraceViewer';
import { ReplaySettingsProvider, useReplaySettings } from './replaySettings';
import { scattTargetFor } from '@/lib/scatt/targets';
import { targetSpec } from '@/lib/report/target';

const t = sr.report;

/** The training report: every panel follows one selection (series, shot). */
export function ReportWorkspace({ replayPrefs, ...props }: ReportProps) {
  return (
    <ReplaySettingsProvider initial={replayPrefs} persist>
      <ReportBoard {...props} />
    </ReplaySettingsProvider>
  );
}

interface ReportProps {
  trainingId: string;
  /** Stored SCATT file: its aim traces give shot positions and per-shot metrics. */
  scattPath?: string | null;
  canEdit?: boolean;
  /** The viewer's saved replay settings (account metadata). */
  replayPrefs?: unknown;
  strip: ReactNode;
  view: ReportView;
  discipline: DisciplineId;
  tz: string;
  hr: { tcxPath: string | null; offsetMs: number; zone: string | null; window: { fromMs: number; toMs: number } | null };
}

function ReportBoard({
  strip,
  view,
  discipline,
  tz,
  hr,
  scattPath = null,
  trainingId,
  canEdit = false,
}: Omit<ReportProps, 'replayPrefs'>) {
  const [sel, setSel] = useState<Selection>({ series: view.series[0]?.idx ?? null, shot: null });
  const group = 'report-time';
  const [allShots, setAllShots] = useState(true);
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
  const [chart, setChart] = useState<'score' | 'rhythm'>('score');
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
  // The selected shot's aim trace, when the SCATT file has one.
  const selShot = series?.shots.find((sh) => sh.n === sel.shot) ?? null;
  const selScattId = selShot?.scattId ?? null;
  const selScattA = selScattId !== null ? byShot?.get(selScattId) : undefined;
  const replay = useReplay(scatt, selScattId);
  // The shot after the selected one (autoplay), through the series in order; none after the last.
  const nextShot = useMemo(() => {
    if (!selShot) return null;
    const flat = view.series.flatMap((s) => s.shots.map((sh) => ({ series: s.idx, shot: sh.n })));
    const i = flat.findIndex((x) => x.shot === selShot.n);
    return i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
  }, [view, selShot]);
  const replaySettings = useReplaySettings();
  const before = replaySettings?.before ?? '5';
  const after = replaySettings?.after ?? '1';
  // SCATT's analysis charts: the selected shot over its aiming, and per shot for the series or the match (dots and an average).
  const scattTarget = useMemo(() => scattTargetFor(discipline), [discipline]);
  type Scope = 'shot' | 'series' | 'match';
  const [coordScope, setCoordScope] = useState<Scope>('shot');
  const [speedScope, setSpeedScope] = useState<Scope>('shot');
  const [aimScope, setAimScope] = useState<'series' | 'match'>('series');
  const [speedDotsScope, setSpeedDotsScope] = useState<'series' | 'match'>('series');
  const flatShots = useMemo(() => view.series.flatMap((s) => s.shots.map((sh) => ({ series: s.idx, shot: sh.n }))), [view]);
  const stepShot = (d: number) => {
    const i = selShot ? flatShots.findIndex((x) => x.shot === selShot.n) : d > 0 ? -1 : flatShots.length;
    const to = flatShots[i + d];
    return to ? () => setSel(to) : undefined;
  };
  const stepSeries = (d: number) => {
    const i = view.series.findIndex((x) => x.idx === sel.series);
    const to = view.series[(i < 0 ? (d > 0 ? -1 : view.series.length) : i) + d];
    return to ? () => setSel({ series: to.idx, shot: null }) : undefined;
  };
  // Shots a scope covers; one decode of every needed trace serves both over-time charts.
  const shotsOf = (scope: Scope) =>
    scope === 'match' ? view.series.flatMap((s) => s.shots) : scope === 'series' ? (series?.shots ?? []) : selShot ? [selShot] : [];
  const widest: Scope = coordScope === 'match' || speedScope === 'match' ? 'match' : coordScope === 'series' || speedScope === 'series' ? 'series' : 'shot';
  const replays = useReplays(scatt, shotsOf(widest).flatMap((sh) => (sh.scattId !== null ? [sh.scattId] : [])));
  const picksFor = (scope: Scope): TracePick[] =>
    shotsOf(scope).flatMap((sh) => {
      const r = sh.scattId !== null ? replays.get(sh.scattId) : undefined;
      return r ? [{ r, n: sh.n, selected: sh.n === sel.shot }] : [];
    });
  const coordChart = useMemo(() => {
    const picks = picksFor(coordScope);
    return picks.length ? coordinationOption(picks, scattTarget, Number(before), Number(after)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays, coordScope, sel, scattTarget, before, after]);
  const speedChart = useMemo(() => {
    const picks = picksFor(speedScope);
    return picks.length ? shotSpeedOption(picks, Number(before), Number(after)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays, speedScope, sel, before, after]);
  const dotSel = (scope: 'series' | 'match') => (scope === 'match' ? { ...sel, series: null } : sel);
  const aimingDots = useMemo(() => (byShot ? scattMetricOption(view, byShot, 'aiming', dotSel(aimScope)) : null), [byShot, view, sel, aimScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const speedDots = useMemo(() => (byShot ? scattMetricOption(view, byShot, 'speed250', dotSel(speedDotsScope)) : null), [byShot, view, sel, speedDotsScope]); // eslint-disable-line react-hooks/exhaustive-deps
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
      actions: view.series.length ? (
        <button type="button" className="button--quiet panel__tool" onClick={() => setAllShots((a) => !a)} aria-pressed={allShots}>
          {allShots ? t.collapseAll : t.expandAll}
        </button>
      ) : undefined,
      children: <SeriesBoard expanded={allShots} view={view} selection={sel} onSelect={setSel} tz={tz} hr={samples} scatt={byShot ?? undefined} />,
    },
    {
      id: 'target',
      headless: true,
      flush: true,
      title: replay && selShot ? t.traceTitle(selShot.n) : t.target,
      range: series ? t.seriesLabel(series.idx) : undefined,
      col: '5 / 9',
      row: '1 / 7',
      children: replay && selShot ? (
        <TraceViewer
          replay={replay}
          spec={targetSpec(discipline)}
          target={scattTargetFor(discipline)}
          shotN={selShot.n}
          score={selShot.value.toFixed(view.decimal ? 1 : 0)}
          stats={selScattA ? { speed250: selScattA.metrics?.speed250 ?? null, aimingS: selScattA.aimingMs / 1000, hold10: selScattA.metrics?.hold10Abs ?? null, speed1: selScattA.metrics?.speed ?? null } : undefined}
          onNext={nextShot ? () => setSel(nextShot) : undefined}
          onBack={() => setSel({ series: sel.series, shot: null })}
        />
      ) : view.series.length ? <TargetPlot discipline={discipline} series={view.series} selected={sel.series} holes={holes} caliberMm={scatt.status === 'ready' ? scatt.caliberMm : undefined} onPickShot={(n) => setSel({ series: sel.series, shot: n })} /> : <p className="panel__empty">{t.noMatch}</p>,
    },
    {
      id: 'notes',
      title: t.analysis,
      range: series ? t.seriesLabel(series.idx) : undefined,
      col: '9 / 13',
      row: '1 / 3',
      children: view.series.length ? <TargetNotes series={view.series} selected={sel.series} /> : <p className="panel__empty">{t.noMatch}</p>,
    },
    {
      id: 'time',
      title: t.timeline,
      range: span,
      col: '9 / 13',
      row: '3 / 5',
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
      col: '9 / 13',
      row: '5 / 7',
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

  // The right column is one scrolling stack: numbers of the target, the timeline and the heart rate.
  const [seriesP, targetP, notesP, timeP, hrP] = panels;
  const chartCard = (title: string, body: ReactNode, key: string, bar?: ReactNode) => (
    <section key={key} className="analysis__sec">
      <h3 className="analysis__title">{title}</h3>
      {bar}
      <div className="chart-card">{body}</div>
    </section>
  );
  const chartEl = (key: string, option: unknown, label: string) => <EChart key={key} option={option} label={label} onPick={(d) => d?.n && setSel({ series: d.series, shot: d.n })} />;
  const none = (text: string) => <p className="panel__empty">{text}</p>;
  const seriesName = series ? t.seriesLabel(series.idx) : t.pickSeriesShort;
  const scopeLabel = (scope: Scope) => (scope === 'shot' ? (selShot ? `${t.traceShot} ${selShot.n}` : t.pickShot) : scope === 'series' ? seriesName : t.wholeMatch);
  const scopeOptions: { id: Scope; label: string }[] = [
    { id: 'shot', label: t.scopeShot },
    { id: 'series', label: t.scopeSeries },
    { id: 'match', label: t.scopeMatch },
  ];
  const dotScopes: { id: 'series' | 'match'; label: string }[] = [
    { id: 'series', label: t.scopeSeries },
    { id: 'match', label: t.scopeMatch },
  ];
  const scopedBar = <S extends Scope | 'series' | 'match'>(scope: S, set: (s: S) => void, options: { id: S; label: string }[], label: string) => (
    <ScopeBar
      label={label}
      scope={scope}
      scopes={options}
      onScope={set}
      current={scopeLabel(scope as Scope)}
      onPrev={scope === 'shot' ? stepShot(-1) : scope === 'series' ? stepSeries(-1) : undefined}
      onNext={scope === 'shot' ? stepShot(1) : scope === 'series' ? stepSeries(1) : undefined}
    />
  );
  const section = (p: WorkspacePanel) => (
    <section key={p.id} className="analysis__sec">
      <h3 className="analysis__title">{p.title}{p.range && <span className="panel__range">{p.range}</span>}</h3>
      {p.children}
    </section>
  );
  const analysisP: WorkspacePanel = {
    id: 'analysis',
    title: t.analysis,
    range: notesP.range,
    col: '9 / 13',
    row: '1 / 7',
    children: (
      <div className="analysis">
        {selShot && replay && (
          <section className="analysis__sec" aria-labelledby="analysis-shot">
            <h3 id="analysis-shot" className="analysis__title">{t.traceShot} {selShot.n}<span className="panel__range num">{selShot.value.toFixed(view.decimal ? 1 : 0)}</span></h3>
            <dl className="shotfacts">
              <div><dt>{t.traceHold}</dt><dd className="num">Ø {(2 * replay.hold.r).toFixed(1)} mm</dd></div>
              {selScattA?.metrics && (
                <>
                  <div><dt title={t.scattHoldTitle}>{t.scattHoldLabel}</dt><dd className="num">{selScattA.metrics.hold10Abs}%</dd></div>
                  <div><dt title={t.scattSpeed1Title}>{t.scattSpeed1}</dt><dd className="num">{selScattA.metrics.speed.toFixed(1)}</dd></div>
                </>
              )}
            </dl>
          </section>
        )}
        <section className="analysis__sec">{notesP.children}</section>
        {section(timeP)}
        {byShot && chartCard(t.chartCoordination, coordChart ? chartEl(`coord-${coordScope}`, coordChart, t.chartCoordination) : none(coordScope === 'shot' ? t.pickShot : t.scattNone), 'coordination', scopedBar(coordScope, setCoordScope, scopeOptions, t.chartCoordination))}
        {byShot && chartCard(t.chartSpeed, speedChart ? chartEl(`speed-${speedScope}`, speedChart, t.chartSpeed) : none(speedScope === 'shot' ? t.pickShot : t.scattNone), 'speed-shot', scopedBar(speedScope, setSpeedScope, scopeOptions, t.chartSpeed))}
        {aimingDots && chartCard(t.chartAimingTime, chartEl(`aim-${aimScope}`, aimingDots, t.chartAimingTime), 'aiming', scopedBar(aimScope, setAimScope, dotScopes, t.chartAimingTime))}
        {speedDots && chartCard(`${t.chartSpeed} · ${t.perShot}`, chartEl(`dots-${speedDotsScope}`, speedDots, t.chartSpeed), 'speed-dots', scopedBar(speedDotsScope, setSpeedDotsScope, dotScopes, t.chartSpeed))}
        {section(hrP)}
      </div>
    ),
  };

  return <Workspace label={t.panels} strip={strip} panels={[seriesP, targetP, analysisP]} rows={6} resizable={{ id: 'report', widths: [4, 5, 3], minPx: [300, 220, 240] }} />;
}
