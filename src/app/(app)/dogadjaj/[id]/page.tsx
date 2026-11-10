import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Workspace } from '@/components/Workspace';
import { getSessionProfile } from '@/lib/auth/session';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import { updateEventForm } from '@/lib/eventActions';
import { sr } from '@/lib/i18n/sr';
import { eventRows, type EventSessionRow } from '@/lib/sessions/eventRows';
import { createClient } from '@/lib/supabase/server';

type Search = { sacuvano?: string; greska?: string };

interface EventRecord {
  id: string;
  shooter_id: string;
  kind: 'kontrolni' | 'takmicenje';
  name: string;
  place: string;
  starts_on: string | null;
  ends_on: string | null;
}

export default function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const WEEKDAYS = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub'];
const day = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
};

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  await connection();
  const [{ id }, { sacuvano, greska }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await getSessionProfile();
  const supabase = await createClient();
  const [{ data: ev }, { data: sess }] = await Promise.all([
    supabase.from('events').select('id, shooter_id, kind, name, place, starts_on, ends_on').eq('id', id).maybeSingle(),
    supabase
      .from('trainings')
      .select('id, name, discipline, trained_on, started_at, stage, matches(series(total,total_decimal)), finals(final_shots(value))')
      .eq('event_id', id)
      .is('deleted_at', null),
  ]);
  const event = ev as EventRecord | null;
  if (!event) notFound();
  const rows = eventRows((sess ?? []) as unknown as EventSessionRow[]);
  const t = sr.event;
  const nt = sr.newTraining;
  const mixed = new Set(rows.map((r) => r.discipline)).size > 1;
  const back = profile?.id === event.shooter_id ? '/' : `/strelci/${event.shooter_id}`;
  const dates = [event.starts_on, event.ends_on].filter(Boolean).map((d) => day(d!));
  const fmt = (v: number | null, decimal: boolean) => (v === null ? '—' : v.toFixed(decimal ? 1 : 0));

  const strip = (
    <>
      <div className="ws__head">
        <Link className="ws__back" href={back}>{t.back}</Link>
        <h1 className="ws__title">{event.name}</h1>
        <p className="ws__meta">
          {nt.kinds[event.kind]}
          {event.place && ` · ${event.place}`}
          {dates.length > 0 && <> · <span className="num">{[...new Set(dates)].join(' – ')}</span></>}
        </p>
      </div>
      {sacuvano && <p role="status">{t.saved}</p>}
      {greska && <p role="alert">{t.invalid}</p>}
    </>
  );

  const table = rows.length ? (
    <table className="event-table">
      <thead>
        <tr>
          <th scope="col">{t.day}</th>
          <th scope="col">{t.part}</th>
          <th scope="col">{t.session}</th>
          <th scope="col" className="num">{t.series}</th>
          <th scope="col" className="num">{t.avg}</th>
          <th scope="col" className="num">{t.total}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const dec = DISCIPLINES[r.discipline].decimal;
          return (
            <tr key={r.id} data-testid="event-session">
              <td className="num">{day(r.trainedOn)}</td>
              <td>{nt.stages[r.stage]}</td>
              <td>
                <Link href={`/trening/${r.id}`}>{r.name}</Link>
                {mixed && <span className="rows__muted"> · {DISCIPLINES[r.discipline].nameSr}</span>}
              </td>
              <td className="num">{r.series || '—'}</td>
              <td className="num">{fmt(r.avgSeries, true)}</td>
              <td className="num event-table__total" title={r.stage === 'finale' ? t.finalNote : undefined}>{fmt(r.total, dec || r.stage === 'finale')}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  ) : (
    <p className="panel__empty">{t.none}</p>
  );

  const edit = (
    <form action={updateEventForm} className="stack">
      <input type="hidden" name="id" value={event.id} />
      <label>{t.name}<input name="name" defaultValue={event.name} required /></label>
      <label>{t.place}<input name="place" defaultValue={event.place} /></label>
      <label>{t.from}<input type="date" name="starts_on" defaultValue={event.starts_on ?? ''} /></label>
      <label>{t.to}<input type="date" name="ends_on" defaultValue={event.ends_on ?? ''} /></label>
      <button type="submit">{t.save}</button>
    </form>
  );

  return (
    <Workspace
      label={event.name}
      strip={strip}
      rows={1}
      panels={[
        { id: 'sessions', title: t.sessions, range: String(rows.length), col: profile ? '1 / 9' : '1 / 13', row: '1 / 2', flush: true, children: table },
        ...(profile ? [{ id: 'edit', title: t.edit, col: '9 / 13', row: '1 / 2', children: edit }] : []),
      ]}
    />
  );
}
