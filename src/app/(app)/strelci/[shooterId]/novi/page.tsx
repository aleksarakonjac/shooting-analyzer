import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NewTrainingForm } from '@/components/NewTrainingForm';
import { healthFor } from '@/lib/googleHealth/status';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { getSessionProfile } from '@/lib/auth/session';
import { recentPlaces } from '@/lib/import/places';
import { shooterEvents } from '@/lib/events';
import { waitingInbox } from '@/lib/inbox/waiting';
import { sr } from '@/lib/i18n/sr';
import { HOME } from '@/lib/routes';

type Search = { inbox?: string | string[] };

export default function NewForShooterPage({ params, searchParams }: { params: Promise<{ shooterId: string }>; searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ shooterId: string }>; searchParams: Promise<Search> }) {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'coach') redirect(HOME);
  const { shooterId } = await params;
  const shooter = (await linkedShooters()).find((s) => s.id === shooterId);
  if (!shooter) notFound();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date());
  return (
    <NewTrainingForm
      userId={shooter.id}
      tz={profile.tz}
      today={today}
      title={`${sr.coach.newTitle}: ${shooter.name}`}
      places={await recentPlaces(shooter.id)}
      events={await shooterEvents(shooter.id)}
      inbox={await waitingInbox([shooter.id])}
      autoInbox={[(await searchParams).inbox ?? []].flat()}
      health={await healthFor(shooter.id, profile.id)}
    />
  );
}
