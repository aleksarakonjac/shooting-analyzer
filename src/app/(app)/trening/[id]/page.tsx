import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DeleteTrainingButton } from '@/components/DeleteTrainingButton';
import { FinalEntry } from '@/components/FinalEntry';
import { FinalsList, type FinalRow } from '@/components/FinalsList';
import { FlagBadge } from '@/components/FlagBadge';
import { LanePlate } from '@/components/LanePlate';
import { ReportWorkspace } from '@/components/report/ReportWorkspace';
import { getSessionProfile } from '@/lib/auth/session';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { isFinalDiscipline } from '@/lib/finals/format';
import { sr } from '@/lib/i18n/sr';
import { shotWindow } from '@/lib/report/derive';
import { buildReportView, type RawSeries } from '@/lib/report/viewModel';
import { createClient } from '@/lib/supabase/server';
import { confirmAlignmentForm } from '@/lib/trainings';
import { SessionEditor } from '@/components/SessionEditor';
import { Workspace } from '@/components/Workspace';
import { shooterEvents } from '@/lib/events';
import { recentPlaces } from '@/lib/import/places';

interface TrainingRow {
  id: string; shooter_id: string; name: string; discipline: DisciplineId; trained_on: string; place: string; notes: string;
  started_at: string | null; ended_at: string | null;
  kind: 'trening' | 'kontrolni' | 'takmicenje';
  stage: 'slobodno' | 'eliminacije' | 'kvalifikacije' | 'finale';
  tz: string;
  events: { id: string; name: string } | null;
  matches: { id: string; label: string; align_state: 'proposed' | 'confirmed'; series: RawSeries[] }[];
  loose_shots: { kind: 'warmup' | 'attempt'; t_ms: number }[];
  hr_samples_ref: { offset_ms: number; zone: string | null } | { offset_ms: number; zone: string | null }[] | null;
  source_files: { kind: string; storage_path: string }[];
  finals: FinalRow[];
}

