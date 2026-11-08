import { sr } from '@/lib/i18n/sr';

type State = 'live' | 'pending' | 'stale' | 'disabled';
const FORM: Record<State, 'solid' | 'dashed' | 'half' | 'struck'> = {
  live: 'solid',
  pending: 'dashed',
  stale: 'half',
  disabled: 'struck',
};

/** A status as a line form plus a word: solid, dashed, half-height or struck-through. */
export function StateLine({ state }: { state: State }) {
  return (
    <span className="state-line" data-state={state} data-form={FORM[state]}>
      <span className="state-line__rule" aria-hidden="true" />
      <span className="state-line__word">{sr.stateLine[state]}</span>
    </span>
  );
}
