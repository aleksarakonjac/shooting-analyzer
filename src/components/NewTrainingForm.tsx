'use client';
import Link from 'next/link';
import { useMemo, useState, type ChangeEvent } from 'react';
import { proposeSelection, selectMatchShots, type MatchSelection } from '@/lib/alignment/align';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSiusResult } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { buildPreview, groupByPosition, parseManualSeries } from '@/lib/import/draft';
import { defaultTrainingName, saveTraining, type TrainingDraft } from '@/lib/import/saveTraining';
import { MAX_UPLOAD_BYTES, uploadSource, type SourceKind } from '@/lib/import/uploadSource';
import { decodeText } from '@/lib/parsers/decode';
import type { ScattData } from '@/lib/parsers/scatt';
import { parseSiusCsv } from '@/lib/parsers/siusCsv';
import { parseTcx, reinterpretAsZone, type HrSample } from '@/lib/parsers/tcx';
import { zoneShiftMs } from '@/lib/report/derive';
import { toInstantRange } from '@/lib/import/times';
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
}
interface HrData {
  samples: HrSample[];
  xml: string;
}

export function NewTrainingForm({
  userId,
  tz,
  today,
  places = [],
  title = sr.newTraining.title,
}: {
  userId: string;
  tz: string;
  today: string;
  /** Places entered before, offered as suggestions. */
  places?: string[];
  title?: string;
}) {
  const [disciplineId, setDisciplineId] = useState<DisciplineId | ''>('');
  const [trainedOn, setTrainedOn] = useState(today);
  const [dateTouched, setDateTouched] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [tab, setTab] = useState('file');
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');

  const [siusFile, setSiusFile] = useState<Loaded<ParsedSiusResult> | null>(null);
  const [manual, setManual] = useState<ParsedSiusResult | null>(null);
  const [scattLoaded, setScattLoaded] = useState<Loaded<ScattData> | null>(null);
  const [hrLoaded, setHrLoaded] = useState<Loaded<HrData> | null>(null);
  const [hrOffsetS, setHrOffsetS] = useState(0);
  const [hrZone, setHrZone] = useState(tz);
  // Reinterpreting the TCX clock moves every sample; the shift is saved inside the heart-rate offset.
  const [hrZoneShiftMs, setHrZoneShiftMs] = useState(0);

  const [selection, setSelection] = useState<MatchSelection | undefined>();
  const [ignored, setIgnored] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const [errors, setErrors] = useState<{ sius?: string; scatt?: string; hr?: string; save?: string }>({});
  const [askEmpty, setAskEmpty] = useState(false);
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

  const applySius = (s: ParsedSiusResult, file: File | null) => {
    setSiusFile(file ? { file, data: s } : null);
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
      const bytes = new Uint8Array(await file.arrayBuffer());
      let parsed: ParsedSiusResult;
      if (/\.pdf$/i.test(file.name) || String.fromCharCode(...bytes.slice(0, 4)) === '%PDF') {
        const [{ parseSiusPdf }, { configurePdfWorker }] = await Promise.all([
          import('@/lib/parsers/siusPdf'),
          import('@/lib/parsers/browser'),
        ]);
        configurePdfWorker();
        parsed = await parseSiusPdf(bytes);
      } else {
        parsed = parseSiusCsv(decodeText(bytes), { tz });
      }
      applySius(parsed, file);
    } catch {
      setErrors((e) => ({ ...e, sius: t.unreadable }));
    }
  };

  const onScatt = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file || tooLarge(file, 'scatt')) return;
    try {
      const [{ readScatt }, { scattBrowserOptions }] = await Promise.all([
        import('@/lib/parsers/scatt'),
        import('@/lib/parsers/browser'),
      ]);
      const data = await readScatt(new Uint8Array(await file.arrayBuffer()), scattBrowserOptions);
      setScattLoaded({ file, data });
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
      const xml = await file.text();
      const parsed = parseTcx(xml);
      setHrLoaded({ file, data: { samples: parsed.samples, xml } });
      setHrZoneShiftMs(0);
      setErrors((e) => ({ ...e, hr: undefined }));
    } catch {
      setErrors((e) => ({ ...e, hr: t.unreadable }));
    }
  };

  const applyZone = () => {
    if (!hrLoaded) return;
    const original = parseTcx(hrLoaded.data.xml).samples;
    const moved = reinterpretAsZone(hrLoaded.data.xml, hrZone);
    setHrZoneShiftMs(zoneShiftMs(original, moved));
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
    setErrors((e) => ({ ...e, save: undefined }));
    const range = toInstantRange(trainedOn, timeFrom, timeTo, tz);
    const draft: TrainingDraft = {
      disciplineId,
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
      hrOffsetMs: hrOffsetS * 1000 + hrZoneShiftMs,
      confirmed,
    };
    try {
      const { trainingId } = await saveTraining(draft, userId);
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
      setSaved({ id: trainingId, failedUploads });
    } catch {
      setErrors((e) => ({ ...e, save: t.saveFailed }));
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    if (!disciplineId) return;
    if (!sius && !scatt && !hr) setAskEmpty(true);
    else void doSave();
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

  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium', timeZone: tz });
  const aligned = preview?.shots ?? [];
  const cfg = disciplineId ? DISCIPLINES[disciplineId] : null;
  const shotTotal = sius ? sius.series.reduce((a, s) => a + s.shots.length, 0) : 0;
  const backwards = Boolean(timeFrom && timeTo && timeTo < timeFrom);
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
        {askEmpty ? (
          <div role="alertdialog" aria-label={t.emptyConfirm} className="strip-confirm">
            <p>{t.emptyConfirm}</p>
            <button type="button" onClick={() => void doSave()}>{t.emptyYes}</button>
            <button type="button" className="button--quiet" onClick={() => setAskEmpty(false)}>{t.emptyNo}</button>
          </div>
        ) : (
          <button type="submit" form="new-training" disabled={!disciplineId || saving || backwards}>
            {saving ? t.saving : t.save}
          </button>
        )}
      </div>
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

  const results = (
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
            range: sius ? `${sius.series.length} serija · ${shotTotal} pogodaka` : cfg?.nameSr,
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
