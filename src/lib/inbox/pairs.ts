import { isSius, type InboxItem } from './types';

export interface InboxPair {
  siusId: string;
  scattId: string;
}

/** A report is printed at the end of a session, so it may follow the recording by this much. */
const AFTER_MS = 60 * 60_000;

const siusMeta = (i: InboxItem) => (i.meta && 'sius' in i.meta ? i.meta.sius : null);
const scattMeta = (i: InboxItem) => (i.meta && 'scatt' in i.meta ? i.meta.scatt : null);
const dayIn = (tz: string) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  return (ms: number) => f.format(new Date(ms));
};

/**
 * Which SIUS report goes with which SCATT recording: a proposal, the person decides. By time and shot count when both
 * files have them, nearest first, each file once. A file without details (sent from the phone) goes with the only one
 * left of the other kind that arrived the same day.
 */
export function proposePairs(items: InboxItem[], tz: string): InboxPair[] {
  const day = dayIn(tz);
  const sius = items.filter((i) => isSius(i.kind));
  const scatt = items.filter((i) => i.kind === 'scatt');
  const used = new Set<string>();
  const pairs: InboxPair[] = [];
  const take = (s: InboxItem, c: InboxItem) => {
    used.add(s.id).add(c.id);
    pairs.push({ siusId: s.id, scattId: c.id });
  };

  const close = sius.flatMap((s) =>
    scatt.flatMap((c) => {
      const a = siusMeta(s);
      const b = scattMeta(c);
      if (s.shooterId !== c.shooterId || !a || a.atMs === null || !b) return [];
      const fits = a.atMs >= b.startMs && a.atMs <= b.endMs + AFTER_MS && b.shots >= a.shots;
      return fits ? [{ s, c, gap: Math.abs(a.atMs - b.endMs) }] : [];
    }),
  );
  close.sort((x, y) => x.gap - y.gap);
  for (const { s, c } of close) if (!used.has(s.id) && !used.has(c.id)) take(s, c);

  const sameArrival = (a: InboxItem, b: InboxItem) => a.shooterId === b.shooterId && day(Date.parse(a.createdAt)) === day(Date.parse(b.createdAt));
  for (const s of sius) {
    if (used.has(s.id)) continue;
    const reports = sius.filter((x) => !used.has(x.id) && sameArrival(x, s));
    const recordings = scatt.filter((x) => !used.has(x.id) && sameArrival(x, s));
    if (reports.length !== 1 || recordings.length !== 1) continue;
    // Both know their time and it did not fit: they are two different sessions.
    const a = siusMeta(s);
    if (a && a.atMs !== null && scattMeta(recordings[0])) continue;
    take(s, recordings[0]);
  }
  return pairs;
}

export interface InboxGroup {
  shooterId: string;
  /** The day of shooting when the file knows it, else the day it arrived. */
  day: string;
  items: InboxItem[];
  pairs: InboxPair[];
}

/** Waiting files by shooter (in the order given) and day, newest day first; a pair stays together on its report's day. */
export function groupInbox(items: InboxItem[], tz: string): InboxGroup[] {
  const day = dayIn(tz);
  const pairs = proposePairs(items, tz);
  const byId = new Map(items.map((i) => [i.id, i]));
  const ownDay = (i: InboxItem) => day(siusMeta(i)?.atMs ?? scattMeta(i)?.startMs ?? Date.parse(i.createdAt));
  const reportOf = new Map(pairs.map((p) => [p.scattId, p.siusId]));
  const groups = new Map<string, InboxGroup>();
  for (const i of items) {
    const d = ownDay(byId.get(reportOf.get(i.id) ?? '') ?? i);
    const key = `${i.shooterId} ${d}`;
    const g = groups.get(key) ?? { shooterId: i.shooterId, day: d, items: [], pairs: [] };
    g.items.push(i);
    groups.set(key, g);
  }
  for (const g of groups.values()) g.pairs = pairs.filter((p) => g.items.some((i) => i.id === p.siusId));
  const order = [...new Set(items.map((i) => i.shooterId))];
  return [...groups.values()].sort((a, b) => order.indexOf(a.shooterId) - order.indexOf(b.shooterId) || b.day.localeCompare(a.day));
}
