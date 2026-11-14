'use client';
import Link, { useLinkStatus } from 'next/link';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from '@/components/ui/icons';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import { sr } from '@/lib/i18n/sr';
import { readListView, saveListView } from '@/lib/listReturn';
import { hasPulse, hasScatt, type TrainingSummary } from '@/lib/stats/periodStats';

const t = sr.dashboard;
const nt = sr.newTraining;
const WEEKDAYS = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub'];

type SortKey = 'date' | 'name' | 'kind' | 'place' | 'total';
type Dir = 'asc' | 'desc';
interface Sort { key: SortKey; dir: Dir }

/** Text columns start A to Z; the date and the result start with the newest and the highest. */
const FIRST_DIR: Record<SortKey, Dir> = { date: 'desc', name: 'asc', kind: 'asc', place: 'asc', total: 'desc' };
const COLUMNS: { key: SortKey; label: string; optional?: boolean; num?: boolean }[] = [
  { key: 'date', label: t.colDate },
  { key: 'name', label: t.colSession },
  { key: 'kind', label: t.colKind, optional: true },
  { key: 'place', label: t.colPlace, optional: true },
  { key: 'total', label: t.colTotal, num: true },
];

/** Matches `--fold-dur` on `.smonth`. */
const FOLD_MS = 320;

const collator = new Intl.Collator('sr-Latn-RS', { numeric: true, sensitivity: 'base' });

/** Dims its link's label while that navigation is still loading. */
function Pending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? 'is-pending' : undefined}>{children}</span>;
}

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return { weekday: WEEKDAYS[d.getUTCDay()], date: `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.` };
};

const hm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(iso));

/** 1 sesija, 2 sesije, 5 sesija, 11 sesija, 21 sesija. */
const sessionsCount = (n: number) => {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  return `${n} ${last === 1 && !teen ? 'sesija' : last >= 2 && last <= 4 && !teen ? 'sesije' : 'sesija'}`;
};

interface Row {
  x: TrainingSummary;
  total: number | null;
  decimal: boolean;
  tags: string[];
}

const toRow = (x: TrainingSummary): Row => {
  const series = x.matches.flatMap((m) => m.series);
  const decimal = DISCIPLINES[x.discipline].decimal;
  const total = series.length
    ? Math.round(series.reduce((a, s) => a + ((decimal ? (s.totalDecimal ?? s.total) : s.total) ?? 0), 0) * 10) / 10
    : null;
  const tags = [
    DISCIPLINES[x.discipline].nameSr,
    x.kind && x.kind !== 'trening' ? nt.kinds[x.kind] : null,
    x.stage && x.stage !== 'slobodno' ? nt.stages[x.stage] : null,
    x.eventName ?? null,
  ].filter((v): v is string => Boolean(v));
  return { x, total, decimal, tags };
};

const dateKey = (r: Row) => `${r.x.trainedOn} ${r.x.startedAt ?? ''}`;

/** Rows without a value for the sorted column go last whichever way it runs. */
function compare(a: Row, b: Row, { key, dir }: Sort): number {
  const sign = dir === 'asc' ? 1 : -1;
  let missingA = false;
  let missingB = false;
  let order = 0;
  if (key === 'total') {
    missingA = a.total === null;
    missingB = b.total === null;
    order = (a.total ?? 0) - (b.total ?? 0);
  } else if (key === 'place') {
    missingA = !a.x.place;
    missingB = !b.x.place;
    order = collator.compare(a.x.place ?? '', b.x.place ?? '');
  } else if (key === 'name') {
    order = collator.compare(a.x.name, b.x.name);
  } else if (key === 'kind') {
    order = collator.compare(a.tags.join(' '), b.tags.join(' '));
  } else {
    order = dateKey(a) < dateKey(b) ? -1 : dateKey(a) > dateKey(b) ? 1 : 0;
  }
  if (missingA !== missingB) return missingA ? 1 : -1;
  if (order !== 0) return order * sign;
  // Equal in the sorted column: newest first, so the order stays the same between renders.
  return dateKey(a) < dateKey(b) ? 1 : dateKey(a) > dateKey(b) ? -1 : 0;
}

/** A circle with a slash: the data is not there. */
const MissMark = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="8" /><path d="m6.5 17.5 11-11" />
  </svg>
);

