import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DeleteTrainingButton } from '@/components/DeleteTrainingButton';
import { FinalEntry } from '@/components/FinalEntry';
import { FinalsList, type FinalRow } from '@/components/FinalsList';
import { ReplaySettingsSection } from '@/components/report/replaySettings';
import { FlagBadge } from '@/components/FlagBadge';
import { LanePlate } from '@/components/LanePlate';
import { ReportWorkspace } from '@/components/report/ReportWorkspace';
import { MoreMenu } from '@/components/report/MoreMenu';
import { getSessionProfile } from '@/lib/auth/session';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { isFinalDiscipline } from '@/lib/finals/format';
import { sr } from '@/lib/i18n/sr';
import { shotWindow } from '@/lib/report/derive';
import { pipTopFor } from '@/lib/report/target';
import { buildReportView, type RawSeries } from '@/lib/report/viewModel';
import { createClient } from '@/lib/supabase/server';
import { confirmAlignmentForm } from '@/lib/trainings';
import { storedMismatch, type StoredSelection } from '@/lib/alignment/align';
import { MismatchNotice } from '@/components/MismatchNotice';
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
  matches: { id: string; label: string; align_state: 'proposed' | 'confirmed'; selection: StoredSelection | null; series: RawSeries[] }[];
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
  const { data: auth } = await supabase.auth.getUser();
  const replayPrefs = (auth.user?.user_metadata as { replay_prefs?: unknown } | undefined)?.replay_prefs;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase
    .from('trainings')
    .select(
      'id,shooter_id,name,discipline,trained_on,place,notes,started_at,ended_at,kind,stage,tz,events(id,name),' +
        'matches(id,label,align_state,selection,series(id,idx,position,total,total_decimal,mpi_x,mpi_y,group_mm,shots(id,idx,value,inner,t_ms,scatt_shot_id))),' +
        'hr_samples_ref(offset_ms,zone),source_files(kind,storage_path),' +
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
  const mismatch = match ? storedMismatch(match.selection, match.series.reduce((n, se) => n + se.shots.length, 0)) : null;
  // The pip rule is the viewer's own display setting.
  const { data: me } = profile ? await supabase.from('profiles').select('pip_top').eq('id', profile.id).maybeSingle() : { data: null };
  // Shot comments are read apart from the report, so the report still opens where the comment column does not exist yet.
  const shotIds = tr.matches.flatMap((m) => m.series.flatMap((se) => se.shots.flatMap((sh) => (sh.id ? [sh.id] : []))));
  const { data: commentRows, error: commentError } = shotIds.length
    ? await supabase.from('shots').select('id, comment').in('id', shotIds)
    : { data: [] as { id: string; comment: string | null }[], error: null };
  const commentsEnabled = !commentError;
  const commentOf = new Map((commentRows ?? []).map((r) => [r.id as string, (r.comment as string | null) ?? '']));
  const series = tr.matches.flatMap((m) => m.series).map((se) => ({ ...se, shots: se.shots.map((sh) => ({ ...sh, comment: sh.id ? commentOf.get(sh.id) ?? '' : '' })) }));
  const view = buildReportView(series, tr.discipline, pipTopFor(me?.pip_top as Record<string, unknown> | null, tr.discipline));
  const hrRef = Array.isArray(tr.hr_samples_ref) ? tr.hr_samples_ref[0] : tr.hr_samples_ref;
  const tcx = tr.source_files.find((f) => f.kind === 'tcx')?.storage_path ?? null;
  const scattPath = tr.source_files.find((f) => f.kind === 'scatt')?.storage_path ?? null;
  const allShots = view.series.flatMap((s) => s.shots);
  const win = shotWindow(allShots.map((s) => s.tMs), 60_000);
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

  const menu = (
    <MoreMenu>
      <section aria-labelledby="info-title" className="more__section">
        <h3 id="info-title" className="more__title">{t.info}</h3>
        <ul className="more__files">
          {tr.source_files.map((f) => <li key={f.storage_path}>{SOURCE_LABEL[f.kind] ?? f.kind}</li>)}
          {tr.source_files.length === 0 && <li className="panel__empty">—</li>}
        </ul>
        {match && <p>{t.alignInfo(match.align_state)}</p>}
      </section>
      <section aria-labelledby="notes-title" className="more__section">
        <h3 id="notes-title" className="more__title">{t.notes}</h3>
        {tr.notes ? <p>{tr.notes}</p> : <p className="panel__empty">{t.noNotes}</p>}
      </section>
      {scattPath && <ReplaySettingsSection />}
      {canEdit && (
        <div className="more__actions">
          <Link className="button button--quiet" href={`/trening/${tr.id}?izmena=1`}>{t.edit}</Link>
          <DeleteTrainingButton id={tr.id} />
        </div>
      )}
    </MoreMenu>
  );

  const strip = (
    <>
      <div className="ws__head ws__head--inline">
        <h1 className="ws__title ws__title--session">{tr.name}</h1>
        <p className="ws__meta">
          {!tr.name.includes(cfg.nameSr) && <>{cfg.nameSr} · </>}
          <span className="num">{date}</span>
          {clock && <> · <span className="num">{clock}</span></>}
          {clock && tz !== viewerTz && <span className="rows__muted"> ({tz})</span>}
          {tr.place && ` · ${tr.place}`}
          {sessionLabel && ` · ${sessionLabel}`}
          {tr.events && <> · <Link href={`/dogadjaj/${tr.events.id}`}>{tr.events.name}</Link></>}
        </p>
      </div>
      {greska === 'puls' && <p role="alert">{t.hrInvalid}</p>}
      {match?.align_state === 'proposed' && (
        <div className="align-state">
          <FlagBadge state="proposed" />
          {canEdit && mismatch !== null && mismatch !== 0 && <MismatchNotice mismatch={mismatch} />}
          {canEdit && (mismatch === null || mismatch === 0) && (
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
      <div className="ws__strip-end ws__strip-end--row">
        {view.series.length > 0 && (
          <div className="ws__score">
            <LanePlate label={t.total} value={view.total.toFixed(cfg.decimal ? 1 : 0)} variant="score" />
          </div>
        )}
        {menu}
      </div>
    </>
  );


  // A finale session is the final and nothing else: its stages, totals and elimination, and the entry beside them.
  if (tr.stage === 'finale') {
    const f = sr.finals;
    const fd = isFinalDiscipline(tr.discipline) ? tr.discipline : null;
    return (
      <Workspace
        label={t.panels}
        rows={1}
        strip={strip}
        panels={[
          {
            id: 'finals',
            title: f.title,
            range: tr.finals.length ? String(tr.finals.length) : undefined,
            col: canEdit && fd ? '1 / 8' : '1 / 13',
            row: '1 / 2',
            children: fd ? (
              <FinalsList trainingId={tr.id} discipline={fd} finals={tr.finals} canEdit={canEdit} />
            ) : (
              <p className="panel__empty">{sr.newTraining.finaleNoDiscipline}</p>
            ),
          },
          ...(canEdit && fd
            ? [{ id: 'final-entry', title: f.add, col: '8 / 13', row: '1 / 2', children: <FinalEntry trainingId={tr.id} discipline={fd} tz={tz} date={tr.trained_on} /> }]
            : []),
        ]}
      />
    );
  }

  return (
    <ReportWorkspace
      strip={strip}
      view={view}
      discipline={tr.discipline}
      tz={tz}
      hr={{ tcxPath: tcx, offsetMs: Number(hrRef?.offset_ms ?? 0), zone: hrRef?.zone ?? null, window: win }}
      scattPath={scattPath}
      trainingId={tr.id}
      canEdit={canEdit}
      replayPrefs={replayPrefs}
      commentsEnabled={commentsEnabled}
    />
  );
}
