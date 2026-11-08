'use client';
import type { MatchSelection } from '@/lib/alignment/align';
import type { ScattShot } from '@/lib/parsers/scatt';
import { sr } from '@/lib/i18n/sr';

type Mode = MatchSelection['kind'];

/** Which SCATT shots make up the match. Three modes, none chosen until a file gives a proposal. */
export function MatchSelector({
  shots,
  selection,
  defaultN,
  onChange,
}: {
  shots: ScattShot[];
  selection: MatchSelection | undefined;
  /** Count used when a mode is first picked (the SIUS shot count). */
  defaultN?: number;
  onChange: (next: MatchSelection) => void;
}) {
  const t = sr.newTraining;
  const sorted = [...shots].sort((a, b) => a.tMs - b.tMs || a.id - b.id);
  const n = selection?.n ?? defaultN ?? sorted.length;

  const pick = (kind: Mode): void => {
    if (kind === 'from') onChange({ kind, fromShotId: sorted[0]?.id ?? 0, n });
    else onChange({ kind, n });
  };
  const MODES: [Mode, string][] = [
    ['last', t.modeLast],
    ['first', t.modeFirst],
    ['from', t.modeFrom],
  ];

  return (
    <fieldset className="match-selector">
      <legend>{t.matchSelector}</legend>
      <div className="match-selector__modes">
        {MODES.map(([kind, label]) => (
          <label key={kind} className="match-selector__mode">
            <input
              type="radio"
              name="match-mode"
              value={kind}
              checked={selection?.kind === kind}
              onChange={() => pick(kind)}
            />{' '}
            {label}
          </label>
        ))}
      </div>
      {selection?.kind === 'from' && (
        <label>
          {t.modeFrom}
          <select
            value={selection.fromShotId}
            onChange={(e) => onChange({ kind: 'from', fromShotId: Number(e.target.value), n: selection.n })}
          >
            {sorted.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      {selection && (
        <label>
          {t.shotsWord}
          <input
            type="number"
            min={0}
            max={sorted.length}
            value={selection.n}
            onChange={(e) => onChange({ ...selection, n: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
        </label>
      )}
    </fieldset>
  );
}
