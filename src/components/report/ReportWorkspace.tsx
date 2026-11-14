'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { coordinationOption, rhythmOption, type TracePick, scattMetricOption, shotSpeedOption, timelineOption, rolling, pulseValueAt, type Selection } from '@/lib/report/charts';
import { shotRhythm } from '@/lib/report/rhythm';
import { Segmented } from '@/components/ui/Segmented';
import type { ReportView } from '@/lib/report/viewModel';
import { Workspace, type WorkspacePanel } from '@/components/Workspace';
import { EChart } from './EChart';
import { HrPanel } from './HrPanel';
import { HrAlign, HrAlignToggle } from './HrAlign';
import { hrAvgOverShots } from '@/lib/report/derive';
import { useHrSamples } from './useHrSamples';
import { SeriesBoard } from './SeriesBoard';
import { TargetNotes, TargetPlot, type ShotHole } from './TargetPlot';
import { correctHit } from '@/lib/report/hit';
import { hrAt } from '@/lib/report/hrAt';
import { ShotNav } from './ShotNav';
import { ShotsViewer, type OverviewScope, type OverviewShot } from './ShotsViewer';
import { useReplay, useReplays, useScattAnalysis } from './useScattAnalysis';
import { ScopeBar } from './ScopeBar';
import { ShotComment } from './ShotComment';
import { isTypingTarget } from './keys';
import { TraceViewer } from './TraceViewer';
import { ReplaySettingsProvider, useReplaySettings } from './replaySettings';
import { scattTargetFor } from '@/lib/scatt/targets';
import { targetSpec } from '@/lib/report/target';

import { ChevronLeft, ChevronRight } from '@/components/ui/icons';