const SortArrow = ({ dir }: { dir: Dir }) => (
  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" className="stable__arrow" data-dir={dir}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);

/**
 * The sessions grouped by month, newest month first. Each month folds away and carries its own column
 * headings; clicking a heading sorts the rows inside every month. Months themselves stay in date order,
 * so the sort never needs more rows than the page already holds.
 */
export function SessionsList({
  shown,
  footer,
}: {
  shown: TrainingSummary[];
  footer?: ReactNode;
}) {
  const uid = useId();
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: 'desc' });
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  // Months whose fold or unfold is still running: only then is the body clipped, so the pinned headings
  // inside a settled, open month keep sticking.
  const [moving, setMoving] = useState<ReadonlySet<string>>(new Set());

  // The view a report was opened from comes back with it. Restored before the first paint, so the fold
  // transition has nothing to play; kept per browser tab, so it never reaches the server.
  const restored = useRef(false);
  useLayoutEffect(() => {
    const v = readListView();
    if (v.sort && v.sort.key in FIRST_DIR && (v.sort.dir === 'asc' || v.sort.dir === 'desc')) setSort({ key: v.sort.key as SortKey, dir: v.sort.dir });
    if (Array.isArray(v.folded)) setFolded(new Set(v.folded.filter((k) => typeof k === 'string')));
    restored.current = true;
  }, []);
  useEffect(() => {
    if (restored.current) saveListView({ sort, folded: [...folded] });
  }, [sort, folded]);

  const months = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const x of shown) {
      const key = x.trainedOn.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), toRow(x)]);
    }
    // Sorting by date flips the months too; any other sort keeps them newest first.
    const keys = [...groups.keys()].sort().reverse();
    if (sort.key === 'date' && sort.dir === 'asc') keys.reverse();
    return keys.map((key) => ({ key, rows: [...groups.get(key)!].sort((a, b) => compare(a, b, sort)) }));
  }, [shown, sort]);

  const pickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }));
  const toggle = (key: string) => {
    setFolded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setMoving((s) => new Set(s).add(key));
    window.setTimeout(() => setMoving((s) => { const next = new Set(s); next.delete(key); return next; }), FOLD_MS + 40);
  };

  return (
    <div className="stable">
      {months.map(({ key, rows }) => {
        const open = !folded.has(key);
        const bodyId = `${uid}-${key}`;
        const name = `${t.months[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}.`;
        return (
          <section key={key} className="smonth" data-open={open || undefined} aria-label={name}>
            <h3 className="smonth__title">
              <button type="button" className="smonth__toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => toggle(key)}>
                <ChevronDown />
                <span className="smonth__name">{name}</span>
                <span className="smonth__count num">{sessionsCount(rows.length)}</span>
              </button>
            </h3>
            <div id={bodyId} className="smonth__body" data-open={open} data-moving={moving.has(key) || undefined} inert={!open}>
              <div className="smonth__clip">
                <div className="stable__head" role="group" aria-label={t.sortBy}>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={`stable__sort${c.optional ? ' stable__opt' : ''}${c.num ? ' num' : ''}`}
                        aria-pressed={active}
                        onClick={() => pickSort(c.key)}
                      >
                        {c.label}
                        {active && (
                          <>
                            <SortArrow dir={sort.dir} />
                            <span className="sr-only">{sort.dir === 'asc' ? t.sortAsc : t.sortDesc}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
                <ol className="srows">
                  {rows.map(({ x, total, decimal, tags }) => {
                    const day = dayParts(x.trainedOn);
                    const time = x.startedAt && x.tz ? hm(x.startedAt, x.tz) : null;
                    // A proposed alignment is only something to confirm when a SCATT file was paired with the SIUS shots.
                    const toConfirm = x.matches.some((m) => m.alignState === 'proposed' && m.paired);
                    return (
                      <li key={x.id}>
                        <Link href={`/trening/${x.id}`} className="srow">
                          <span className="srow__day">
                            <span className="srow__date num">{day.date}</span>
                            <span className="srow__wd">
                              {day.weekday}
                              {time && <span className="num"> {time}</span>}
                            </span>
                          </span>
                          <span className="srow__name">
                            <span className="srow__title">{x.name}</span>
                            {!hasScatt(x) && <span className="srow__miss"><MissMark />{t.noScatt}</span>}
                            {!hasPulse(x) && <span className="srow__miss"><MissMark />{t.noPulse}</span>}
                          </span>
                          <span className="srow__tags">
                            {tags.map((tag, k) => <span key={k} className="srow__tag">{tag}</span>)}
                            {toConfirm && <span className="srow__confirm" title={t.confirmAlignTitle}>{t.confirmAlign}</span>}
                          </span>
                          <span className="srow__place">{x.place || t.noValue}</span>
                          <strong className="srow__total num">{total === null ? t.noValue : total.toFixed(decimal ? 1 : 0)}</strong>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          </section>
        );
      })}
      {footer}
    </div>
  );
}

/** The footer link that loads more rows; its label dims while the next page loads. */
export function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="button button--quiet" href={href} scroll={false}>
      <Pending>{label}</Pending>
    </Link>
  );
}
