import { sr } from '@/lib/i18n/sr';

/**
 * Orange flag = proposed, awaiting your confirmation. Black = confirmed.
 * Never colour alone: the word, a dashed vs solid edge, and a pennant vs check marker all differ.
 */
export function FlagBadge({ state }: { state: 'proposed' | 'confirmed' }) {
  const proposed = state === 'proposed';
  return (
    <span className="flag-badge" data-state={state}>
      <svg
        className="flag-badge__marker"
        data-marker={proposed ? 'pennant' : 'check'}
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {proposed ? <path d="M6 21V3m0 1h12l-3.5 4L18 12H6" /> : <path d="m5 12.5 4.5 4.5L19 7.5" />}
      </svg>
      {proposed ? sr.flag.proposed : sr.flag.confirmed}
    </span>
  );
}
