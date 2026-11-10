import Link from 'next/link';
import { LanePlate } from '@/components/LanePlate';
import { Workspace } from '@/components/Workspace';
import { FilterBar } from '@/components/sessions/FilterBar';
import { SessionsChart } from '@/components/sessions/SessionsChart';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { filtersHref, hasFilters, parseFilters, RECENT_LIMIT, type ChartKind, type FilterSearch, type Quick, type SessionFilters } from '@/lib/stats/filters';
import { filterChoices, loadSessions } from '@/lib/stats/loadSessions';
import { sessionPoints, setStats, type TrainingSummary } from '@/lib/stats/periodStats';

export type DashboardSearch = FilterSearch;

/** Sessions page of one shooter: the shooter's own home and the coach's drill-down. */
export async function ShooterDashboard({
  shooterId,
  tz,
  title,
  base,
  newHref,
  search,
  back,
}: {
  /** A link back to where the viewer came from (the coach's list). */
  back?: { href: string; label: string };
  shooterId: string;
  tz: string;
  title: string;
  /** Path the filter links point to ('/' or '/strelci/<id>'). */
  base: string;
  newHref: string;
  search: DashboardSearch;
}) {
  const filters = parseFilters(search, new Date(), tz);
  const [all, choices] = await Promise.all([loadSessions(shooterId, filters), filterChoices(shooterId)]);
  return <SessionsView all={all} filters={filters} title={title} base={base} newHref={newHref} back={back} choices={choices} />;
}

const t = sr.dashboard;
const nt = sr.newTraining;
const WEEKDAYS = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub'];
const QUICK: { id: Exclude<Quick, 'range'>; label: string }[] = [
  { id: 'recent', label: t.recent },
  { id: 'week', label: sr.period.week },
  { id: 'month', label: sr.period.month },
  { id: 'year', label: sr.period.year },
];
const CHARTS: { id: ChartKind; label: string }[] = [
  { id: 'rez', label: t.chartRez },
  { id: 'puls', label: t.chartPuls },
  { id: 'grupa', label: t.chartGrupa },
];

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], date: `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`, year: d.getUTCFullYear() };
};

const hm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));

/** The sessions list first, then the figures and a chart of the filtered set (pure; the loader fetches). */
export function SessionsView({
  all,
  filters,
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
  choices: { places: string[]; events: { id: string; name: string }[] };
}) {
  const f = filters;
  // Series scores of different disciplines are not comparable: the figures follow one discipline.
  const discipline: DisciplineId | undefined = f.discipline ?? all[0]?.discipline;
  const same = discipline ? all.filter((x) => x.discipline === discipline) : [];
  const mixed = new Set(all.map((x) => x.discipline)).size > 1;
  const stats = setStats(same);
  const dec = discipline ? DISCIPLINES[discipline].decimal : true;
  const thisYear = new Date().getUTCFullYear();
  const activeCount = [f.quick === 'range', f.discipline, f.kind, f.stage, f.place, f.event].filter(Boolean).length;
  const dash = (v: number | null, digits = 1) => (v === null ? t.noValue : v.toFixed(digits));

  const strip = (
    <>
      <div className="ws__head">
        {back && <Link className="ws__back" href={back.href}>{back.label}</Link>}
        <h1 className="ws__title">{title}</h1>
      </div>
      <nav className="period-tabs" aria-label={t.quick}>
        {QUICK.map((q) => (
          <Link key={q.id} href={filtersHref(base, f, { quick: q.id })} aria-current={f.quick === q.id ? 'page' : undefined}>
            {q.label}
          </Link>
        ))}
      </nav>
      <FilterBar base={base} filters={f} places={choices.places} events={choices.events} activeCount={activeCount} />
      {activeCount > 0 && <Link className="button button--quiet" href={base}>{t.clear}</Link>}
      <div className="ws__strip-end">
        <Link className="button" href={newHref}>{t.addFirst}</Link>
      </div>
    </>
  );

  if (all.length === 0) {
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

  const list = (
    <ol className="srows">
      {all.map((x) => {
        const series = x.matches.flatMap((m) => m.series);
        const xdec = DISCIPLINES[x.discipline].decimal;
        const total = series.length
          ? Math.round(series.reduce((a, s) => a + ((xdec ? (s.totalDecimal ?? s.total) : s.total) ?? 0), 0) * 10) / 10
          : null;
        const proposed = x.matches.some((m) => m.alignState === 'proposed');
        const day = dayParts(x.trainedOn);
        const label = [x.kind && x.kind !== 'trening' ? nt.kinds[x.kind] : null, x.stage && x.stage !== 'slobodno' ? nt.stages[x.stage] : null]
          .filter(Boolean)
          .join(', ');
        const meta = [
          mixed ? DISCIPLINES[x.discipline].nameSr : null,
          label || null,
          x.eventName ?? null,
          x.place || null,
          x.startedAt && x.tz ? hm(x.startedAt, x.tz) : null,
        ].filter(Boolean);
        return (
          <li key={x.id}>
            <Link href={`/trening/${x.id}`} className="srow">
              <span className="srow__day">
                <span className="srow__wd">{day.weekday}</span>
                <span className="srow__date num">{day.date}</span>
                {day.year !== thisYear && <span className="srow__year num">{day.year}</span>}
              </span>
              <span className="srow__main">
                <span className="srow__name">{x.name}</span>
                {meta.length > 0 && <span className="srow__meta">{meta.join(' · ')}</span>}
                {proposed && <small className="dash__flag">{t.proposed}</small>}
              </span>
              <strong className="srow__total num">{total === null ? t.noValue : total.toFixed(xdec ? 1 : 0)}</strong>
            </Link>
          </li>
        );
      })}
    </ol>
  );

  const figures = (
    <div className="scoreline scoreline--stack">
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
          <Link key={c.id} href={filtersHref(base, f, { chart: c.id })} aria-current={f.chart === c.id ? 'page' : undefined} scroll={false}>
            {c.label}
          </Link>
        ))}
      </nav>
      {discipline && <SessionsChart points={sessionPoints(same, discipline)} kind={f.chart} decimal={dec} />}
    </div>
  );

  const figuresRange = discipline && mixed ? t.figuresFor(DISCIPLINES[discipline].nameSr) : t.hrNote;
  return (
    <Workspace
      label={t.panels}
      strip={strip}
      rows={6}
      panels={[
        {
          id: 'list',
          title: t.listTitle,
          range: f.quick === 'recent' && all.length >= RECENT_LIMIT ? t.recentRange(RECENT_LIMIT) : String(all.length),
          col: '1 / 8',
          row: '1 / 7',
          flush: true,
          children: list,
        },
        { id: 'figures', title: t.scoreboard, range: figuresRange, col: '8 / 13', row: '1 / 3', children: figures },
        { id: 'chart', title: t.trendTitle, col: '8 / 13', row: '3 / 7', children: chart },
      ]}
    />
  );
}
