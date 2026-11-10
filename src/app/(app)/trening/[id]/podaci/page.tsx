import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NewTrainingForm, type SessionEdit } from '@/components/NewTrainingForm';
import { getSessionProfile } from '@/lib/auth/session';
import type { DisciplineId } from '@/lib/domain/types';
import type { MatchSelection } from '@/lib/alignment/align';
import { shooterEvents } from '@/lib/events';
import type { SessionKind, SessionStage } from '@/lib/import/saveTraining';
import { recentPlaces } from '@/lib/import/places';
import type { SourceKind } from '@/lib/import/uploadSource';
import { sr } from '@/lib/i18n/sr';
import { siusFromStored, type StoredSeries } from '@/lib/sessions/storedSius';
import { createClient } from '@/lib/supabase/server';

interface Row {
  id: string;
  shooter_id: string;
  discipline: DisciplineId;
  trained_on: string;
  started_at: string | null;
  ended_at: string | null;
  name: string;
  place: string;
  notes: string;
  kind: SessionKind;
  stage: SessionStage;
  tz: string;
  events: { name: string } | null;
  source_files: { kind: SourceKind; storage_path: string }[];
  matches: { selection: (MatchSelection & { ignoredScattIds?: number[] }) | null; align_state: 'proposed' | 'confirmed'; series: StoredSeries[] }[];
  hr_samples_ref: { offset_ms: number; zone: string | null } | { offset_ms: number; zone: string | null }[] | null;
}

/** Files and alignment of a saved session: the import form, loaded with what was stored. */
export default function SessionDataPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  const supabase = await createClient();
  const { data } = await supabase
    .from('trainings')
    .select(
      'id,shooter_id,discipline,trained_on,started_at,ended_at,name,place,notes,kind,stage,tz,events(name),source_files(kind,storage_path),' +
        'matches(selection,align_state,series(idx,position,total,total_decimal,mpi_x,mpi_y,group_mm,shots(idx,value,inner,direction,x,y))),' +
        'hr_samples_ref(offset_ms,zone)',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const tr = data as unknown as Row | null;
  if (!tr) notFound();

  const wall = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tr.tz }).format(new Date(iso)) : '';
  const hrRef = Array.isArray(tr.hr_samples_ref) ? tr.hr_samples_ref[0] : tr.hr_samples_ref;
  const match = tr.matches[0] ?? null;
  const hasSiusFile = tr.source_files.some((f) => f.kind === 'sius_csv' || f.kind === 'sius_pdf');
  const edit: SessionEdit = {
    trainingId: tr.id,
    initial: {
      disciplineId: tr.discipline,
      trainedOn: tr.trained_on,
      timeFrom: wall(tr.started_at),
      timeTo: wall(tr.ended_at),
      kind: tr.kind,
      stage: tr.stage,
      eventName: tr.events?.name ?? '',
      tz: tr.tz,
      name: tr.name,
      place: tr.place,
      notes: tr.notes,
    },
    files: tr.source_files.map((f) => ({ kind: f.kind, path: f.storage_path })),
    storedSius: !hasSiusFile && match?.series.length ? siusFromStored(match.series, tr.discipline) : null,
    selection: match?.selection ?? null,
    confirmed: match?.align_state === 'confirmed',
    hrOffsetS: Math.round(Number(hrRef?.offset_ms ?? 0) / 1000),
    hrZone: hrRef?.zone ?? null,
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date());
  const [events, places] = await Promise.all([shooterEvents(tr.shooter_id), recentPlaces(tr.shooter_id)]);
  return (
    <NewTrainingForm
      userId={tr.shooter_id}
      tz={profile.tz}
      today={today}
      places={places}
      events={events}
      title={`${sr.newTraining.editTitle}: ${tr.name}`}
      edit={edit}
    />
  );
}
