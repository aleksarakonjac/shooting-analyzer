import Link from 'next/link';
import { sr } from '@/lib/i18n/sr';

export type Period = 'week' | 'month' | 'year';
const PERIODS: Period[] = ['week', 'month', 'year'];

export function PeriodTabs({ value, hrefFor }: { value: Period; hrefFor: (p: Period) => string }) {
  return (
    <nav className="period-tabs" aria-label={sr.period.label}>
      {PERIODS.map((p) => (
        <Link key={p} href={hrefFor(p)} aria-current={p === value ? 'page' : undefined}>{sr.period[p]}</Link>
      ))}
    </nav>
  );
}
