'use client';
import { Segmented } from '@/components/ui/Segmented';

export interface ScopeOption<T extends string> {
  id: T;
  label: string;
}

/**
 * What a chart is about: the current shot, a series or the whole match, with arrows to step to the previous or
 * next shot or series. `prev` / `next` are absent where there is nothing to step to.
 */
export function ScopeBar<T extends string>({
  label,
  scope,
  scopes,
  onScope,
  current,
  onPrev,
  onNext,
}: {
  label: string;
  scope: T;
  scopes: ScopeOption<T>[];
  onScope: (s: T) => void;
  /** What the chart shows now, e.g. "Pogodak 6", "Serija 2", "Ceo meč". */
  current: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="scopebar">
      <Segmented label={label} hideLabel full={false} value={scope} onChange={onScope} options={scopes} />
      <div className="scopebar__pill">
        <button type="button" className="scopebar__arrow" onClick={onPrev} disabled={!onPrev} aria-label="←" title="←">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 2.5 4 6l3.5 3.5" /></svg>
        </button>
        <span className="scopebar__label">{current}</span>
        <button type="button" className="scopebar__arrow" onClick={onNext} disabled={!onNext} aria-label="→" title="→">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5 8 6 4.5 9.5" /></svg>
        </button>
      </div>
    </div>
  );
}
