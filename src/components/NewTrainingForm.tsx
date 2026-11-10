'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { proposeSelection, selectMatchShots, type MatchSelection } from '@/lib/alignment/align';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSiusResult } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { buildPreview, groupByPosition } from '@/lib/import/draft';
import { defaultTrainingName, replaceTrainingData, saveTraining, type SessionKind, type SessionStage, type TrainingDraft } from '@/lib/import/saveTraining';
import { findImported, type ImportedMatch } from '@/lib/import/duplicates';
import { MAX_UPLOAD_BYTES, sha256Hex, uploadSource, type SourceKind } from '@/lib/import/uploadSource';
import { decodeText } from '@/lib/parsers/decode';
import type { ScattData } from '@/lib/parsers/scatt';
import { parseSiusCsv } from '@/lib/parsers/siusCsv';
import { parseTcx, reinterpretAsZone, type HrSample } from '@/lib/parsers/tcx';
import { hrCoverage } from '@/lib/report/derive';
import { zoneNames } from '@/lib/time/zone';
import { isRepeatedHour, toInstantRange, type Fold } from '@/lib/import/times';
import { isFinalDiscipline } from '@/lib/finals/format';
import { createClient } from '@/lib/supabase/client';
import type { EventOption } from '@/lib/eventTypes';
import { FinalEntry, type FinalDraft } from './FinalEntry';
import { Segmented } from './ui/Segmented';
import { ManualEntry } from './entry/ManualEntry';
import { PasteEntry } from './entry/PasteEntry';
import { FlagBadge } from './FlagBadge';
import { LanePlate } from './LanePlate';
import { MatchSelector } from './MatchSelector';
import { MismatchNotice } from './MismatchNotice';
import { SourceCard } from './SourceCard';
import { Workspace } from './Workspace';
import { ComboField } from './ui/ComboField';
import { DateTimeRange } from './ui/DateTimeRange';
import { FileField } from './ui/FileField';
import { NumberStepper } from './ui/NumberStepper';
import { SegTabs } from './ui/SegTabs';
import { Select } from './ui/Select';

const t = sr.newTraining;
const ZONES = ['Europe/Belgrade', 'UTC', 'Europe/London', 'America/New_York'];

interface Loaded<T> {
  file: File;
  data: T;
  /** Content hash, to find an earlier import of the same file. */
  sha: string;
}
interface HrData {
  samples: HrSample[];
  xml: string;
  /** The file's clock carried no zone; times were read as UTC. */
  missingOffset: boolean;
}

/** A saved session opened for changing its files and alignment. */
export interface SessionEdit {
  trainingId: string;
  initial: {
    disciplineId: DisciplineId;
    trainedOn: string;
    timeFrom: string;
    timeTo: string;
    kind: SessionKind;
    stage: SessionStage;
    eventName: string;
    tz: string;
    name: string;
    place: string;
    notes: string;
  };
  /** Stored original files of the session. */
  files: { kind: SourceKind; path: string }[];
  /** The saved result when it was typed or pasted (no SIUS file). */
  storedSius: ParsedSiusResult | null;
  selection: (MatchSelection & { ignoredScattIds?: number[] }) | null;
  confirmed: boolean;
  hrOffsetS: number;
  hrZone: string | null;
}

