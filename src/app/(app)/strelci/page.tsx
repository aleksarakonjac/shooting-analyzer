import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { sr } from '@/lib/i18n/sr';
import { periodRange } from '@/lib/stats/periodStats';
import { shooterCard } from '@/lib/stats/coachCards';
import { SUMMARY_SELECT, toSummary, type SummaryRow } from '@/lib/stats/summaryQuery';
import { createClient } from '@/lib/supabase/server';

export default function ShootersPage() {
  return (
    <div className="page">
      <h1>{sr.coach.title}</h1>
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </div>
  );
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

async function Body() {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'coach') redirect('/');
  const t = sr.coach;
  const shooters = await linkedShooters();
  if (shooters.length === 0) {
    return (
      <p>
        {t.empty} <Link href="/profil/veze">{t.emptyLink}</Link>
      </p>
    );
  }

  const ids = shooters.map((s) => s.id);
  const now = new Date();
  // Cards compare this month with last month: read from the start of last month.
  const { from } = periodRange('month', now, profile.tz);
  const lastMonth = new Date(Date.parse(`${from}T12:00:00Z`) - 86_400_000);
  const since = periodRange('month', lastMonth, profile.tz).from;

  const supabase = await createClient();
  const [recent, newest] = await Promise.all([
    supabase
      .from('trainings')
      .select(SUMMARY_SELECT)
      .in('shooter_id', ids)
      .is('deleted_at', null)
      .gte('trained_on', since)
      .order('trained_on', { ascending: false }),
    // Light query: latest trainings across shooters, also the newest date per shooter.
    supabase
      .from('trainings')
      .select('id,name,trained_on,shooter_id')
      .in('shooter_id', ids)
      .is('deleted_at', null)
      .order('trained_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const rows = ((recent.data ?? []) as unknown as SummaryRow[]).map((r) => ({ shooterId: r.shooter_id, s: toSummary(r) }));
  const latest = (newest.data ?? []) as { id: string; name: string; trained_on: string; shooter_id: string }[];
  const nameOf = new Map(shooters.map((s) => [s.id, s.name]));

  return (
    <div className="dash">
      <ul className="coach__cards">
        {shooters.map((sh) => {
          const card = shooterCard(rows.filter((r) => r.shooterId === sh.id).map((r) => r.s), now, profile.tz);
          const last = latest.find((l) => l.shooter_id === sh.id)?.trained_on ?? null;
          return (
            <li key={sh.id} className="coach__card" data-testid="shooter-card">
              <Link href={`/strelci/${sh.id}`}>
                <strong className="coach__name">{sh.name}</strong>
                <span>
                  {t.lastTraining}: {last ?? t.noTrainings}
                </span>
                <span>
                  {t.thisMonth}: {card.trainingsThisMonth} {t.trainingsCount}
                </span>
                <span>
                  {t.avgSeries}: {card.avgSeries === null ? t.noValue : card.avgSeries.toFixed(1)}
                  {card.delta !== null && (
                    <small data-testid="card-delta" title={t.deltaLabel}>
                      {' '}
                      ({signed(card.delta)})
                    </small>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="latest-title">
        <h2 id="latest-title">{t.latestTitle}</h2>
        {latest.length === 0 ? (
          <p>{t.latestEmpty}</p>
        ) : (
          <ul className="dash__list">
            {latest.slice(0, 8).map((l) => (
              <li key={l.id}>
                <Link href={`/trening/${l.id}`}>
                  <span>{l.trained_on}</span>
                  <span>{l.name}</span>
                  <strong>{nameOf.get(l.shooter_id)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
