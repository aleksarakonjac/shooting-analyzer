import Link from 'next/link';
import { LanePlate } from '@/components/LanePlate';
import { PeriodTabs, type Period } from '@/components/PeriodTabs';
import { TrendChart } from '@/components/TrendChart';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { matchTotal } from '@/lib/report/derive';
import { periodRange, periodStats } from '@/lib/stats/periodStats';
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
}: {
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

  // Series scores of different disciplines are not comparable: the dashboard shows one discipline at a time.
  const present = [...new Set(all.map((x) => x.discipline))];
  const discipline: DisciplineId | undefined =
    present.find((d) => d === sp.d) ?? present[0];
  const list = all.filter((x) => x.discipline === discipline);
  const stats = periodStats(list, period, now, tz);
  const dec = discipline ? DISCIPLINES[discipline].decimal : true;
  const href = (p: Period) => `${base}?p=${p}${discipline ? `&d=${discipline}` : ''}`;
  const dash = (v: number | null, digits = 1, unit = '') => (v === null ? t.noValue : `${v.toFixed(digits)}${unit}`);

  return (
    <div className="dash">
      <h1>{title}</h1>
      <div className="dash__bar">
        <PeriodTabs value={period} hrefFor={href} />
        {present.length > 1 && (
          <nav className="dash__disc" aria-label={t.discipline}>
            {present.map((d) => (
              <Link key={d} href={`${base}?p=${period}&d=${d}`} aria-current={d === discipline ? 'page' : undefined}>
                {DISCIPLINES[d].nameSr}
              </Link>
            ))}
          </nav>
        )}
        <Link href={newHref}>{t.addFirst}</Link>
      </div>

      {list.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <>
          <div className="dash__plates">
            <LanePlate label={t.trainings} value={String(stats.trainings)} />
            <LanePlate label={t.shots} value={String(stats.shots)} />
            <LanePlate label={t.avgSeries} value={dash(stats.avgSeries, dec ? 1 : 1)} />
            <LanePlate label={t.avgGroup} value={dash(stats.avgGroupMm)} unit={t.unitMm} />
            <LanePlate label={t.avgHr} value={dash(stats.avgHr, 0)} unit={t.unitBpm} />
          </div>
          <p className="report__meta">{t.hrNote}</p>
          <div className="dash__trends">
            <TrendChart title={t.trendSeries} buckets={stats.buckets.map((b) => ({ label: b.label, value: b.avgSeries }))} />
            <TrendChart title={t.trendGroup} buckets={stats.buckets.map((b) => ({ label: b.label, value: b.avgGroupMm }))} />
          </div>
          <section aria-labelledby="list-title">
            <h2 id="list-title">{t.listTitle}</h2>
            <ul className="dash__list">
              {list.map((x) => {
                const series = x.matches.flatMap((m) => m.series).map((s) => ({ total: s.total, total_decimal: s.totalDecimal }));
                const proposed = x.matches.some((m) => m.alignState === 'proposed');
                return (
                  <li key={x.id}>
                    <Link href={`/trening/${x.id}`}>
                      <span>{x.trainedOn}</span>
                      <span>
                        {x.name}
                        {proposed && <small> · {t.proposed}</small>}
                      </span>
                      <strong>{series.length ? matchTotal(series, dec).toFixed(dec ? 1 : 0) : t.noValue}</strong>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
