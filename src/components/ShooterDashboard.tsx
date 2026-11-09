import Link from 'next/link';
import { LanePlate } from '@/components/LanePlate';
import { PeriodTabs, type Period } from '@/components/PeriodTabs';
import { TrendPanel } from '@/components/TrendPanel';
import { Workspace } from '@/components/Workspace';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { matchTotal } from '@/lib/report/derive';
import { periodRange, periodStats, type TrainingSummary } from '@/lib/stats/periodStats';
import { SUMMARY_SELECT, toSummary, type SummaryRow } from '@/lib/stats/summaryQuery';
import { createClient } from '@/lib/supabase/server';

export interface DashboardSearch {
  p?: string;
  d?: string;
}

/** Period dashboard of one shooter: used by the shooter's own home and by the coach's drill-down. */
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
  /** Path the period and discipline links point to ('/' or '/strelci/<id>'). */
  base: string;
  newHref: string;
  search: DashboardSearch;
}) {
  const t = sr.dashboard;
  const sp = search;
  const period: Period = sp.p === 'week' || sp.p === 'year' ? sp.p : 'month';
  const now = new Date();
  const { from, to } = periodRange(period, now, tz);

  const supabase = await createClient();
  const { data } = await supabase
    .from('trainings')
    .select(SUMMARY_SELECT)
    .eq('shooter_id', shooterId)
    .is('deleted_at', null)
    .gte('trained_on', from)
    .lt('trained_on', to)
    .order('trained_on', { ascending: false })
    .order('created_at', { ascending: false });
  const all = ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
  return <DashboardView all={all} period={period} now={now} tz={tz} title={title} base={base} newHref={newHref} wanted={sp.d} back={back} />;
}

/** The dashboard for already-loaded trainings of the period (pure; the loader above fetches them). */
export function DashboardView({
  all,
  period,
  now,
  tz,
  title,
  base,
  newHref,
  wanted,
  back,
}: {
  back?: { href: string; label: string };
  all: TrainingSummary[];
  period: Period;
  now: Date;
  tz: string;
  title: string;
  base: string;
  newHref: string;
  wanted?: string;
}) {
  const t = sr.dashboard;
  // Series scores of different disciplines are not comparable: the dashboard shows one discipline at a time.
  const present = [...new Set(all.map((x) => x.discipline))];
  const discipline: DisciplineId | undefined =
    present.find((d) => d === wanted) ?? present[0];
  const list = all.filter((x) => x.discipline === discipline);
  const stats = periodStats(list, period, now, tz);
  const dec = discipline ? DISCIPLINES[discipline].decimal : true;
  const href = (p: Period) => `${base}?p=${p}${discipline ? `&d=${discipline}` : ''}`;
  const dash = (v: number | null, digits = 1, unit = '') => (v === null ? t.noValue : `${v.toFixed(digits)}${unit}`);

  const strip = (
    <>
      <div className="ws__head">
        {back && <Link className="ws__back" href={back.href}>{back.label}</Link>}
        <h1 className="ws__title">{title}</h1>
        {discipline && <p className="ws__meta">{DISCIPLINES[discipline].nameSr}</p>}
      </div>
      <PeriodTabs value={period} hrefFor={href} />
      {present.length > 1 && (
        <nav className="period-tabs dash__disc" aria-label={t.discipline}>
          {present.map((d) => (
            <Link key={d} href={`${base}?p=${period}&d=${d}`} aria-current={d === discipline ? 'page' : undefined}>
              {DISCIPLINES[d].nameSr}
            </Link>
          ))}
        </nav>
      )}
      <div className="ws__strip-end">
        <Link className="button" href={newHref}>{t.addFirst}</Link>
      </div>
    </>
  );

  if (list.length === 0) {
    return (
      <Workspace
        label={t.panels}
        strip={strip}
        rows={1}
        panels={[{ id: 'empty', title: t.listTitle, col: '1 / 13', row: '1 / 2', children: <p className="panel__empty dash__empty">{t.empty}</p> }]}
      />
    );
  }

  const scoreboard = (
    <div className="dash__plates">
      <LanePlate label={t.trainings} value={String(stats.trainings)} />
      <LanePlate label={t.shots} value={String(stats.shots)} />
      <LanePlate label={t.avgSeries} value={dash(stats.avgSeries, 1)} variant="score" />
      <LanePlate label={t.avgGroup} value={dash(stats.avgGroupMm)} unit={t.unitMm} />
      <LanePlate label={t.avgHr} value={dash(stats.avgHr, 0)} unit={t.unitBpm} />
    </div>
  );

  const rows = (
    <ul className="dash__list">
      {list.map((x) => {
        const series = x.matches.flatMap((m) => m.series).map((s) => ({ total: s.total, total_decimal: s.totalDecimal }));
        const proposed = x.matches.some((m) => m.alignState === 'proposed');
        return (
          <li key={x.id}>
            <Link href={`/trening/${x.id}`}>
              <span className="num dash__date">{x.trainedOn.slice(8, 10)}.{x.trainedOn.slice(5, 7)}.</span>
              <span className="dash__name">
                {x.name}
                {proposed && <small className="dash__flag">{t.proposed}</small>}
              </span>
              <strong className="num">{series.length ? matchTotal(series, dec).toFixed(dec ? 1 : 0) : t.noValue}</strong>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Workspace
      label={t.panels}
      strip={strip}
      rowTemplate="auto repeat(5, minmax(0, 1fr))"
      panels={[
        { id: 'score', title: t.scoreboard, range: t.hrNote, col: '1 / 13', row: '1 / 2', children: scoreboard },
        { id: 'trend', title: t.trendTitle, col: '1 / 9', row: '2 / 7', children: <TrendPanel buckets={stats.buckets} decimal={dec} /> },
        { id: 'list', title: t.listTitle, range: `${list.length}`, col: '9 / 13', row: '2 / 7', flush: true, children: rows },
      ]}
    />
  );
}
