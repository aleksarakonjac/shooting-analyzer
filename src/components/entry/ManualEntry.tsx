'use client';
import { useState } from 'react';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId, ParsedSiusResult } from '@/lib/domain/types';
import { sr } from '@/lib/i18n/sr';
import { buildManualResult, type ManualRow } from '@/lib/import/manualSeries';
import { round1 } from '@/lib/import/series';
import { NumberStepper } from '@/components/ui/NumberStepper';

const t = sr.newTraining;
const SHOTS = 10;
const emptyRow = (): ManualRow => ({ total: '', shots: Array(SHOTS).fill('') });

/** Number of series fired, a total per series, and any series opened up into its ten shots. */
export function ManualEntry({ disciplineId, onApply }: { disciplineId: DisciplineId | ''; onApply: (r: ParsedSiusResult) => void }) {
  const ref = disciplineId ? (DISCIPLINES[disciplineId].referenceMatchSeries ?? 6) : 6;
  const [rows, setRows] = useState<ManualRow[]>(() => Array.from({ length: ref }, emptyRow));
  const [open, setOpen] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dec = disciplineId ? DISCIPLINES[disciplineId].decimal : true;

  const setCount = (n: number) => {
    setRows((cur) => (n > cur.length ? [...cur, ...Array.from({ length: n - cur.length }, emptyRow)] : cur.slice(0, n)));
    setOpen((o) => o.filter((i) => i < n));
  };
  const update = (r: number, patch: Partial<ManualRow>) =>
    setRows((cur) => cur.map((row, i) => (i === r ? { ...row, ...patch } : row)));
  const shotSum = (row: ManualRow) => {
    const v = row.shots.filter((s) => s.trim() !== '').map((s) => Number(s.replace(',', '.'))).filter(Number.isFinite);
    return v.length ? round1(v.reduce((a, b) => a + b, 0)) : null;
  };

  const apply = () => {
    if (!disciplineId) return;
    const r = buildManualResult(disciplineId, rows);
    if (r.ok) {
      setError(null);
      onApply(r.result);
      return;
    }
    if (r.error === 'empty') setError(t.manualEmpty);
    else if (r.error === 'shot') setError(t.manualShot(r.row, r.shot));
    else setError(r.error === 'missing' ? t.manualMissing(r.row) : t.manualTotal(r.row));
  };

  return (
    <div className="manual">
      <NumberStepper label={t.seriesCount} value={rows.length} onChange={setCount} min={1} max={20} />
      <ol className="manual__rows">
        {rows.map((row, r) => {
          const expanded = open.includes(r);
          const computed = shotSum(row);
          const fromShots = row.shots.some((s) => s.trim() !== '');
          return (
            <li key={r} className="manual__row" data-open={expanded || undefined}>
              <div className="manual__head">
                <span className="manual__idx num">{r + 1}</span>
                <input
                  aria-label={t.seriesTotal(r + 1)}
                  inputMode="decimal"
                  placeholder={dec ? '104,5' : '95'}
                  value={fromShots ? (computed?.toFixed(dec ? 1 : 0) ?? '') : row.total}
                  readOnly={fromShots}
                  onChange={(e) => update(r, { total: e.target.value })}
                />
                <button
                  type="button"
                  className="button--quiet"
                  aria-expanded={expanded}
                  onClick={() => setOpen((o) => (expanded ? o.filter((i) => i !== r) : [...o, r]))}
                >
                  {expanded ? t.hideShots : t.showShots}
                </button>
              </div>
              {expanded && (
                <div className="manual__shots">
                  {row.shots.map((s, k) => (
                    <input
                      key={k}
                      aria-label={t.shotOf(r + 1, k + 1)}
                      inputMode="decimal"
                      value={s}
                      onChange={(e) => update(r, { shots: row.shots.map((x, j) => (j === k ? e.target.value : x)) })}
                    />
                  ))}
                  <p className="manual__hint">{fromShots ? t.totalFromShots : t.shotsHint}</p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="manual__actions">
        <button type="button" onClick={apply} disabled={!disciplineId}>{t.manualApply}</button>
        {!disciplineId && <small>{t.pickDisciplineFirst}</small>}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
