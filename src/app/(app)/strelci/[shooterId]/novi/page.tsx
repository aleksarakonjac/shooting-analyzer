import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NewTrainingForm } from '@/components/NewTrainingForm';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';

export default function NewForShooterPage({ params }: { params: Promise<{ shooterId: string }> }) {
  return (
    <div className="page">
      <Suspense fallback={null}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: Promise<{ shooterId: string }> }) {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'coach') redirect('/');
  const { shooterId } = await params;
  const shooter = (await linkedShooters()).find((s) => s.id === shooterId);
  if (!shooter) notFound();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date());
  return (
    <>
      <h1>
        {sr.coach.newTitle}: {shooter.name}
      </h1>
      <NewTrainingForm userId={shooter.id} tz={profile.tz} today={today} />
    </>
  );
}
