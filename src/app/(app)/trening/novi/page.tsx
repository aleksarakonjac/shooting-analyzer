import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NewTrainingForm } from '@/components/NewTrainingForm';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';

export default function NewTrainingPage() {
  return (
    <div className="page">
      <h1>{sr.newTraining.title}</h1>
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  await connection();
  const profile = await getSessionProfile();
  // Phase 1: trainings are entered by the shooter. A coach choosing a linked shooter comes later.
  if (!profile || profile.role !== 'shooter') redirect('/');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date());
  return <NewTrainingForm userId={profile.id} tz={profile.tz} today={today} />;
}
