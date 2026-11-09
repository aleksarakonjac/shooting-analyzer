import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ShooterDashboard, type DashboardSearch } from '@/components/ShooterDashboard';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';

export default function Home({ searchParams }: { searchParams: Promise<DashboardSearch> }) {
  return (
    <div className="page">
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: Promise<DashboardSearch> }) {
  await connection();
  const profile = await getSessionProfile();
  if (profile?.role === 'coach') redirect('/strelci');
  // The admin's own screens (approvals, trash, audit log) have their own routes.
  if (!profile || profile.role !== 'shooter') return <h1>{sr.appName}</h1>;
  return (
    <ShooterDashboard
      shooterId={profile.id}
      tz={profile.tz}
      title={sr.dashboard.title}
      base="/"
      newHref="/trening/novi"
      search={await searchParams}
    />
  );
}
