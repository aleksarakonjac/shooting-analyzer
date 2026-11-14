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
export const Minus = () => (
  <svg {...base} width="16" height="16"><path d="M5 12h14" /></svg>
);
export const Close = () => (
  <svg {...base} width="16" height="16" strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const Plus = () => (
  <svg {...base} width="16" height="16"><path d="M12 5v14M5 12h14" /></svg>
);
export const ClockIcon = () => (
  <svg {...base} width="16" height="16"><path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
);
