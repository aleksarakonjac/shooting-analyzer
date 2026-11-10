import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import type { SessionKind, SessionStage } from '@/lib/import/saveTraining';
import { periodRange } from './periodStats';

const MONTH = /^(0?[1-9]|1[0-2])$/;
const YEAR = /^20\d{2}$/;

/** First day (inclusive) and day after the last (exclusive) of a year, or of one month in it. */
export function yearMonthRange(year: string, month: string | null): { from: string; to: string } {
  const y = Number(year);
  if (!month) return { from: `${y}-01-01`, to: `${y + 1}-01-01` };
  const m = Number(month);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${pad(m)}-01`, to: m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01` };
}

/** recent = latest sessions; period = a year or one month of a year; range = explicit from–to days. */
export type Quick = 'recent' | 'period' | 'range';
export type ChartKind = 'rez' | 'puls' | 'grupa';

/** What the sessions page shows, read from its URL so a view can be bookmarked. */
export interface SessionFilters {
  quick: Quick;
  /** Chosen year (YYYY) and month (01-12) when quick is 'period'. */
  year: string | null;
  month: string | null;
  /** First day (inclusive), YYYY-MM-DD; null for the recent sessions. */
  from: string | null;
  /** Day after the last (exclusive). */
  to: string | null;
  discipline: DisciplineId | null;
  kind: SessionKind | null;
  stage: SessionStage | null;
  place: string | null;
  event: string | null;
  chart: ChartKind;
  /** The side panel with the figures and charts is open. */
  side: boolean;
  /** How many rows the list shows (the recent view also loads only this many). */
  limit: number;
}

export type FilterSearch = Partial<Record<'y' | 'mo' | 'od' | 'do' | 'd' | 'v' | 'deo' | 'm' | 'e' | 'g' | 'n' | 's', string>>;

/** How many sessions the list shows at first, and how many more each "show more" adds. */
export const RECENT_LIMIT = 30;
const MAX_LIMIT = 2000;

const KINDS: SessionKind[] = ['trening', 'kontrolni', 'takmicenje'];
const STAGES: SessionStage[] = ['slobodno', 'eliminacije', 'kvalifikacije', 'finale'];
const CHARTS: ChartKind[] = ['rez', 'puls', 'grupa'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validDate = (v: string | undefined): string | null => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};
const dayAfter = (v: string) => new Date(Date.parse(`${v}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const dayBefore = (v: string) => new Date(Date.parse(`${v}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const pick = <T extends string>(list: readonly T[], v: string | undefined): T | null => (v && (list as readonly string[]).includes(v) ? (v as T) : null);

const parseLimit = (v: string | undefined): number => {
  const n = v && /^\d+$/.test(v) ? Number(v) : RECENT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(RECENT_LIMIT, n));
};

export function parseFilters(s: FilterSearch, now: Date, tz: string): SessionFilters {
  const od = validDate(s.od);
  const dd = validDate(s.do);
  let quick: Quick = 'recent';
  let from: string | null = null;
  let to: string | null = null;
  let year: string | null = null;
  let month: string | null = null;
  if (od || dd) {
    quick = 'range';
    from = od;
    to = dd ? dayAfter(dd) : null;
  } else if ((s.y && YEAR.test(s.y)) || (s.mo && MONTH.test(s.mo))) {
    quick = 'period';
    // A month with no year means the current year.
    year = s.y && YEAR.test(s.y) ? s.y : periodRange('year', now, tz).from.slice(0, 4);
    month = s.mo && MONTH.test(s.mo) ? s.mo.padStart(2, '0') : null;
    ({ from, to } = yearMonthRange(year, month));
  }
  const place = s.m?.trim() || null;
  return {
    quick,
    year,
    month,
    from,
    to,
    discipline: s.d && s.d in DISCIPLINES ? (s.d as DisciplineId) : null,
    kind: pick(KINDS, s.v),
    stage: pick(STAGES, s.deo),
    place,
    event: s.e && UUID.test(s.e) ? s.e : null,
    chart: pick(CHARTS, s.g) ?? 'rez',
    side: s.s === '1',
    limit: parseLimit(s.n),
  };
}

/** A link to the same page with some filters changed; only non-default values are written. */
export function filtersHref(base: string, f: SessionFilters, patch: Partial<SessionFilters>): string {
  const n = { ...f, ...patch };
  const q = new URLSearchParams();
  if (n.quick === 'range') {
    if (n.from) q.set('od', n.from);
    if (n.to) q.set('do', dayBefore(n.to));
  } else if (n.quick === 'period') {
    if (n.year) q.set('y', n.year);
    if (n.month) q.set('mo', n.month);
  }
  if (n.discipline) q.set('d', n.discipline);
  if (n.kind) q.set('v', n.kind);
  if (n.stage) q.set('deo', n.stage);
  if (n.place) q.set('m', n.place);
  if (n.event) q.set('e', n.event);
  if (n.chart !== 'rez') q.set('g', n.chart);
  if (n.side) q.set('s', '1');
  // A longer list survives a chart switch; any other change starts the list over.
  const keepsList = Object.keys(patch).every((k) => k === 'chart' || k === 'limit' || k === 'side');
  if (keepsList && n.limit > RECENT_LIMIT) q.set('n', String(n.limit));
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

/** True when anything narrows the view beyond the default recent sessions. */
export const hasFilters = (f: SessionFilters) =>
  f.quick !== 'recent' || Boolean(f.discipline || f.kind || f.stage || f.place || f.event);
