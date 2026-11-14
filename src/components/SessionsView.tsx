'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LanePlate } from '@/components/LanePlate';
import { Workspace } from '@/components/Workspace';
import { FilterBar } from '@/components/sessions/FilterBar';
import { SessionsChart } from '@/components/sessions/SessionsChart';
import { MoreLink, SessionsList } from '@/components/sessions/SessionsList';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { filtersHref, hasFilters, RECENT_LIMIT, type ChartKind, type SessionFilters } from '@/lib/stats/filters';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { saveListUrl } from '@/lib/listReturn';
import { sessionPoints, setStats, type TrainingSummary } from '@/lib/stats/periodStats';

const t = sr.dashboard;
const CHARTS: { id: ChartKind; label: string }[] = [
  { id: 'rez', label: t.chartRez },
  { id: 'puls', label: t.chartPuls },
  { id: 'grupa', label: t.chartGrupa },
];

const PLUS = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.25"
    strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
);

/** The sessions list first, then the figures and a chart of the filtered set (pure; the loader fetches). */
export function SessionsView({
  all,
  filters: urlFilters,
  title,
  base,
  newHref,
  back,
  choices,
}: {
  back?: { href: string; label: string };
  all: TrainingSummary[];
  filters: SessionFilters;
  title: string;
  base: string;
  newHref: string;
  choices: { places: string[]; events: { id: string; name: string }[]; years?: string[] };
}) {
  // Opening the side panel and switching the chart are view state, not data: they live here and only
  // mirror to the address bar, so they never go back to the server.
  const [side, setSide] = useState(urlFilters.side);
  const [chartKind, setChartKind] = useState<ChartKind>(urlFilters.chart);
  const f: SessionFilters = { ...urlFilters, side, chart: chartKind };
  const mirror = (patch: { side?: boolean; chart?: ChartKind }) => {
    try { window.history.replaceState(window.history.state, '', filtersHref(base, f, patch)); } catch { /* the address bar is a convenience */ }
  };
  // A report's close button comes back to this view: same period, filters, list length, side panel.
  const here = filtersHref(base, f, {});
  useEffect(() => saveListUrl(here), [here]);
  const toggleSide = () => { setSide(!side); mirror({ side: !side }); };
  const pickChart = (c: ChartKind) => { setChartKind(c); mirror({ chart: c }); };
  // The recent view loads one row past the list size, so it can tell whether older sessions exist.
  const olderExist = f.quick === 'recent' && all.length > f.limit;
  const set = f.quick === 'recent' ? all.slice(0, f.limit) : all;
  // Series scores of different disciplines are not comparable: the figures follow one discipline.
  const discipline: DisciplineId | undefined = f.discipline ?? set[0]?.discipline;
  const same = discipline ? set.filter((x) => x.discipline === discipline) : [];
  const mixed = new Set(set.map((x) => x.discipline)).size > 1;
  const stats = setStats(same);
  const dec = discipline ? DISCIPLINES[discipline].decimal : true;
  const thisYear = new Date().getUTCFullYear();
  const activeCount = [f.discipline, f.kind, f.stage, f.place, f.event].filter(Boolean).length + (f.scatt !== null ? 1 : 0) + (f.pulse !== null ? 1 : 0);
  const dash = (v: number | null, digits = 1) => (v === null ? t.noValue : v.toFixed(digits));

  const strip = (
    <>
      <div className="ws__head dash__head">
        {back && <Link className="ws__back" href={back.href}>{back.label}</Link>}
        <h1 className="ws__title">{title}</h1>
      </div>
      <div className="ws__strip-end dash__tools">
        <FilterBar base={base} filters={f} places={choices.places} events={choices.events} years={choices.years ?? [String(thisYear)]} activeCount={activeCount} />
        {hasFilters(f) && <Link className="button button--quiet dash__clear" href={base}>{t.clear}</Link>}
        <button
          type="button"
          className="button button--quiet dash__side-toggle"
          onClick={toggleSide}
          aria-expanded={f.side}
          aria-label={f.side ? t.hideSide : t.showSide}
        >
          <span>{t.sideTitle}</span>
          {f.side ? <ChevronRight /> : <ChevronLeft />}
        </button>
        <Link className="button dash__new" href={newHref} aria-label={t.addFirst}>
          {PLUS}
          <span>{t.addFirst}</span>
        </Link>
      </div>
    </>
  );

  if (set.length === 0) {
    return (
      <Workspace
        label={t.panels}
        strip={strip}
        rows={1}
        panels={[
          {
            id: 'list',
            title: t.listTitle,
            col: '1 / 13',
            row: '1 / 2',
            children: <p className="panel__empty dash__empty">{hasFilters(f) ? t.empty : t.emptyNew}</p>,
          },
        ]}
      />
    );
  }

  const shown = set.slice(0, f.limit);
  const more = f.quick === 'recent' ? (olderExist ? RECENT_LIMIT : 0) : Math.min(RECENT_LIMIT, set.length - shown.length);
  const moreHref = filtersHref(base, f, { limit: f.limit + RECENT_LIMIT });

  const list = (
    <SessionsList
      shown={shown}
      footer={
        more > 0 && (
          <div className="stable__foot">
            <span className="num">{f.quick === 'recent' ? t.recentRange(shown.length) : t.shownOf(shown.length, set.length)}</span>
            <MoreLink href={moreHref} label={f.quick === 'recent' ? t.showOlder : t.showMore(more)} />
          </div>
        )
      }
    />
  );

  const figures = (
    <div className="scoreline dash__figures">
      <LanePlate label={t.trainings} value={String(stats.trainings)} />
      <LanePlate label={t.shots} value={String(stats.shots)} />
      <LanePlate label={t.avgSeries} value={dash(stats.avgSeries)} />
      <LanePlate label={t.avgGroup} value={dash(stats.avgGroupMm)} unit={t.unitMm} />
      <LanePlate label={t.avgHr} value={dash(stats.avgHr, 0)} unit={t.unitBpm} />
    </div>
  );

  const chart = (
    <div className="chart-panel">
      <nav className="period-tabs" aria-label={t.chart}>
        {CHARTS.map((c) => (
          <button key={c.id} type="button" onClick={() => pickChart(c.id)} aria-current={f.chart === c.id ? 'page' : undefined}>
            {c.label}
          </button>
        ))}
      </nav>
      {discipline && <SessionsChart points={sessionPoints(same, discipline)} kind={f.chart} decimal={dec} />}
    </div>
  );

  const figuresRange = discipline && mixed ? t.figuresFor(DISCIPLINES[discipline].nameSr) : undefined;
  return (
    <Workspace
      label={t.panels}
      strip={strip}
      rows={6}
      panels={[
        {
          id: 'list',
          title: t.listTitle,
          headless: true,
          col: '1 / 13',
          row: '1 / 7',
          flush: true,
          children: list,
        },
        {
          id: 'side',
          title: t.sideTitle,
          range: figuresRange,
          side: true,
          closed: !f.side,
          children: (
            <div className="dash__side">
              {figures}
              <h3 className="dash__side-sub">{t.trendTitle}</h3>
              {chart}
            </div>
          ),
        },
      ]}
    />
  );
}
