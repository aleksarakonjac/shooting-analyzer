'use client';
import { sr } from '@/lib/i18n/sr';
import type { ProneRanges, ProneRangesResult } from '@/lib/sius/map';
import type { Position } from '@/lib/domain/types';

const t = sr.sius.cloud;
const ORDER: Position[] = ['kneeling', 'prone', 'standing'];

/** Which shots of a "50m Rifle Prone" exercise belong to which position, as ranges per position. */
export function ProneSplit({
  shotCount,
  value,
  check,
  onChange,
}: {
  shotCount: number;
  value: ProneRanges;
  check: ProneRangesResult;
  onChange: (next: ProneRanges) => void;
}) {
  const list = (n: number[]) => n.join(', ');
  const error = check.ok
    ? null
    : check.error === 'syntax'
      ? t.rangeErrors.syntax
      : check.error === 'out_of_range'
        ? t.rangeErrors.out_of_range(list(check.shots), shotCount)
        : check.error === 'overlap'
          ? t.rangeErrors.overlap(list(check.shots))
          : t.rangeErrors.unassigned(list(check.shots));
  return (
    <fieldset className="stack">
      <legend>{t.positions}</legend>
      {ORDER.map((p) => (
        <label key={p}>
          {sr.newTraining.positionGroup[p]}
          <input value={value[p]} inputMode="numeric" placeholder="1-20" onChange={(e) => onChange({ ...value, [p]: e.target.value })} />
        </label>
      ))}
      <small>{t.positionsHint}</small>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
