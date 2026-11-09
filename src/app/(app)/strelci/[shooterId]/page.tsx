import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ShooterDashboard, type DashboardSearch } from '@/components/ShooterDashboard';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';

export default function ShooterPage({
  params,
  searchParams,
}: {
  params: Promise<{ shooterId: string }>;
  searchParams: Promise<DashboardSearch>;
}) {
  return (
    <Suspense fallback={null}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ shooterId: string }>; searchParams: Promise<DashboardSearch> }) {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'coach') redirect('/');
  const { shooterId } = await params;
  const shooter = (await linkedShooters()).find((s) => s.id === shooterId);
  if (!shooter) notFound();
  return (
    <>
      <ShooterDashboard
        back={{ href: '/strelci', label: sr.coach.back }}
        shooterId={shooter.id}
        tz={profile.tz}
        title={shooter.name}
        base={`/strelci/${shooter.id}`}
        newHref={`/strelci/${shooter.id}/novi`}
        search={await searchParams}
      />
    </>
  );
}
