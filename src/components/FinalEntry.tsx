'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FINAL_FORMATS,
  maxFinalShots,
  parseTimestamps,
  stageTotals,
  validateFinal,
  type FinalDiscipline,
} from '@/lib/finals/format';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/client';

const t = sr.finals;

/** "10,4" and "10.4" both work; an empty cell is "not fired". NaN marks text that is not a number. */
const toValue = (raw: string): number | null => {
  const s = raw.trim().replace(',', '.');
  return s === '' ? null : Number(s);
};

export function FinalEntry({ trainingId, discipline, tz }: { trainingId: string; discipline: FinalDiscipline; tz: string }) {
  const router = useRouter();
  const stages = FINAL_FORMATS[discipline];
  const max = maxFinalShots(discipline);
  const [cells, setCells] = useState<string[]>(() => Array(max).fill(''));
  const [placement, setPlacement] = useState('');
  const [eliminated, setEliminated] = useState('');
  const [stamps, setStamps] = useState('');
  const [tMs, setTMs] = useState<number[]>([]);
  const [message, setMessage] = useState<{ kind: 'error' | 'status'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const values = cells.map(toValue);
  // Trailing empty cells are not part of the final.
  const lastFilled = values.reduce<number>((n, v, i) => (v === null ? n : i + 1), 0);
  const totals = stageTotals(discipline, values.map((v) => (v === null || Number.isNaN(v) ? null : v)));

  const setCell = (i: number, raw: string) => setCells((c) => c.map((x, j) => (j === i ? raw : x)));

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
    setMessage(null);
    const shotValues = values.slice(0, lastFilled);
    const elim = eliminated.trim() === '' ? null : Number(eliminated);
    const place = placement.trim() === '' ? null : Number(placement);
    const check = validateFinal(discipline, shotValues, elim, place);
    if (!check.ok) {
      setMessage({ kind: 'error', text: t.errors[check.error] });
      return;
    }
    // idx and stage of every shot follow the format; stage_idx is derived once here.
    let stageIdx = 0;
    let left = stages[0].shots;
    const shots = shotValues.map((v, i) => {
      while (left === 0) left = stages[++stageIdx].shots;
      left -= 1;
      return { idx: i + 1, stage_idx: stageIdx, value: v, t_ms: tMs[i] ?? null };
    });
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('save_final', {
      payload: { training_id: trainingId, placement: place, eliminated_after_shot: elim, shots },
    });
    setBusy(false);
    if (error) {
      setMessage({ kind: 'error', text: t.errors.saveFailed });
      return;
    }
    setCells(Array(max).fill(''));
    setPlacement('');
    setEliminated('');
    setStamps('');
    setTMs([]);
    setMessage({ kind: 'status', text: t.saved });
    router.refresh();
  }

  return (
    <form className="final-entry" onSubmit={(e) => { e.preventDefault(); void save(); }}>
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
        {t.placement}
        <input inputMode="numeric" value={placement} onChange={(e) => setPlacement(e.target.value)} />
      </label>
      <label>
        {t.eliminated}
        <input inputMode="numeric" value={eliminated} onChange={(e) => setEliminated(e.target.value)} />
        <small>{t.eliminatedHint}</small>
      </label>
      <label>
        {t.timestamps}
        <textarea rows={4} value={stamps} onChange={(e) => setStamps(e.target.value)} />
      </label>
      <div>
        <button type="button" className="button--quiet" onClick={applyStamps}>{t.applyTimestamps}</button>{' '}
        <button type="submit" disabled={busy}>{t.save}</button>
      </div>
      {message && <p role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
    </form>
  );
}