const t = sr.report;
const TARGET_OFF_KEY = 'report-target-off';
const NO_PATHS: string[] = [];

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
  /** Stored SCATT files (one match can span several): their aim traces give shot positions and per-shot metrics. */
  scattPaths?: string[];
  canEdit?: boolean;
  /** The viewer's saved replay settings (account metadata). */
  replayPrefs?: unknown;
  /** Shots can carry a comment (the database has the column). */
  commentsEnabled?: boolean;
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
  scattPaths = NO_PATHS,
  trainingId,
  canEdit = false,
  commentsEnabled = false,
}: Omit<ReportProps, 'replayPrefs'>) {
  const [sel, setSel] = useState<Selection>({ series: view.series[0]?.idx ?? null, shot: view.series[0]?.shots[0]?.n ?? null });
  const group = 'report-time';
  const [allShots, setAllShots] = useState(true);
  // Every series folded to its row (phone button), the selected one included; picking something in the list opens it again.
  const [folded, setFolded] = useState(false);
  // Comments saved on shots during this visit, by shot id (the server copy is older until the next load).
  const [comments, setComments] = useState<Record<string, string>>({});
  // Offset and zone are previewed live; the stored values change only on save.
  const [alignOpen, setAlignOpen] = useState(false);
  // The slot in the page header (rendered by the server page) that takes the expand / collapse all button on a phone.
  const [toggleSlot, setToggleSlot] = useState<HTMLElement | null>(null);
  // Phone on its side: the target pinned on the left, or hidden so the list and charts get the full width.
  // A per-browser preference, read after mount.
  const [targetOff, setTargetOff] = useState(false);
  useEffect(() => {
    try {
      setTargetOff(localStorage.getItem(TARGET_OFF_KEY) === '1');
    } catch {
      /* storage blocked: the target shows */
    }
  }, []);
  const toggleTarget = () => {
    const next = !targetOff;
    setTargetOff(next);
    try {
      localStorage.setItem(TARGET_OFF_KEY, next ? '1' : '0');
    } catch {
      /* storage blocked: the choice lasts until the page is left */
    }
  };
  useEffect(() => {
    // The slot exists only after the page has been rendered, so it is looked up once on the client.
    setToggleSlot(document.getElementById('series-toggle-slot'));
  }, []);
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
  const scatt = useScattAnalysis(scattPaths, discipline);
  const byShot = scatt.status === 'ready' ? scatt.byShot : null;
  const [chart, setChart] = useState<'score' | 'rhythm'>('score');
  const timeline = useMemo(() => (view.timedShots ? timelineOption(view, sel, tz, samples) : null), [view, sel, tz, samples]);
  // The pulse line as the chart draws it, and where the pointer line crosses it: a dot on that point.
  const pulseLine = useMemo(() => (samples?.length ? rolling(samples, 15_000) : []), [samples]);
  const pulseDot = useMemo(
    () => (pulseLine.length ? (x: number): [number, number] | null => { const b = pulseValueAt(pulseLine, x); return b === null ? null : [x, b]; } : undefined),
    [pulseLine],
  );
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
  // Pulse at the moment of the selected shot, from the watch.
  const selHr = selShot?.tMs != null && samples ? hrAt(samples, selShot.tMs) : null;
  // The shot after the selected one (autoplay), through the series in order; none after the last.
  const nextShot = useMemo(() => {
    if (!selShot) return null;
    const flat = view.series.flatMap((s) => s.shots.map((sh) => ({ series: s.idx, shot: sh.n })));
    const i = flat.findIndex((x) => x.shot === selShot.n);
    return i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
  }, [view, selShot]);
  const replaySettings = useReplaySettings();
  const before = replaySettings?.before ?? 5;
  const after = replaySettings?.after ?? 1;
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
  // Up / Down always walk through the shot list, even with a selector (Pogodak / Serija / Meč, Rezultat / Ritam)
  // focused: they are caught first, so the selector does not move. Typing fields keep their own arrow keys.
  const walk = useRef<(d: number) => void>(() => {});
  useEffect(() => {
    walk.current = (d) => {
      const i = selShot ? flatShots.findIndex((x) => x.shot === selShot.n) : d > 0 ? -1 : flatShots.length;
      const to = flatShots[Math.max(0, Math.min(flatShots.length - 1, i + d))];
      if (to) setSel(to);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      walk.current(e.key === 'ArrowDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
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
      return r ? [{ r, n: sh.n, selected: false }] : [];
    });
  // A chart is rebuilt only when what it shows changes: the shot chart follows the selected shot, a series chart
  // follows the series, the match chart never changes with the selection.
  const scopeKey = (scope: Scope) => (scope === 'shot' ? (selShot?.n ?? 0) : scope === 'series' ? (series?.idx ?? 0) : 0);
  const coordKey = scopeKey(coordScope);
  const speedKey = scopeKey(speedScope);
  const coordChart = useMemo(() => {
    const picks = picksFor(coordScope);
    return picks.length ? coordinationOption(picks, scattTarget, Number(before), Number(after)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays, coordScope, coordKey, scattTarget, before, after]);
  const speedChart = useMemo(() => {
    const picks = picksFor(speedScope);
    return picks.length ? shotSpeedOption(picks, Number(before), Number(after)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replays, speedScope, speedKey, before, after]);
  // The dots charts show a series or the match whatever shot is selected.
  const dotSel = (scope: 'series' | 'match') => ({ series: scope === 'match' ? null : sel.series, shot: null });
  const dotSeries = sel.series;
  const aimingDots = useMemo(() => (byShot ? scattMetricOption(view, byShot, 'aiming', dotSel(aimScope)) : null), [byShot, view, dotSeries, aimScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const speedDots = useMemo(() => (byShot ? scattMetricOption(view, byShot, 'speed250', dotSel(speedDotsScope)) : null), [byShot, view, dotSeries, speedDotsScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmtClock = (ms: number) => new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  const times = view.series.flatMap((s) => s.shots).map((s) => s.tMs).filter((x): x is number => x !== null);
  const span = times.length ? `${fmtClock(Math.min(...times))}–${fmtClock(Math.max(...times))}` : undefined;

  // Every hit with a SCATT position, for the overview on the same target as the replay.
  const [overview, setOverview] = useState<OverviewScope>('series');
  const overviewShots = useMemo<OverviewShot[]>(
    () =>
      byShot
        ? view.series.flatMap((se) =>
            se.shots.flatMap((sh) => {
              const a = sh.scattId !== null ? byShot.get(sh.scattId) : undefined;
              if (!a || a.missed) return [];
              // SCATT's point set against what SIUS measured; the SCATT point itself is kept for comparison.
              const c = correctHit({ x: a.x, y: a.y }, sh.value, view.decimal, scattTarget, sh.direction);
              return [{ n: sh.n, idx: sh.idx, series: se.idx, x: c.x, y: c.y, sx: a.x, sy: a.y, movedMm: c.movedMm, confidence: c.confidence }];
            }),
          )
        : [],
    [byShot, view, scattTarget],
  );
  // Hits of the series and of the match that have no SCATT position, so cannot be drawn.
  const unplaced = {
    series: (series?.shots.length ?? 0) - overviewShots.filter((o) => o.series === sel.series).length,
    match: view.shotCount - overviewShots.length,
  };
  const overviewGroup = series?.mpi && series.groupMm ? { x: series.mpi.x, y: series.mpi.y, r: series.groupMm / 2 } : null;
  const targetBody = (
    replay && selShot ? (
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
        ) : view.series.length ? (overviewShots.length ? <ShotsViewer spec={targetSpec(discipline)} target={scattTarget} shots={overviewShots} series={sel.series} shot={sel.shot} group={overviewGroup} scope={sel.series === null ? 'match' : overview} unplaced={unplaced} onScope={setOverview} onPick={(se, n) => setSel({ series: se, shot: n })} /> : <TargetPlot discipline={discipline} series={view.series} selected={sel.series} holes={holes} caliberMm={scatt.status === 'ready' ? scatt.caliberMm : undefined} onPickShot={(n) => setSel({ series: sel.series, shot: n })} />) : <p className="panel__empty">{t.noMatch}</p>
  );
  const panels: WorkspacePanel[] = [
    {
      id: 'series',
      title: t.list,
      range: series ? `${t.seriesLabel(series.idx)} · pogoci ${series.firstShot}–${series.lastShot}` : `${view.series.length} serija · ${view.shotCount} pogodaka`,
      col: '1 / 5',
      row: '1 / 7',
      flush: true,
      actions: view.series.length ? (
        <button type="button" className="button--quiet panel__tool" onClick={() => { setFolded(false); setAllShots((a) => !a); }} aria-pressed={allShots && !folded}>
          {allShots && !folded ? t.collapseAll : t.expandAll}
        </button>
      ) : undefined,
      children: <SeriesBoard expanded={allShots} folded={folded} view={view} selection={sel} onSelect={(s) => { setFolded(false); setSel(s); }} tz={tz} hr={samples} scatt={byShot ?? undefined} />,
    },
    {
      id: 'target',
      headless: true,
      flush: true,
      title: selShot ? `${t.target} · ${selShot.n}` : t.target,
      range: series ? t.seriesLabel(series.idx) : undefined,
      col: '5 / 9',
      row: '1 / 7',
      children: (
        <div className="target-pane">
          <div className="target-pane__main">{targetBody}</div>
          {view.series.length > 0 && <ShotNav view={view} selection={sel} onSelect={setSel} />}
        </div>
      ),
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
                {/* The pulse key over the count of timed shots, beside the chart switch in the same row. */}
                <div className="chart-panel__meta">
                  {samples?.length ? <span><i className="key key--hr" aria-hidden="true" /> {t.hr} ({t.hrRolling})</span> : null}
                  <span className="chart-panel__stat">{view.timedShots} / {view.shotCount} sa vremenom</span>
                </div>
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
              pinTooltip
              cursorDot={pulseDot}
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
      // Three dots beside the title open the alignment form.
      actions: canEdit && hr.tcxPath !== null ? <HrAlignToggle open={alignOpen} onToggle={() => setAlignOpen((o) => !o)} /> : undefined,
      col: '9 / 13',
      row: '5 / 7',
      children: (
        <div className="hr-wrap">
          {canEdit && hr.tcxPath !== null && alignOpen && (
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
      <h3 className="analysis__title">{p.title}{p.range && <span className="panel__range">{p.range}</span>}{p.id === 'hr' && p.actions}</h3>
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
        {selShot && (
          <section className="analysis__sec" aria-labelledby="analysis-shot">
            <h3 id="analysis-shot" className="analysis__title analysis__title--shot">
              {t.traceShot} {selShot.n}<span className="panel__range num">{selShot.value.toFixed(view.decimal ? 1 : 0)}</span>
              {selShot.id && commentsEnabled && (
                <span className="analysis__tools">
                  <ShotComment key={selShot.id} shotId={selShot.id} shotN={selShot.n} saved={comments[selShot.id] ?? selShot.comment} canEdit={canEdit} onSaved={(text) => setComments((c) => ({ ...c, [selShot.id!]: text }))} />
                </span>
              )}
            </h3>
            {(replay || selHr !== null) && (
              <dl className="facts">
                {selHr !== null && <Fact label={t.hr} value={String(Math.round(selHr))} />}
                {replay && <Fact label={t.traceHold} value={(2 * replay.hold.r).toFixed(1)} unit="mm" />}
                {replay && selScattA?.metrics && (
                  <>
                    <Fact label={t.scattHoldLabel} title={t.scattHoldTitle} value={String(selScattA.metrics.hold10Abs)} unit="%" />
                    <Fact label={t.traceSpeed1} title={t.scattSpeed1Title} value={selScattA.metrics.speed.toFixed(1)} unit="mm/s" />
                    <Fact label={t.traceSpeed250} title={t.scattSpeed250Title} value={selScattA.metrics.speed250.toFixed(1)} unit="mm/s" />
                  </>
                )}
              </dl>
            )}
          </section>
        )}
        {section(timeP)}
        {byShot && chartCard(t.chartCoordination, coordChart ? chartEl(`coord-${coordScope}`, coordChart, t.chartCoordination) : none(coordScope === 'shot' ? t.pickShot : t.scattNone), 'coordination', scopedBar(coordScope, setCoordScope, scopeOptions, t.chartCoordination))}
        {byShot && chartCard(t.chartSpeed, speedChart ? chartEl(`speed-${speedScope}`, speedChart, t.chartSpeed) : none(speedScope === 'shot' ? t.pickShot : t.scattNone), 'speed-shot', scopedBar(speedScope, setSpeedScope, scopeOptions, t.chartSpeed))}
        {aimingDots && chartCard(t.chartAimingTime, chartEl(`aim-${aimScope}`, aimingDots, t.chartAimingTime), 'aiming', scopedBar(aimScope, setAimScope, dotScopes, t.chartAimingTime))}
        {speedDots && chartCard(`${t.chartSpeed} · ${t.perShot}`, chartEl(`dots-${speedDotsScope}`, speedDots, t.chartSpeed), 'speed-dots', scopedBar(speedDotsScope, setSpeedDotsScope, dotScopes, t.chartSpeed))}
        {section(hrP)}
        <section className="analysis__sec">{notesP.children}</section>
      </div>
    ),
  };

  return (
    <>
      {/* The panel header (and its button) is hidden on a phone: there the button sits in the page header, left of the total. */}
      {toggleSlot && view.series.length > 0 && createPortal(
        <>
          {/* Only on a phone held sideways (CSS): the target beside the list, or the full width for the list and charts.
              The arrow points where the target goes: left to tuck it away, right to bring it back. */}
          <button type="button" className="button--quiet ws__pin-toggle" onClick={toggleTarget} aria-pressed={!targetOff}>
            {targetOff ? <ChevronRight /> : <ChevronLeft />}
            {targetOff ? t.showTarget : t.hideTarget}
          </button>
          <button type="button" className="button--quiet ws__toggle" onClick={() => setFolded((f) => !f)} aria-pressed={folded}>
            {folded ? t.collapseSeries : t.expandSeries}
          </button>
        </>,
        toggleSlot,
      )}
      <Workspace label={t.panels} strip={strip} panels={[seriesP, targetP, analysisP]} rows={6} pin="target" pinOff={targetOff} resizable={{ id: 'report', widths: [4, 5, 3], minPx: [300, 220, 240] }} />
    </>
  );
}

/** One figure of the selected shot as a mini card: a small label over the value, the unit quiet beside it. */
function Fact({ label, value, unit, title }: { label: string; value: string; unit?: string; title?: string }) {
  return (
    <div className="fact" title={title}>
      <dt>{label}</dt>
      <dd className="num">
        {value}
        {unit && <small>{unit}</small>}
      </dd>
    </div>
  );
}
