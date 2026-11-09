const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const ChevronDown = () => (
  <svg {...base} className="ui-chev"><path d="m6 9 6 6 6-6" /></svg>
);
export const ChevronLeft = () => (
  <svg {...base} width="16" height="16"><path d="m15 6-6 6 6 6" /></svg>
);
export const ChevronRight = () => (
  <svg {...base} width="16" height="16"><path d="m9 6 6 6-6 6" /></svg>
);
export const CalendarIcon = () => (
  <svg {...base} width="18" height="18"><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7ZM4 10h16M9 3v4M15 3v4" /></svg>
);