export function NewTrainingForm({
  userId,
  tz,
  today,
  places = [],
  title = sr.newTraining.title,
  events = [],
  edit,
}: {
  /** Change a saved session instead of creating one: its files are loaded back into the form. */
  edit?: SessionEdit;
  /** The shooter's events, offered when the session belongs to a competition or control match. */
  events?: EventOption[];
  userId: string;
  tz: string;
  today: string;
  /** Places entered before, offered as suggestions. */
  places?: string[];
  title?: string;
}) {
  const init = edit?.initial;
  const router = useRouter();
  const [disciplineId, setDisciplineId] = useState<DisciplineId | ''>(init?.disciplineId ?? '');
  const [trainedOn, setTrainedOn] = useState(init?.trainedOn ?? today);
  const [dateTouched, setDateTouched] = useState(Boolean(edit));
  const [timeFrom, setTimeFrom] = useState(init?.timeFrom ?? '');
  const [timeTo, setTimeTo] = useState(init?.timeTo ?? '');
  const [tab, setTab] = useState('file');
  const [kind, setKind] = useState<SessionKind>(init?.kind ?? 'trening');
  const [stage, setStage] = useState<SessionStage>(init?.stage ?? 'slobodno');
  const [eventName, setEventName] = useState(init?.eventName ?? '');
  const [venueTz, setVenueTz] = useState(init?.tz ?? tz);
  const zones = useMemo(() => zoneNames(tz), [tz]);
  const [foldFrom, setFoldFrom] = useState<Fold>('earlier');
  const [foldTo, setFoldTo] = useState<Fold>('earlier');
  const [finalDraft, setFinalDraft] = useState<FinalDraft | null>(null);
  const onFinalDraft = useCallback((d: FinalDraft) => setFinalDraft(d), []);
  const [hrZoneChosen, setHrZoneChosen] = useState<string | null>(null);
  const [name, setName] = useState(init?.name ?? '');
  const [place, setPlace] = useState(init?.place ?? '');
  const [notes, setNotes] = useState(init?.notes ?? '');
  const [restoring, setRestoring] = useState(Boolean(edit));

  const [siusFile, setSiusFile] = useState<Loaded<ParsedSiusResult> | null>(null);
  const [manual, setManual] = useState<ParsedSiusResult | null>(null);
  const [scattLoaded, setScattLoaded] = useState<Loaded<ScattData> | null>(null);
  const [hrLoaded, setHrLoaded] = useState<Loaded<HrData> | null>(null);
  const [hrOffsetS, setHrOffsetS] = useState(edit?.hrOffsetS ?? 0);
  const [hrZone, setHrZone] = useState(edit?.hrZone ?? tz);

  const [selection, setSelection] = useState<MatchSelection | undefined>();
  const [ignored, setIgnored] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const [errors, setErrors] = useState<{ sius?: string; scatt?: string; hr?: string; save?: string }>({});
  const [askEmpty, setAskEmpty] = useState(false);
  const [dupes, setDupes] = useState<ImportedMatch[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; failedUploads: number } | null>(null);

  const sius = siusFile?.data ?? manual ?? undefined;
  const scatt = scattLoaded?.data;
  const hr = hrLoaded?.data.samples;
  const effectiveName = name.trim() || (disciplineId ? defaultTrainingName(trainedOn, disciplineId) : '');

  const preview = useMemo(
    () => (sius && scatt ? buildPreview(sius, scatt, selection, ignored) : undefined),
    [sius, scatt, selection, ignored],
  );
  const selectedScatt = useMemo(
    () => (scatt && selection ? selectMatchShots(scatt.shots, selection) : []),
    [scatt, selection],
  );

  const changeSelection = (next: MatchSelection | undefined) => {
    setSelection(next);
    setConfirmed(false);
  };
  const toggleIgnored = (id: number) => {
    setIgnored((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    setConfirmed(false);
  };

  /** Called whenever the SIUS result or SCATT file changes: fresh proposal, nothing confirmed. */
  const repropose = (s: ParsedSiusResult | undefined, sc: ScattData | undefined) => {
    setIgnored([]);
    setConfirmed(false);
    setSelection(s && sc ? proposeSelection(s, sc.shots) : undefined);
  };

  const applySius = (s: ParsedSiusResult, file: File | null, sha = '') => {
    setSiusFile(file ? { file, data: s, sha } : null);
    setManual(file ? null : s);
    setErrors((e) => ({ ...e, sius: undefined }));
    if (!disciplineId && s.disciplineId) setDisciplineId(s.disciplineId);
    if (!dateTouched && s.reportTime) {
      setTrainedOn(new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(s.reportTime));
    }
    repropose(s, scatt);
  };

  const tooLarge = (file: File, key: 'sius' | 'scatt' | 'hr'): boolean => {
    if (file.size <= MAX_UPLOAD_BYTES) return false;
    setErrors((e) => ({ ...e, [key]: t.tooLarge }));
    return true;
  };

  const onSius = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file || tooLarge(file, 'sius')) return;
    try {
      const { parsed, sha } = await parseSiusFile(file, tz);
      applySius(parsed, file, sha);
    } catch {
      setErrors((e) => ({ ...e, sius: t.unreadable }));
    }
  };

  const onScatt = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file || tooLarge(file, 'scatt')) return;
    try {
      const { data, sha } = await parseScattFile(file);
      setScattLoaded({ file, data, sha });
      setErrors((e) => ({ ...e, scatt: undefined }));
      repropose(sius, data);
    } catch {
      setErrors((e) => ({ ...e, scatt: t.unreadable }));
    }
  };

  const onHr = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file || tooLarge(file, 'hr')) return;
    try {
      const { data, sha } = await parseHrFile(file);
      setHrLoaded({ file, data, sha });
      setHrZoneChosen(null);
      setErrors((e) => ({ ...e, hr: undefined }));
    } catch {
      setErrors((e) => ({ ...e, hr: t.unreadable }));
    }
  };

  // Editing: load the stored files back once, then restore the saved alignment on top of the fresh proposal.
  const restored = useRef(false);
  useEffect(() => {
    if (!edit || restored.current) return;
    restored.current = true;
    (async () => {
      const supabase = createClient();
      const load = async (kind: SourceKind[]) => {
        const f = edit.files.find((x) => kind.includes(x.kind));
        if (!f) return null;
        const { data } = await supabase.storage.from('source-files').download(f.path);
        return data ? new File([data], f.path.split('/').pop() ?? f.kind, { type: data.type }) : null;
      };
      try {
        const [siusF, scattF, hrF] = await Promise.all([load(['sius_csv', 'sius_pdf']), load(['scatt']), load(['tcx'])]);
        const siusP = siusF ? await parseSiusFile(siusF, tz) : null;
        const scattP = scattF ? await parseScattFile(scattF) : null;
        const hrP = hrF ? await parseHrFile(hrF) : null;
        if (siusF && siusP) setSiusFile({ file: siusF, data: siusP.parsed, sha: siusP.sha });
        else if (edit.storedSius) setManual(edit.storedSius);
        if (scattF && scattP) setScattLoaded({ file: scattF, data: scattP.data, sha: scattP.sha });
        if (hrF && hrP) {
          const zone = edit.hrZone;
          setHrLoaded({ file: hrF, data: zone ? { ...hrP.data, samples: reinterpretAsZone(hrP.data.xml, zone) } : hrP.data, sha: hrP.sha });
          setHrZoneChosen(zone);
        }
        const sel = edit.selection;
        if (sel) {
          const { ignoredScattIds, ...rest } = sel;
          setSelection(rest);
          setIgnored(ignoredScattIds ?? []);
          setConfirmed(edit.confirmed);
        } else {
          const s = siusP?.parsed ?? edit.storedSius ?? undefined;
          setSelection(s && scattP ? proposeSelection(s, scattP.data.shots) : undefined);
        }
      } catch {
        setErrors((e) => ({ ...e, save: t.restoreFailed }));
      } finally {
        setRestoring(false);
      }
    })();
  }, [edit, tz]);

  const applyZone = () => {
    if (!hrLoaded) return;
    // The zone is stored and applied sample by sample on the report, so a clock change inside the file holds.
    const moved = reinterpretAsZone(hrLoaded.data.xml, hrZone);
    setHrZoneChosen(hrZone);
    setHrLoaded({ ...hrLoaded, data: { ...hrLoaded.data, samples: moved } });
  };

  const removeScatt = () => {
    setScattLoaded(null);
    repropose(sius, undefined);
  };
  const removeSius = () => {
    setSiusFile(null);
    setManual(null);
    repropose(undefined, scatt);
  };

  const doSave = async () => {
    if (!disciplineId) return;
    setSaving(true);
    setAskEmpty(false);
    setDupes(null);
    setErrors((e) => ({ ...e, save: undefined }));
    const range = toInstantRange(trainedOn, timeFrom, timeTo, venueTz, { from: foldFrom, to: foldTo });
    let eventId: string | null = null;
    try {
      eventId = kind === 'trening' ? null : await resolveEvent();
    } catch {
      setErrors((e) => ({ ...e, save: t.saveFailed }));
      setSaving(false);
      return;
    }
    const draft: TrainingDraft = {
      disciplineId,
      shooterId: userId,
      kind,
      stage,
      tz: venueTz,
      eventId,
      hrZone: hrZoneChosen,
      trainedOn,
      startedAt: range.startedAt,
      endedAt: range.endedAt,
      name: effectiveName,
      place,
      notes,
      sius,
      scatt,
      selection,
      ignoredScattIds: ignored,
      hr,
      hrOffsetMs: hrOffsetS * 1000,
      confirmed,
    };
    try {
      const { trainingId } = edit ? await replaceTrainingData(edit.trainingId, draft, userId) : await saveTraining(draft, userId);
      if (!edit && stage === 'finale' && finalDraft?.ok) {
        const { error } = await createClient().rpc('save_final', { payload: { training_id: trainingId, ...finalDraft.payload } });
        if (error) throw new Error(error.message);
      }
      const files: [File | undefined, SourceKind][] = [
        [siusFile?.file, siusFile && /pdf/i.test(siusFile.file.type + siusFile.file.name) ? 'sius_pdf' : 'sius_csv'],
        [scattLoaded?.file, 'scatt'],
        [hrLoaded?.file, 'tcx'],
      ];
      let failedUploads = 0;
      for (const [file, kind] of files) {
        if (!file) continue;
        try {
          await uploadSource(file, trainingId, kind);
        } catch {
          failedUploads++;
        }
      }
      if (edit) {
        await dropReplacedFiles(trainingId, [siusFile?.sha, scattLoaded?.sha, hrLoaded?.sha]);
        router.push(`/trening/${trainingId}`);
        router.refresh();
        return;
      }
      setSaved({ id: trainingId, failedUploads });
    } catch {
      setErrors((e) => ({ ...e, save: t.saveFailed }));
    } finally {
      setSaving(false);
    }
  };

  /** The event named in the form: an existing one of this kind by name, or a new one on the session's day. */
  async function resolveEvent(): Promise<string | null> {
    const wanted = eventName.trim();
    if (!wanted) return null;
    const hit = events.find((e) => e.kind === kind && e.name.toLocaleLowerCase('sr') === wanted.toLocaleLowerCase('sr'));
    if (hit) return hit.id;
    const { data, error } = await createClient()
      .from('events')
      .insert({ shooter_id: userId, kind, name: wanted, place, starts_on: trainedOn, ends_on: trainedOn })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  /** Before saving files: has the same content been imported already? Then ask first. */
  const checkThenSave = async () => {
    const picked = [siusFile, scattLoaded, hrLoaded]
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => ({ fileName: x.file.name, sha: x.sha }));
    let found: ImportedMatch[] = [];
    try {
      found = await findImported(userId, picked);
    } catch {
      found = []; // the check is a courtesy; a failed lookup must not block saving
    }
    if (found.length) setDupes(found);
    else void doSave();
  };

  const onSave = () => {
    if (!disciplineId) return;
    const hasFinal = stage === 'finale' && finalDraft?.ok === true;
    if (!sius && !scatt && !hr && !hasFinal) setAskEmpty(true);
    else if (edit) void doSave();
    else void checkThenSave();
  };

  if (saved) {
    return (
      <div className="page page--narrow">
        <div role="status" className="saved" data-training-id={saved.id}>
          <h2>{t.savedTitle}</h2>
          <p>
            <Link className="button" href={`/trening/${saved.id}`}>{t.savedLink}</Link>
          </p>
          {saved.failedUploads > 0 && <p role="alert">{t.uploadsFailed(saved.failedUploads)}</p>}
        </div>
      </div>
    );
  }

  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium', timeZone: venueTz });
  const aligned = preview?.shots ?? [];
  // Do the watch samples meet the shots? (SCATT times when aligned, else times from a paste.)
  const shotTimes = aligned.length ? aligned.map((a) => a.scatt?.tMs) : (sius?.series.flatMap((x) => x.shots.map((sh) => sh.tMs)) ?? []);
  const coverage = hr ? hrCoverage(hr, shotTimes, hrOffsetS * 1000) : null;
  const cfg = disciplineId ? DISCIPLINES[disciplineId] : null;
  const shotTotal = sius ? sius.series.reduce((a, s) => a + s.shots.length, 0) : 0;
  let cursor = 0;

  const strip = (
    <>
      <div className="ws__head">
        <h1 className="ws__title">{title}</h1>
        <p className="ws__meta">{effectiveName || t.chooseDiscipline}</p>
      </div>
      {sius && (
        <LanePlate
          label={sr.report.total}
          value={String(sius.totalDecimal ?? sius.total)}
          variant="score"
        />
      )}
      <div className="ws__strip-end">
        {dupes ? (
          <div role="alertdialog" aria-label={t.dupTitle} className="strip-confirm">
            <p>
              {t.dupTitle}{' '}
              {dupes.map((d, i) => (
                <span key={d.fileName}>
                  {i > 0 && ', '}
                  {d.fileName} → <Link href={`/trening/${d.trainingId}`}>{d.trainingName}</Link>
                </span>
              ))}
            </p>
            <button type="button" onClick={() => void doSave()}>{t.dupYes}</button>
            <button type="button" className="button--quiet" onClick={() => setDupes(null)}>{t.emptyNo}</button>
          </div>
        ) : askEmpty ? (
          <div role="alertdialog" aria-label={t.emptyConfirm} className="strip-confirm">
            <p>{t.emptyConfirm}</p>
            <button type="button" onClick={() => void doSave()}>{t.emptyYes}</button>
            <button type="button" className="button--quiet" onClick={() => setAskEmpty(false)}>{t.emptyNo}</button>
          </div>
        ) : (
          <button type="submit" form="new-training" disabled={!disciplineId || saving || restoring}>
            {saving ? t.saving : edit ? t.editSave : t.save}
          </button>
        )}
      </div>
      {restoring && <p role="status" className="strip-alert">{t.restoring}</p>}
      {errors.save && <p role="alert" className="strip-alert">{errors.save}</p>}
    </>
  );

  const basics = (
    <div className="form-grid">
      <div className="span-2">
        <Select
          label={t.discipline}
          placeholder={t.chooseDiscipline}
          isRequired
          value={disciplineId || null}
          onChange={(id) => setDisciplineId(id as DisciplineId)}
          items={(Object.keys(DISCIPLINES) as DisciplineId[]).map((id) => ({ id, label: DISCIPLINES[id].nameSr }))}
        />
      </div>
      <div className="span-2">
        <Segmented
          label={t.kind}
          value={kind}
          onChange={setKind}
          options={(['trening', 'kontrolni', 'takmicenje'] as const).map((id) => ({ id, label: t.kinds[id] }))}
        />
      </div>
      <div className="span-2">
        <Segmented
          label={t.stage}
          value={stage}
          onChange={setStage}
          options={(['slobodno', 'eliminacije', 'kvalifikacije', 'finale'] as const).map((id) => ({ id, label: t.stages[id] }))}
        />
      </div>
      {kind !== 'trening' && (
        <div className="span-2">
          <ComboField
            label={t.event}
            value={eventName}
            onChange={setEventName}
            suggestions={events.filter((e) => e.kind === kind).map((e) => e.name)}
            description={t.eventHint}
          />
        </div>
      )}
      <div className="span-2">
        <DateTimeRange
          label={t.dateTime}
          name="trained"
          today={today}
          value={{ date: trainedOn, from: timeFrom, to: timeTo }}
          onChange={(v) => {
            if (v.date !== trainedOn) setDateTouched(true);
            setTrainedOn(v.date);
            setTimeFrom(v.from);
            setTimeTo(v.to);
          }}
        />
      </div>
      {(isRepeatedHour(trainedOn, timeFrom, venueTz) || isRepeatedHour(trainedOn, timeTo, venueTz)) && (
        <div className="span-2 ui-fold">
          {isRepeatedHour(trainedOn, timeFrom, venueTz) && (
            <Segmented label={t.foldFrom} value={foldFrom} onChange={setFoldFrom}
              options={[{ id: 'earlier', label: t.foldEarlier }, { id: 'later', label: t.foldLater }]} />
          )}
          {isRepeatedHour(trainedOn, timeTo, venueTz) && (
            <Segmented label={t.foldTo} value={foldTo} onChange={setFoldTo}
              options={[{ id: 'earlier', label: t.foldEarlier }, { id: 'later', label: t.foldLater }]} />
          )}
        </div>
      )}
      <div className="span-2">
        <ComboField label={t.venueTz} value={venueTz} onChange={setVenueTz} suggestions={zones} description={t.venueTzHint} />
      </div>
      <label>
        {t.name}
        <input value={name} placeholder={effectiveName} onChange={(e) => setName(e.target.value)} />
      </label>
      <ComboField label={t.place} value={place} onChange={setPlace} suggestions={places} />
      <label className="span-2">
        {t.notes}
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
    </div>
  );

  const loadedSummary = sius && (
    <p className="source-card__loaded">
      {t.loaded}: {siusFile?.file.name ?? (tab === 'paste' ? t.tabPaste : t.tabManual)} —{' '}
      {t.siusSummary(sius.series.length, shotTotal, String(sius.totalDecimal ?? sius.total))}{' '}
      <button type="button" className="button--quiet" onClick={removeSius}>{t.remove}</button>
    </p>
  );

  const finaleResults =
    stage !== 'finale' || edit ? null : disciplineId && isFinalDiscipline(disciplineId) ? (
      <FinalEntry key={disciplineId} discipline={disciplineId} tz={venueTz} onDraft={onFinalDraft} />
    ) : (
      <p className="panel__empty">{t.finaleNoDiscipline}</p>
    );

  const results = finaleResults ?? (
    <div className="results">
      <SegTabs
        label={t.resultSource}
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'file',
            label: t.tabFile,
            content: (
              <SourceCard title={t.siusTitle} hint={t.siusHint} error={errors.sius}>
                <FileField label={t.siusFile} accept=".csv,.pdf,text/csv,application/pdf" onChange={onSius} fileName={siusFile?.file.name} />
              </SourceCard>
            ),
          },
          { id: 'manual', label: t.tabManual, content: <ManualEntry disciplineId={disciplineId} onApply={(r) => applySius(r, null)} /> },
          { id: 'paste', label: t.tabPaste, content: <PasteEntry disciplineId={disciplineId} date={trainedOn} tz={tz} onApply={(r) => applySius(r, null)} /> },
        ]}
      />
      {loadedSummary}
      {sius ? (
        <section className="preview" aria-label={t.previewTitle}>
          {groupByPosition(sius.series).map((g, gi) => (
            <div key={gi} className="preview__group" data-testid="position-group">
              {g.position && <h3 className="other__title">{t.positionGroup[g.position]}</h3>}
              {g.series.map((s) => (
                <details key={s.index} className="preview__series" open={gi === 0 && s.index === g.series[0].index}>
                  <summary>
                    <span>{t.seriesLabel(s.index)}</span>
                    <strong className="num">{s.totalDecimal ?? s.total}</strong>
                  </summary>
                  {s.shots.length > 0 ? (
                    <table className="shots">
                      <thead>
                        <tr><th>{t.shotCol}</th><th>{t.siusCol}</th><th>{t.scattCol}</th></tr>
                      </thead>
                      <tbody>
                        {s.shots.map((shot, i) => {
                          const a = aligned[cursor++];
                          const time = a?.scatt?.tMs ?? shot.tMs;
                          return (
                            <tr key={i}>
                              <td className="num">{i + 1}</td>
                              <td className="num">{shot.value}{shot.inner ? '*' : ''}</td>
                              <td className="num">{time ? timeFmt.format(time) : t.noScatt}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="panel__empty">{t.totalOnly}</p>
                  )}
                </details>
              ))}
            </div>
          ))}
        </section>
      ) : (
        <p className="panel__empty">{t.noResults}</p>
      )}
    </div>
  );

  const sources = (
    <div className="sources">
      <SourceCard title={t.scattTitle} hint={t.scattHint} error={errors.scatt}>
        <FileField label={t.scattFile} accept=".scatt-expert,application/octet-stream" onChange={onScatt} fileName={scattLoaded?.file.name} />
        {scatt && (
          <p className="source-card__loaded">
            {t.loaded}: {scattLoaded?.file.name} — {t.scattSummary(scatt.shots.length)}{' '}
            <button type="button" className="button--quiet" onClick={removeScatt}>{t.remove}</button>
          </p>
        )}
      </SourceCard>
      <SourceCard title={t.hrTitle} hint={t.hrHint} error={errors.hr}>
        <FileField label={t.hrFile} accept=".tcx,application/xml,text/xml" onChange={onHr} fileName={hrLoaded?.file.name} />
        {hrLoaded && (
          <>
            <p className="source-card__loaded">
              {t.loaded}: {hrLoaded.file.name} — {t.hrSamples(hrLoaded.data.samples.length)}
            </p>
            {coverage && coverage.inside > 0 && <p role="status">{t.hrCoverage(coverage.inside, coverage.total)}</p>}
            {coverage && coverage.inside === 0 && <p role="alert">{t.hrNoOverlap}</p>}
            {hrLoaded.data.missingOffset && <small>{t.hrMissingZone}</small>}
            <NumberStepper label={t.hrOffset} value={hrOffsetS} onChange={setHrOffsetS} min={-600} max={600} />
            <div className="new-training__zone">
              <Select
                label={t.hrZone}
                value={hrZone}
                onChange={setHrZone}
                items={[...new Set([tz, ...ZONES])].map((z) => ({ id: z, label: z }))}
              />
              <button type="button" className="button--quiet" onClick={applyZone}>{t.hrZoneApply}</button>
            </div>
          </>
        )}
      </SourceCard>
    </div>
  );

  const alignment =
    sius && scatt ? (
      <div className="align">
        <div className="preview__state">
          <FlagBadge state={confirmed ? 'confirmed' : 'proposed'} />
          {confirmed && <span>{t.confirmedNote}</span>}
        </div>
        <MatchSelector shots={scatt.shots} selection={selection} defaultN={shotTotal} onChange={changeSelection} />
        {selection && <MismatchNotice mismatch={preview?.countMismatch ?? 0} />}
        {aligned[0]?.scatt && (
          <p>
            {t.firstScatt}: <strong className="num" data-testid="first-scatt">{timeFmt.format(aligned[0].scatt.tMs)}</strong>
          </p>
        )}
        {selection && (
          <button type="button" onClick={() => setConfirmed(true)} disabled={confirmed || preview?.countMismatch !== 0}>
            {t.confirm}
          </button>
        )}
        <details>
          <summary>{t.skipTitle}</summary>
          <ul className="preview__skip">
            {selectedScatt.map((s, i) => (
              <li key={s.id}>
                <label className="check">
                  <input type="checkbox" checked={ignored.includes(s.id)} onChange={() => toggleIgnored(s.id)} /> {i + 1}. {timeFmt.format(s.tMs)}
                </label>
              </li>
            ))}
          </ul>
        </details>
      </div>
    ) : (
      <p className="panel__empty">{t.needBoth}</p>
    );

  return (
    <form
      id="new-training"
      className="entry"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <Workspace
        label={t.panels}
        strip={strip}
        rows={6}
        panels={[
          { id: 'basics', title: t.basics, col: '1 / 5', row: '1 / 7', children: basics },
          {
            id: 'results',
            title: t.results,
            range: stage === 'finale' ? t.stages.finale : sius ? `${sius.series.length} serija · ${shotTotal} pogodaka` : cfg?.nameSr,
            col: '5 / 9',
            row: '1 / 7',
            children: results,
          },
          { id: 'sources', title: t.sources, col: '9 / 13', row: '1 / 5', children: sources },
          { id: 'align', title: t.alignment, col: '9 / 13', row: '5 / 7', children: alignment },
        ]}
      />
    </form>
  );
}

/** Reads a SIUS CSV or PDF. */
async function parseSiusFile(file: File, tz: string): Promise<{ parsed: ParsedSiusResult; sha: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha = await sha256Hex(bytes);
  if (/\.pdf$/i.test(file.name) || String.fromCharCode(...bytes.slice(0, 4)) === '%PDF') {
    const [{ parseSiusPdf }, { configurePdfWorker }] = await Promise.all([import('@/lib/parsers/siusPdf'), import('@/lib/parsers/browser')]);
    configurePdfWorker();
    return { parsed: await parseSiusPdf(bytes), sha };
  }
  return { parsed: parseSiusCsv(decodeText(bytes), { tz }), sha };
}

async function parseScattFile(file: File): Promise<{ data: ScattData; sha: string }> {
  const [{ readScatt }, { scattBrowserOptions }] = await Promise.all([import('@/lib/parsers/scatt'), import('@/lib/parsers/browser')]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { data: await readScatt(bytes, scattBrowserOptions), sha: await sha256Hex(bytes) };
}

async function parseHrFile(file: File): Promise<{ data: HrData; sha: string }> {
  const xml = await file.text();
  const parsed = parseTcx(xml);
  return { data: { samples: parsed.samples, xml, missingOffset: parsed.missingOffset }, sha: await sha256Hex(new TextEncoder().encode(xml)) };
}

/** After an edit: stored files the session no longer uses (replaced or removed) are deleted with their rows. */
async function dropReplacedFiles(trainingId: string, keep: (string | undefined)[]): Promise<void> {
  const supabase = createClient();
  const { data } = await supabase.from('source_files').select('id, sha256, storage_path').eq('training_id', trainingId);
  const gone = ((data ?? []) as { id: string; sha256: string; storage_path: string }[]).filter((f) => !keep.includes(f.sha256));
  if (!gone.length) return;
  await supabase.storage.from('source-files').remove(gone.map((f) => f.storage_path));
  await supabase.from('source_files').delete().in('id', gone.map((f) => f.id));
}
