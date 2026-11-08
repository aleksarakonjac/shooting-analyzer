import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { LanePlate } from '@/components/LanePlate';
import { PeriodTabs, type Period } from '@/components/PeriodTabs';
import { TrendChart } from '@/components/TrendChart';
import { getSessionProfile } from '@/lib/auth/session';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { matchTotal } from '@/lib/report/derive';
import { periodRange, periodStats, type TrainingSummary } from '@/lib/stats/periodStats';
import { createClient } from '@/lib/supabase/server';

interface Search {
  p?: string;
  d?: string;
}

export default function Home({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="page">
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

interface Row {
  id: string;
  name: string;
  trained_on: string;
  discipline: DisciplineId;
  matches: {
    align_state: 'proposed' | 'confirmed';
    series: {
      idx: number;
      total: number | null;
      total_decimal: number | null;
      group_mm: number | null;
      shots: { count: number }[];
    }[];
  }[];
  loose_shots: { count: number }[];
  hr_samples_ref: { avg_bpm: number | null } | { avg_bpm: number | null }[] | null;
}

const toSummary = (r: Row): TrainingSummary => {
  const ref = Array.isArray(r.hr_samples_ref) ? r.hr_samples_ref[0] : r.hr_samples_ref;
  return {
    id: r.id,
    name: r.name,
    trainedOn: r.trained_on,
    discipline: r.discipline,
    looseShots: r.loose_shots[0]?.count ?? 0,
    hrAvg: ref?.avg_bpm ?? null,
    matches: r.matches.map((m) => ({
      alignState: m.align_state,
      series: m.series.map((s) => ({
        idx: s.idx,
        total: s.total,
        totalDecimal: s.total_decimal === null ? null : Number(s.total_decimal),
        groupMm: s.group_mm === null ? null : Number(s.group_mm),
        shotCount: s.shots[0]?.count ?? 0,
      })),
    })),
  };
};

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const profile = await getSessionProfile();
  const t = sr.dashboard;
  // Coach and admin screens arrive with their own tasks.
  if (!profile || profile.role !== 'shooter') {
    return (
      <>
        <h1>{sr.appName}</h1>
        {profile?.role === 'coach' && <p>{t.coachHome}</p>}
      </>
    );
  }

  const sp = await searchParams;
  const period: Period = sp.p === 'week' || sp.p === 'year' ? sp.p : 'month';
  const now = new Date();
  const { from, to } = periodRange(period, now, profile.tz);

  const supabase = await createClient();
  const { data } = await supabase
    .from('trainings')
    .select(
      'id,name,trained_on,discipline,' +
        'matches(align_state,series(idx,total,total_decimal,group_mm,shots(count))),' +
        'loose_shots(count),hr_samples_ref(avg_bpm)',
    )
    .eq('shooter_id', profile.id)
    .is('deleted_at', null)
    .gte('trained_on', from)
    .lt('trained_on', to)
    .order('trained_on', { ascending: false })
    .order('created_at', { ascending: false });
  const all = ((data ?? []) as unknown as Row[]).map(toSummary);

  // Series scores of different disciplines are not comparable: the dashboard shows one discipline at a time.
  const present = [...new Set(all.map((x) => x.discipline))];
  const discipline: DisciplineId | undefined =
    present.find((d) => d === sp.d) ?? present[0];
  const list = all.filter((x) => x.discipline === discipline);
  const stats = periodStats(list, period, now, profile.tz);
  const dec = discipline ? DISCIPLINES[discipline].decimal : true;
  const href = (p: Period) => `/?p=${p}${discipline ? `&d=${discipline}` : ''}`;
  const dash = (v: number | null, digits = 1, unit = '') => (v === null ? t.noValue : `${v.toFixed(digits)}${unit}`);

  return (
    <div className="dash">
      <h1>{t.title}</h1>
      <div className="dash__bar">
        <PeriodTabs value={period} hrefFor={href} />
        {present.length > 1 && (
          <nav className="dash__disc" aria-label={t.discipline}>
            {present.map((d) => (
              <Link key={d} href={`/?p=${period}&d=${d}`} aria-current={d === discipline ? 'page' : undefined}>
                {DISCIPLINES[d].nameSr}
              </Link>
            ))}
          </nav>
        )}
        <Link href="/trening/novi">{t.addFirst}</Link>
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
