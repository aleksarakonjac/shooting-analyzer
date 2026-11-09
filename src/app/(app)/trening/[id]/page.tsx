import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DeleteTrainingButton } from '@/components/DeleteTrainingButton';
import { FlagBadge } from '@/components/FlagBadge';
import { GroupPlot } from '@/components/GroupPlot';
import { FinalEntry } from '@/components/FinalEntry';
import { FinalsList, type FinalRow } from '@/components/FinalsList';
import { HrOverlay } from '@/components/HrOverlay';
import { LanePlate } from '@/components/LanePlate';
import { ShotTimeline } from '@/components/ShotTimeline';
import { getSessionProfile } from '@/lib/auth/session';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import { isFinalDiscipline } from '@/lib/finals/format';
import type { DisciplineId } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { groupByPosition } from '@/lib/import/draft';
import { matchTotal, shotWindow } from '@/lib/report/derive';
import { createClient } from '@/lib/supabase/server';
import { updateTrainingForm } from '@/lib/trainings';

interface ShotRow { idx: number; value: number; t_ms: number | null }
interface SeriesRow {
  id: string; idx: number; position: 'kneeling' | 'prone' | 'standing' | null;
  total: number | null; total_decimal: number | null; mpi_x: number | null; mpi_y: number | null;
  group_mm: number | null; shots: ShotRow[];
}
interface TrainingRow {
  id: string; name: string; discipline: DisciplineId; trained_on: string; place: string; notes: string;
  matches: { id: string; label: string; align_state: 'proposed' | 'confirmed'; series: SeriesRow[] }[];
  loose_shots: { kind: 'warmup' | 'attempt'; t_ms: number }[];
  hr_samples_ref: { offset_ms: number } | { offset_ms: number }[] | null;
  source_files: { kind: string; storage_path: string }[];
  finals: FinalRow[];
}

export default function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ izmena?: string }>;
}) {
  return (
    <div className="page">
      <Suspense fallback={null}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ izmena?: string }> }) {
  const [{ id }, { izmena }] = await Promise.all([params, searchParams]);
  const profile = await getSessionProfile();
  const supabase = await createClient();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase
    .from('trainings')
    .select(
      'id,name,discipline,trained_on,place,notes,' +
        'matches(id,label,align_state,series(id,idx,position,total,total_decimal,mpi_x,mpi_y,group_mm,shots(idx,value,t_ms))),' +
        'loose_shots(kind,t_ms),hr_samples_ref(offset_ms),source_files(kind,storage_path),' +
        'finals(id,placement,eliminated_after_shot,created_at,final_shots(idx,stage_idx,value))',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const tr = data as unknown as TrainingRow | null;
  if (!tr) notFound();

  const t = sr.report;
  const cfg = DISCIPLINES[tr.discipline];
  const hrRef = Array.isArray(tr.hr_samples_ref) ? tr.hr_samples_ref[0] : tr.hr_samples_ref;
  const tcx = tr.source_files.find((f) => f.kind === 'tcx')?.storage_path ?? null;
  const allShots = tr.matches.flatMap((m) => m.series.flatMap((s) => s.shots));
  const win = shotWindow([...allShots.map((s) => s.t_ms), ...tr.loose_shots.map((s) => s.t_ms)], 60_000);
  const warmups = tr.loose_shots.filter((s) => s.kind === 'warmup').length;
  const attempts = tr.loose_shots.length - warmups;
  const canEdit = profile !== null;

  return (
    <article className="report">
      <header>
        <h1>{tr.name}</h1>
        <p className="report__meta">
          {cfg.nameSr} · {tr.trained_on}
          {tr.place && ` · ${tr.place}`}
        </p>
        {tr.notes && <p>{tr.notes}</p>}
        {canEdit && (
          <div className="report__actions">
            {izmena ? (
              <form action={updateTrainingForm} className="report__edit">
                <input type="hidden" name="id" value={tr.id} />
                <label>{sr.newTraining.name}<input name="name" defaultValue={tr.name} /></label>
                <label>{sr.newTraining.place}<input name="place" defaultValue={tr.place} /></label>
                <label>{sr.newTraining.notes}<input name="notes" defaultValue={tr.notes} /></label>
                <div>
                  <button type="submit">{t.save}</button>{' '}
                  <Link href={`/trening/${tr.id}`}>{t.cancel}</Link>
                </div>
              </form>
            ) : (
              <>
                <Link href={`/trening/${tr.id}?izmena=1`}>{t.edit}</Link>
                <DeleteTrainingButton id={tr.id} />
              </>
            )}
          </div>
        )}
      </header>

      {tr.matches.length === 0 && <p>{t.noMatch}</p>}
      {tr.matches.map((m) => {
        const series = [...m.series].sort((a, b) => a.idx - b.idx);
        const shots = series.flatMap((s) => [...s.shots].sort((a, b) => a.idx - b.idx));
        const timeline = shots.map((s, i) => ({ idx: i + 1, value: Number(s.value), tMs: s.t_ms === null ? null : Number(s.t_ms) }));
        return (
          <section key={m.id} className="report__match" aria-label={m.label || t.series}>
            <div className="report__head">
              <LanePlate label={t.total} value={matchTotal(series, cfg.decimal).toFixed(cfg.decimal ? 1 : 0)} />
              <FlagBadge state={m.align_state} />
            </div>
            <h2>{t.timeline}</h2>
            <ShotTimeline shots={timeline} decimal={cfg.decimal} />
            <h2>{t.series}</h2>
            {groupByPosition(series).map((g, gi) => (
              <div key={gi}>
                {g.position && <h3>{sr.newTraining.positionGroup[g.position]}</h3>}
                {g.series.map((s) => (
                  <div key={s.id} className="report__series" data-testid="series">
                    <div className="report__series-head">
                      <h4>{t.seriesLabel(s.idx)}</h4>
                      <strong>{cfg.decimal ? Number(s.total_decimal ?? s.total ?? 0).toFixed(1) : (s.total ?? 0)}</strong>
                    </div>
                    <div className="report__series-body">
                      <GroupPlot
                        mpi={s.mpi_x !== null && s.mpi_y !== null ? { x: Number(s.mpi_x), y: Number(s.mpi_y) } : null}
                        groupMm={s.group_mm === null ? null : Number(s.group_mm)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        );
      })}

      {isFinalDiscipline(tr.discipline) && (
        <section aria-labelledby="finals-title">
          <h2 id="finals-title">{sr.finals.title}</h2>
          <FinalsList trainingId={tr.id} discipline={tr.discipline} finals={tr.finals} canEdit={canEdit} />
          {canEdit && profile && (
            <>
              <h3>{sr.finals.add}</h3>
              <FinalEntry trainingId={tr.id} discipline={tr.discipline} tz={profile.tz} />
            </>
          )}
        </section>
      )}

      <section aria-labelledby="hr-title">
        <h2 id="hr-title">{t.hr}</h2>
        <HrOverlay tcxPath={tcx} offsetMs={Number(hrRef?.offset_ms ?? 0)} window={win} />
      </section>

      <section aria-labelledby="loose-title">
        <h2 id="loose-title">{t.loose}</h2>
        {tr.loose_shots.length === 0 ? (
          <p>{t.looseNone}</p>
        ) : (
          <p className="report__loose">
            <span data-testid="warmup">{t.warmup(warmups)}</span>
            <span data-testid="attempt">{t.attempt(attempts)}</span>
          </p>
        )}
      </section>
    </article>
  );
}
