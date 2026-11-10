'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildFinalPayload,
  FINAL_FORMATS,
  maxFinalShots,
  parseFinalPaste,
  parseTimestamps,
  stageTotals,
  type FinalDiscipline,
  type FinalError,
  type FinalPayload,
} from '@/lib/finals/format';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/client';

const t = sr.finals;

/** "10,4" and "10.4" both work; an empty cell is "not fired". NaN marks text that is not a number. */
const toValue = (raw: string): number | null => {
  const s = raw.trim().replace(',', '.');
  return s === '' ? null : Number(s);
};

export type FinalDraft = { ok: true; payload: FinalPayload } | { ok: false; error: FinalError };

/**
 * The finals entry grid. With `trainingId` it saves on its own (report page). With `onDraft` it is part of
 * a larger form (a new finale session): it reports the current payload and has no save button of its own.
 */
export function FinalEntry({
  trainingId,
  discipline,
  tz,
  date,
  onDraft,
}: {
  trainingId?: string;
  discipline: FinalDiscipline;
  tz: string;
  /** Day the shots were fired (YYYY-MM-DD), for pasted times that carry no date. */
  date: string;
  onDraft?: (draft: FinalDraft) => void;
}) {
  const router = useRouter();
  const stages = FINAL_FORMATS[discipline];
  const max = maxFinalShots(discipline);
  const [cells, setCells] = useState<string[]>(() => Array(max).fill(''));
  const [placement, setPlacement] = useState('');
  const [stamps, setStamps] = useState('');
  const [tMs, setTMs] = useState<(number | null)[]>([]);
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const values = cells.map(toValue);
  // Trailing empty cells are not part of the final.
  const totals = stageTotals(discipline, values.map((v) => (v === null || Number.isNaN(v) ? null : v)));

  const setCell = (i: number, raw: string) => setCells((c) => c.map((x, j) => (j === i ? raw : x)));

  useEffect(() => {
    onDraft?.(buildFinalPayload(discipline, cells, placement, tMs));
  }, [onDraft, discipline, cells, placement, tMs]);

  function applyPaste() {
    const r = parseFinalPaste(pasted, date, tz, max);
    if (!r.ok) {
      setMessage({ kind: 'error', text: r.error === 'invalid' ? t.errors.invalidShotLine(r.line) : t.errors.tooMany });
      return;
    }
    setCells(Array.from({ length: max }, (_, i) => r.cells[i] ?? ''));
    setTMs(r.tMs);
    setMessage({ kind: 'status', text: t.pasteApplied(r.cells.length, r.tMs.filter((x) => x !== null).length) });
  }

  function applyStamps() {
    const r = parseTimestamps(stamps, tz, max);
    if (r.ok) {
      setTMs(r.tMs);
      setMessage({ kind: 'status', text: t.timestampsApplied(r.tMs.length) });
    } else {
      setMessage({ kind: 'error', text: r.error === 'invalid' ? t.errors.invalidTime(r.line) : t.errors.tooMany });
    }
  }

  async function save() {
    if (!trainingId) return;
    setMessage(null);
    const built = buildFinalPayload(discipline, cells, placement, tMs);
    if (!built.ok) {
      setMessage({ kind: 'error', text: t.errors[built.error] });
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('save_final', {
      payload: { training_id: trainingId, ...built.payload },
    });
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: t.errors.saveFailed });
      return;
    }
    setCells(Array(max).fill(''));
    setPlacement('');
    setStamps('');
    setPasted('');
    setTMs([]);
    setMessage({ kind: 'status', text: t.saved });
    router.refresh();
  }

  // Inside a larger form (a new finale session) this must not be a <form> of its own.
  const Root = onDraft ? 'div' : 'form';
  return (
    <Root
      className="final-entry"
      {...(onDraft ? {} : { onSubmit: (e: React.FormEvent) => { e.preventDefault(); void save(); } })}
    >
      {stages.map((stage, si) => {
        const from = stages.slice(0, si).reduce((n, s) => n + s.shots, 0);
        const seriesNo = stages.slice(0, si + 1).filter((s) => s.kind === 'series').length;
        const heading =
          stage.kind === 'singles'
            ? t.stageSingles(stage.shots)
            : stage.position
              ? t.stageSeriesPos(seriesNo, stage.shots, sr.newTraining.positionGroup[stage.position])
              : t.stageSeries(seriesNo, stage.shots);
        return (
          <fieldset key={si} className="final-entry__stage">
            <legend>{heading}</legend>
            <div className="final-entry__cells">
              {Array.from({ length: stage.shots }, (_, k) => (
                <input
                  key={k}
                  inputMode="decimal"
                  aria-label={t.shotLabel(from + k + 1)}
                  value={cells[from + k]}
                  onChange={(e) => setCell(from + k, e.target.value)}
                />
              ))}
            </div>
            <p className="report__meta">
              {t.stageTotal}: <strong className="num">{totals[si].total.toFixed(1)}</strong>
            </p>
          </fieldset>
        );
      })}

      <label>
        {t.pasteLabel}
        <textarea rows={5} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'1. 10.6 19:03:09\n2. 10,4 19:03:41'} />
      </label>
      <div>
        <button type="button" className="button--quiet" onClick={applyPaste} disabled={!pasted.trim()}>{t.pasteApply}</button>
      </div>
      <label>
        {t.placement}
        <input inputMode="numeric" value={placement} onChange={(e) => setPlacement(e.target.value)} />
      </label>
      <label>
        {t.timestamps}
        <textarea rows={4} value={stamps} onChange={(e) => setStamps(e.target.value)} />
      </label>
      <div>
        <button type="button" className="button--quiet" onClick={applyStamps}>{t.applyTimestamps}</button>{' '}
        {!onDraft && <button type="submit" disabled={busy}>{t.save}</button>}
      </div>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </Root>
  );
}
