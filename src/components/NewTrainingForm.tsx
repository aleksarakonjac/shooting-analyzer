'use client';
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
import { FlagBadge } from './FlagBadge';
import { MatchSelector } from './MatchSelector';
import { MismatchNotice } from './MismatchNotice';
import { SourceCard } from './SourceCard';

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

export function NewTrainingForm({ userId, tz, today }: { userId: string; tz: string; today: string }) {
  const [disciplineId, setDisciplineId] = useState<DisciplineId | ''>('');
  const [trainedOn, setTrainedOn] = useState(today);
  const [dateTouched, setDateTouched] = useState(false);
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [notes, setNotes] = useState('');

  const [siusFile, setSiusFile] = useState<Loaded<ParsedSiusResult> | null>(null);
  const [manual, setManual] = useState<ParsedSiusResult | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [scattLoaded, setScattLoaded] = useState<Loaded<ScattData> | null>(null);
  const [hrLoaded, setHrLoaded] = useState<Loaded<HrData> | null>(null);
  const [hrOffsetS, setHrOffsetS] = useState(0);
  const [hrZone, setHrZone] = useState(tz);

  const [selection, setSelection] = useState<MatchSelection | undefined>();
  const [ignored, setIgnored] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const [errors, setErrors] = useState<{ sius?: string; scatt?: string; hr?: string; manual?: string; save?: string }>({});
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
    setErrors((e) => ({ ...e, sius: undefined, manual: undefined }));
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

  const onManual = () => {
    if (!disciplineId) return;
    const r = parseManualSeries(disciplineId, manualText.split('\n'));
    if (!r.ok) {
      setErrors((e) => ({ ...e, manual: r.error === 'empty' ? t.manualEmpty : t.manualInvalid(r.line) }));
      return;
    }
    applySius(r.result, null);
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
      setErrors((e) => ({ ...e, hr: undefined }));
    } catch {
      setErrors((e) => ({ ...e, hr: t.unreadable }));
    }
  };

  const applyZone = () => {
    if (!hrLoaded) return;
    setHrLoaded({ ...hrLoaded, data: { ...hrLoaded.data, samples: reinterpretAsZone(hrLoaded.data.xml, hrZone) } });
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
    const draft: TrainingDraft = {
      disciplineId,
      trainedOn,
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
      <div role="status" className="saved" data-training-id={saved.id}>
        <h2>{t.savedTitle}</h2>
        <p>{t.savedLink}</p>
        {saved.failedUploads > 0 && <p role="alert">{t.uploadsFailed(saved.failedUploads)}</p>}
      </div>
    );
  }

  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium', timeZone: tz });
  const aligned = preview?.shots ?? [];
  let cursor = 0;

  return (
    <form
      className="new-training"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <section className="new-training__basics">
        <label>
          {t.discipline}
          <select
            required
            value={disciplineId}
            onChange={(e) => setDisciplineId(e.target.value as DisciplineId | '')}
          >
            <option value="">{t.chooseDiscipline}</option>
            {(Object.keys(DISCIPLINES) as DisciplineId[]).map((id) => (
              <option key={id} value={id}>
                {DISCIPLINES[id].nameSr}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.date}
          <input
            type="date"
            required
            value={trainedOn}
            onChange={(e) => {
              setTrainedOn(e.target.value);
              setDateTouched(true);
            }}
          />
        </label>
        <label>
          {t.name}
          <input value={name} placeholder={effectiveName} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {t.place}
          <input value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
        <label className="new-training__wide">
          {t.notes}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>

      <SourceCard title={t.siusTitle} hint={t.siusHint} error={errors.sius}>
        <label>
          {t.siusFile}
          <input type="file" accept=".csv,.pdf,text/csv,application/pdf" onChange={onSius} />
        </label>
        {sius && (
          <p className="source-card__loaded">
            {t.loaded}: {siusFile?.file.name ?? t.manualToggle} —{' '}
            {t.siusSummary(
              sius.series.length,
              sius.series.reduce((a, s) => a + s.shots.length, 0),
              String(sius.totalDecimal ?? sius.total),
            )}{' '}
            <button type="button" className="button--quiet" onClick={removeSius}>
              {t.remove}
            </button>
          </p>
        )}
        <button type="button" className="button--quiet" onClick={() => setManualOpen((o) => !o)} aria-expanded={manualOpen}>
          {t.manualToggle}
        </button>
        {manualOpen && (
          <div className="new-training__manual">
            <label>
              {t.manualLabel}
              <textarea rows={6} value={manualText} onChange={(e) => setManualText(e.target.value)} />
            </label>
            <button type="button" onClick={onManual} disabled={!disciplineId}>
              {t.manualApply}
            </button>
            {errors.manual && <p role="alert">{errors.manual}</p>}
          </div>
        )}
      </SourceCard>

      <SourceCard title={t.scattTitle} hint={t.scattHint} error={errors.scatt}>
        <label>
          {t.scattFile}
          <input type="file" accept=".scatt-expert,application/octet-stream" onChange={onScatt} />
        </label>
        {scatt && (
          <p className="source-card__loaded">
            {t.loaded}: {scattLoaded?.file.name} — {t.scattSummary(scatt.shots.length)}{' '}
            <button type="button" className="button--quiet" onClick={removeScatt}>
              {t.remove}
            </button>
          </p>
        )}
      </SourceCard>

      <SourceCard title={t.hrTitle} hint={t.hrHint} error={errors.hr}>
        <label>
          {t.hrFile}
          <input type="file" accept=".tcx,application/xml,text/xml" onChange={onHr} />
        </label>
        {hrLoaded && (
          <>
            <p className="source-card__loaded">
              {t.loaded}: {hrLoaded.file.name} — {t.hrSamples(hrLoaded.data.samples.length)}
            </p>
            <label>
              {t.hrOffset}: <output>{hrOffsetS}</output>
              <input
                type="range"
                min={-120}
                max={120}
                step={1}
                value={hrOffsetS}
                onChange={(e) => setHrOffsetS(Number(e.target.value))}
              />
            </label>
            <div className="new-training__zone">
              <label>
                {t.hrZone}
                <select value={hrZone} onChange={(e) => setHrZone(e.target.value)}>
                  {[...new Set([tz, ...ZONES])].map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={applyZone}>
                {t.hrZoneApply}
              </button>
            </div>
          </>
        )}
      </SourceCard>

      {sius && (
        <section className="preview" aria-labelledby="preview-title">
          <h2 id="preview-title">{t.previewTitle}</h2>
          {scatt && (
            <>
              <div className="preview__state">
                <FlagBadge state={confirmed ? 'confirmed' : 'proposed'} />
                {confirmed && <span>{t.confirmedNote}</span>}
              </div>
              <MatchSelector
                shots={scatt.shots}
                selection={selection}
                defaultN={sius.series.reduce((a, s) => a + s.shots.length, 0)}
                onChange={changeSelection}
              />
              {selection && <MismatchNotice mismatch={preview?.countMismatch ?? 0} />}
              {aligned[0]?.scatt && (
                <p>
                  {t.firstScatt}:{' '}
                  <strong data-testid="first-scatt">{timeFmt.format(aligned[0].scatt.tMs)}</strong>
                </p>
              )}
              {selection && (
                <button
                  type="button"
                  onClick={() => setConfirmed(true)}
                  disabled={confirmed || preview?.countMismatch !== 0}
                >
                  {t.confirm}
                </button>
              )}
              <details>
                <summary>{t.skipTitle}</summary>
                <ul className="preview__skip">
                  {selectedScatt.map((s, i) => (
                    <li key={s.id}>
                      <label>
                        <input type="checkbox" checked={ignored.includes(s.id)} onChange={() => toggleIgnored(s.id)} />{' '}
                        {i + 1}. {timeFmt.format(s.tMs)}
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}

          {groupByPosition(sius.series).map((g, gi) => (
            <div key={gi} className="preview__group" data-testid="position-group">
              {g.position && <h3>{t.positionGroup[g.position]}</h3>}
              {g.series.map((s) => (
                <details key={s.index} open={gi === 0 && s.index === g.series[0].index}>
                  <summary>
                    {t.seriesLabel(s.index)} — {s.totalDecimal ?? s.total}
                  </summary>
                  <table className="preview__table">
                    <thead>
                      <tr>
                        <th>{t.shotCol}</th>
                        <th>{t.siusCol}</th>
                        <th>{t.scattCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.shots.map((shot, i) => {
                        const a = aligned[cursor++];
                        return (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{shot.value}</td>
                            <td>{a?.scatt ? timeFmt.format(a.scatt.tMs) : t.noScatt}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          ))}
        </section>
      )}

      {errors.save && <p role="alert">{errors.save}</p>}
      {askEmpty ? (
        <div role="alertdialog" aria-label={t.emptyConfirm} className="new-training__empty">
          <p>{t.emptyConfirm}</p>
          <button type="button" onClick={() => void doSave()}>
            {t.emptyYes}
          </button>{' '}
          <button type="button" className="button--quiet" onClick={() => setAskEmpty(false)}>
            {t.emptyNo}
          </button>
        </div>
      ) : (
        <button type="submit" disabled={!disciplineId || saving}>
          {saving ? t.saving : t.save}
        </button>
      )}
    </form>
  );
}
