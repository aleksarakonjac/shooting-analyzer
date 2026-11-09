import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ShooterDashboard, type DashboardSearch } from '@/components/ShooterDashboard';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';

export default function Home({ searchParams }: { searchParams: Promise<DashboardSearch> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<DashboardSearch> }) {
  await connection();
  const profile = await getSessionProfile();
  if (profile?.role === 'coach') redirect('/strelci');
  if (profile?.role === 'admin') redirect('/admin/approvals');
  if (!profile || profile.role !== 'shooter') return <h1 className="sr-only">{sr.appName}</h1>;
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
