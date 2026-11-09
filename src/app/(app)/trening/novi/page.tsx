import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NewTrainingForm } from '@/components/NewTrainingForm';
import { getSessionProfile } from '@/lib/auth/session';
import { recentPlaces } from '@/lib/import/places';

export default function NewTrainingPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  await connection();
  const profile = await getSessionProfile();
  // Coaches enter trainings for a linked shooter from /strelci/<id>/novi.
  if (!profile || profile.role !== 'shooter') redirect('/');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date());
  return <NewTrainingForm userId={profile.id} tz={profile.tz} today={today} places={await recentPlaces(profile.id)} />;
}
