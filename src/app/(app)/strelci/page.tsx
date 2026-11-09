import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Workspace } from '@/components/Workspace';
import { getSessionProfile } from '@/lib/auth/session';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { sr } from '@/lib/i18n/sr';
import { periodRange } from '@/lib/stats/periodStats';
import { shooterCard } from '@/lib/stats/coachCards';
import { SUMMARY_SELECT, toSummary, type SummaryRow } from '@/lib/stats/summaryQuery';
import { createClient } from '@/lib/supabase/server';

export default function ShootersPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;

async function Body() {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'coach') redirect('/');
  const t = sr.coach;
  const shooters = await linkedShooters();
  const strip = (
    <>
      <div className="ws__head">
        <h1 className="ws__title">{t.title}</h1>
        <p className="ws__meta">{t.count(shooters.length)}</p>
      </div>
      <div className="ws__strip-end">
        <Link className="button button--quiet" href="/profil/veze">{t.emptyLink}</Link>
      </div>
    </>
  );
  if (shooters.length === 0) {
    return (
      <Workspace
        label={t.title}
        strip={strip}
        rows={1}
        panels={[{ id: 'none', title: t.title, col: '1 / 13', row: '1 / 2', children: <p className="panel__empty dash__empty">{t.empty}</p> }]}
      />
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

  const cards = (
    <ul className="coach__cards">
      {shooters.map((sh) => {
        const card = shooterCard(rows.filter((r) => r.shooterId === sh.id).map((r) => r.s), now, profile.tz);
        const last = latest.find((l) => l.shooter_id === sh.id)?.trained_on ?? null;
        return (
          <li key={sh.id} className="coach__card" data-testid="shooter-card">
            <Link href={`/strelci/${sh.id}`}>
              <strong className="coach__name">{sh.name}</strong>
              <span className="coach__meta">
                {t.lastTraining}: <span className="num">{last ?? t.noTrainings}</span>
              </span>
              <span className="coach__meta">
                {t.thisMonth}: <span className="num">{card.trainingsThisMonth}</span> {t.trainingsCount}
              </span>
              <span className="coach__score">
                <span className="coach__label">{t.avgSeries}</span>
                <strong className="num">{card.avgSeries === null ? t.noValue : card.avgSeries.toFixed(1)}</strong>
                {card.delta !== null && (
                  <small className="num coach__delta" data-testid="card-delta" data-sign={card.delta > 0 ? 'up' : card.delta < 0 ? 'down' : 'flat'} title={t.deltaLabel}>
                    {signed(card.delta)}
                  </small>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const latestList =
    latest.length === 0 ? (
      <p className="panel__empty">{t.latestEmpty}</p>
    ) : (
      <ul className="dash__list">
        {latest.slice(0, 12).map((l) => (
          <li key={l.id}>
            <Link href={`/trening/${l.id}`}>
              <span className="num dash__date">{l.trained_on.slice(8, 10)}.{l.trained_on.slice(5, 7)}.</span>
              <span className="dash__name">{l.name}</span>
              <span className="dash__who">{nameOf.get(l.shooter_id)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <Workspace
      label={t.title}
      strip={strip}
      rows={6}
      panels={[
        { id: 'shooters', title: t.shootersPanel, range: t.count(shooters.length), col: '1 / 8', row: '1 / 7', children: cards },
        { id: 'latest', title: t.latestTitle, col: '8 / 13', row: '1 / 7', flush: true, children: latestList },
      ]}
    />
  );
}
