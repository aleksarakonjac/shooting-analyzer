import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NewTrainingForm } from '@/components/NewTrainingForm';
import { getSessionProfile } from '@/lib/auth/session';
import { recentPlaces } from '@/lib/import/places';
import { shooterEvents } from '@/lib/events';
import { waitingInbox } from '@/lib/inbox/waiting';

type Search = { inbox?: string | string[] };

export default function NewTrainingPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const profile = await getSessionProfile();
  // Coaches enter trainings for a linked shooter from /strelci/<id>/novi.
  if (!profile || profile.role !== 'shooter') redirect('/');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date());
  const inbox = await waitingInbox();
  // ?inbox=<id> (from the Shortcut) loads that file; ?inbox=all loads every waiting one.
  const asked = [(await searchParams).inbox ?? []].flat();
  const autoInbox = asked.includes('all') ? inbox.map((i) => i.id) : asked;
  return (
    <NewTrainingForm
      userId={profile.id}
      tz={profile.tz}
      today={today}
      places={await recentPlaces(profile.id)}
      events={await shooterEvents(profile.id)}
      inbox={inbox}
      autoInbox={autoInbox}
    />
  );
}
