import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import type { SessionKind, SessionStage } from '@/lib/import/saveTraining';
import { periodRange } from './periodStats';

export type Quick = 'recent' | 'week' | 'month' | 'year' | 'range';
export type ChartKind = 'rez' | 'puls' | 'grupa';

/** What the sessions page shows, read from its URL so a view can be bookmarked. */
export interface SessionFilters {
  quick: Quick;
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
}

export type FilterSearch = Partial<Record<'p' | 'od' | 'do' | 'd' | 'v' | 'deo' | 'm' | 'e' | 'g', string>>;

/** How many sessions the default view lists. */
export const RECENT_LIMIT = 20;

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

export function parseFilters(s: FilterSearch, now: Date, tz: string): SessionFilters {
  const od = validDate(s.od);
  const dd = validDate(s.do);
  let quick: Quick = 'recent';
  let from: string | null = null;
  let to: string | null = null;
  if (od || dd) {
    quick = 'range';
    from = od;
    to = dd ? dayAfter(dd) : null;
  } else if (s.p === 'week' || s.p === 'month' || s.p === 'year') {
    quick = s.p;
    ({ from, to } = periodRange(s.p, now, tz));
  }
  const place = s.m?.trim() || null;
  return {
    quick,
    from,
    to,
    discipline: s.d && s.d in DISCIPLINES ? (s.d as DisciplineId) : null,
    kind: pick(KINDS, s.v),
    stage: pick(STAGES, s.deo),
    place,
    event: s.e && UUID.test(s.e) ? s.e : null,
    chart: pick(CHARTS, s.g) ?? 'rez',
  };
}

/** A link to the same page with some filters changed; only non-default values are written. */
export function filtersHref(base: string, f: SessionFilters, patch: Partial<SessionFilters>): string {
  const n = { ...f, ...patch };
  // A quick period chosen now replaces an explicit range.
  if (patch.quick && patch.quick !== 'range') {
    n.from = null;
    n.to = null;
  }
  const q = new URLSearchParams();
  if (n.quick === 'range') {
    if (n.from) q.set('od', n.from);
    if (n.to) q.set('do', dayBefore(n.to));
  } else if (n.quick !== 'recent') q.set('p', n.quick);
  if (n.discipline) q.set('d', n.discipline);
  if (n.kind) q.set('v', n.kind);
  if (n.stage) q.set('deo', n.stage);
  if (n.place) q.set('m', n.place);
  if (n.event) q.set('e', n.event);
  if (n.chart !== 'rez') q.set('g', n.chart);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

/** True when anything narrows the view beyond the default recent sessions. */
export const hasFilters = (f: SessionFilters) =>
  f.quick !== 'recent' || Boolean(f.discipline || f.kind || f.stage || f.place || f.event);