export default function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ izmena?: string; greska?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const SOURCE_LABEL: Record<string, string> = { sius_csv: 'SIUS CSV', sius_pdf: 'SIUS PDF', scatt: 'SCATT', tcx: 'Puls (TCX)' };

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ izmena?: string; greska?: string }> }) {
  const [{ id }, { izmena, greska }] = await Promise.all([params, searchParams]);
  const profile = await getSessionProfile();
  const supabase = await createClient();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase
    .from('trainings')
    .select(
      'id,shooter_id,name,discipline,trained_on,place,notes,started_at,ended_at,kind,stage,tz,events(id,name),' +
        'matches(id,label,align_state,series(id,idx,position,total,total_decimal,mpi_x,mpi_y,group_mm,shots(idx,value,inner,t_ms))),' +
        'loose_shots(kind,t_ms),hr_samples_ref(offset_ms,zone),source_files(kind,storage_path),' +
        'finals(id,placement,eliminated_after_shot,created_at,final_shots(idx,stage_idx,value))',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const tr = data as unknown as TrainingRow | null;
  if (!tr) notFound();

  const t = sr.report;
  const cfg = DISCIPLINES[tr.discipline];
  // Clock times read in the venue's zone; the zone is named when it is not the viewer's own.
  const tz = tr.tz;
  const viewerTz = profile?.tz ?? tz;
  const nt = sr.newTraining;
  // A training holds one match in practice; a second match would follow the first in the same board.
  const match = tr.matches[0] ?? null;
  const view = buildReportView(tr.matches.flatMap((m) => m.series), tr.discipline);
  const hrRef = Array.isArray(tr.hr_samples_ref) ? tr.hr_samples_ref[0] : tr.hr_samples_ref;
  const tcx = tr.source_files.find((f) => f.kind === 'tcx')?.storage_path ?? null;
  const allShots = view.series.flatMap((s) => s.shots);
  const win = shotWindow([...allShots.map((s) => s.tMs), ...tr.loose_shots.map((s) => Number(s.t_ms))], 60_000);
  const warmups = tr.loose_shots.filter((s) => s.kind === 'warmup').length;
  const attempts = tr.loose_shots.length - warmups;
  const canEdit = profile !== null;
  const date = new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${tr.trained_on}T00:00:00Z`));
  const hm = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso)) : null;
  const clock = tr.started_at || tr.ended_at ? `${hm(tr.started_at) ?? '—'}–${hm(tr.ended_at) ?? '—'}` : null;
  const sessionLabel = [tr.kind !== 'trening' ? nt.kinds[tr.kind] : null, tr.stage !== 'slobodno' ? nt.stages[tr.stage] : null]
    .filter(Boolean)
    .join(', ');

  if (canEdit && izmena) {
    const [events, places] = await Promise.all([shooterEvents(tr.shooter_id), recentPlaces(tr.shooter_id)]);
    const wall = (iso: string | null) => hm(iso) ?? '';
    return (
      <Workspace
        label={t.editTitle}
        rows={1}
        strip={
          <div className="ws__head">
            <Link className="ws__back" href={`/trening/${tr.id}`}>{tr.name}</Link>
            <h1 className="ws__title">{t.editTitle}</h1>
          </div>
        }
        panels={[
          {
            id: 'edit',
            title: t.editTitle,
            col: '1 / 9',
            row: '1 / 2',
            children: (
              <SessionEditor
                invalid={Boolean(greska)}
                events={events}
                places={places}
                value={{
                  id: tr.id,
                  name: tr.name,
                  place: tr.place,
                  notes: tr.notes,
                  kind: tr.kind,
                  stage: tr.stage,
                  tz: tr.tz,
                  eventName: tr.events?.name ?? '',
                  when: { date: tr.trained_on, from: wall(tr.started_at), to: wall(tr.ended_at) },
                }}
              />
            ),
          },
        ]}
      />
    );
  }

  const strip = (
    <>
      <div className="ws__head">
        <h1 className="ws__title">{tr.name}</h1>
        <p className="ws__meta">
          {!tr.name.includes(cfg.nameSr) && <>{cfg.nameSr} · </>}
          <span className="num">{date}</span>
          {clock && <> · <span className="num">{clock}</span></>}
          {clock && tz !== viewerTz && <span className="rows__muted"> ({tz})</span>}
          {tr.place && ` · ${tr.place}`}
          {sessionLabel && ` · ${sessionLabel}`}
          {tr.events && ` · ${tr.events.name}`}
        </p>
      </div>
      {view.series.length > 0 && <LanePlate label={t.total} value={view.total.toFixed(cfg.decimal ? 1 : 0)} variant="score" />}
      {view.series.length > 0 && (
        <p className="ws__figures">
          <span><strong className="num">{view.series.length}</strong> serija</span>
          <span><strong className="num">{view.shotCount}</strong> pogodaka</span>
        </p>
      )}
      {match && (
        <div className="align-state">
          <FlagBadge state={match.align_state} />
          {match.align_state === 'proposed' && canEdit && (
            <form action={confirmAlignmentForm}>
              <input type="hidden" name="match_id" value={match.id} />
              <input type="hidden" name="training_id" value={tr.id} />
              <button type="submit">
                {t.confirmShort}<span className="hide-phone">&nbsp;{t.confirmRest}</span>
              </button>
            </form>
          )}
        </div>
      )}
      {canEdit && (
        <div className="ws__strip-end hide-phone">
          <Link className="button button--quiet" href={`/trening/${tr.id}?izmena=1`}>{t.edit}</Link>
        </div>
      )}
    </>
  );

  const other = (
    <div className="other">
      <section aria-labelledby="loose-title">
        <h3 id="loose-title" className="other__title">{t.loose}</h3>
        {tr.loose_shots.length === 0 ? (
          <p className="panel__empty">{t.looseNone}</p>
        ) : (
          <p className="report__loose">
            <span data-testid="warmup">{t.warmup(warmups)}</span>
            <span data-testid="attempt">{t.attempt(attempts)}</span>
          </p>
        )}
      </section>
      <section aria-labelledby="notes-title">
        <h3 id="notes-title" className="other__title">{t.notes}</h3>
        {tr.notes ? <p>{tr.notes}</p> : <p className="panel__empty">{t.noNotes}</p>}
      </section>
      <section aria-labelledby="src-title">
        <h3 id="src-title" className="other__title">{t.sources}</h3>
        <ul className="other__files">
          {tr.source_files.map((f) => <li key={f.storage_path}>{SOURCE_LABEL[f.kind] ?? f.kind}</li>)}
          {tr.source_files.length === 0 && <li className="panel__empty">—</li>}
        </ul>
      </section>
      {canEdit && (
        <p className="show-phone">
          <Link className="button button--quiet" href={`/trening/${tr.id}?izmena=1`}>{t.edit}</Link>
        </p>
      )}
      {canEdit && (
        <section aria-labelledby="danger-title" className="other__danger">
          <h3 id="danger-title" className="other__title">{t.dangerTitle}</h3>
          <DeleteTrainingButton id={tr.id} />
        </section>
      )}
    </div>
  );

  // Finals belong to a finale session only.
  const finals = tr.stage === 'finale' && isFinalDiscipline(tr.discipline) ? (
    <div className="finals">
      <FinalsList trainingId={tr.id} discipline={tr.discipline} finals={tr.finals} canEdit={canEdit} />
      {canEdit && profile && (
        <details className="finals__add">
          <summary className="button button--quiet">{sr.finals.add}</summary>
          <FinalEntry trainingId={tr.id} discipline={tr.discipline} tz={tz} />
        </details>
      )}
    </div>
  ) : null;

  return (
    <ReportWorkspace
      strip={strip}
      view={view}
      discipline={tr.discipline}
      tz={tz}
      hr={{ tcxPath: tcx, offsetMs: Number(hrRef?.offset_ms ?? 0), zone: hrRef?.zone ?? null, window: win }}
      finals={finals}
      other={other}
    />
  );
}
