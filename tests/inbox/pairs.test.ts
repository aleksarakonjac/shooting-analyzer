import { describe, expect, it } from 'vitest';
import { groupInbox, proposePairs } from '@/lib/inbox/pairs';
import type { InboxItem, InboxMeta } from '@/lib/inbox/types';

const TZ = 'Europe/Belgrade';
const at = (hm: string, day = '2026-11-24') => Date.parse(`${day}T${hm}:00+01:00`);
const item = (id: string, kind: InboxItem['kind'], meta: InboxMeta, over: Partial<InboxItem> = {}): InboxItem => ({
  id, kind, meta, shooterId: 's1', path: id, name: id, createdAt: new Date(at('20:00')).toISOString(), ...over,
});
const sius = (id: string, hm: string | null, shots = 60, over: Partial<InboxItem> = {}) =>
  item(id, 'sius_prnx', { sius: { discipline: 'Air Rifle 60', total: 600, shots, atMs: hm ? at(hm) : null } }, over);
const scatt = (id: string, from: string, to: string, shots = 70, over: Partial<InboxItem> = {}) =>
  item(id, 'scatt', { scatt: { shots, startMs: at(from), endMs: at(to) } }, over);
const pairs = (...items: InboxItem[]) => proposePairs(items, TZ).map((p) => `${p.siusId}+${p.scattId}`);

describe('proposePairs', () => {
  it('pairs a report printed during the recording or up to an hour after it', () => {
    expect(pairs(sius('a', '10:30'), scatt('b', '10:00', '11:00'))).toEqual(['a+b']);
    expect(pairs(sius('a', '12:00'), scatt('b', '10:00', '11:00'))).toEqual(['a+b']);
  });

  it('not later than an hour, not before the recording, not with fewer SCATT shots', () => {
    expect(pairs(sius('a', '12:01'), scatt('b', '10:00', '11:00'))).toEqual([]);
    expect(pairs(sius('a', '09:59'), scatt('b', '10:00', '11:00'))).toEqual([]);
    expect(pairs(sius('a', '10:30', 60), scatt('b', '10:00', '11:00', 59))).toEqual([]);
    expect(pairs(sius('a', '10:30', 60), scatt('b', '10:00', '11:00', 60))).toEqual(['a+b']);
  });

  it('gives each of two sessions on one day its own, nearest recording', () => {
    const two = [sius('a1', '11:05'), sius('a2', '11:55'), scatt('b1', '10:00', '11:00'), scatt('b2', '11:10', '11:50')];
    expect(pairs(...two).sort()).toEqual(['a1+b1', 'a2+b2']);
    expect(pairs(...[...two].reverse()).sort()).toEqual(['a1+b1', 'a2+b2']);
  });

  it('uses one recording once', () => {
    expect(pairs(sius('a1', '11:05'), sius('a2', '11:30'), scatt('b', '10:00', '11:00'))).toEqual(['a1+b']);
  });

  it('never pairs different shooters', () => {
    expect(pairs(sius('a', '10:30'), scatt('b', '10:00', '11:00', 70, { shooterId: 's2' }))).toEqual([]);
    expect(pairs(sius('a', null), item('b', 'scatt', null, { shooterId: 's2' }))).toEqual([]);
  });

  it('a phone file without details goes with the only report of the day it arrived', () => {
    expect(pairs(sius('a', '10:30'), item('b', 'scatt', null))).toEqual(['a+b']);
    expect(pairs(sius('a', null), scatt('b', '10:00', '11:00'))).toEqual(['a+b']);
    expect(pairs(item('a', 'sius_pdf', null), item('b', 'scatt', null))).toEqual(['a+b']);
    expect(pairs(sius('a1', '10:30'), sius('a2', '18:00'), item('b', 'scatt', null))).toEqual([]);
    expect(pairs(sius('a', '10:30'), item('b', 'scatt', null, { createdAt: new Date(at('20:00', '2026-11-25')).toISOString() }))).toEqual([]);
  });

  it('two files that both have times and do not match stay apart', () => {
    expect(pairs(sius('a', '08:00'), scatt('b', '15:00', '16:00'))).toEqual([]);
  });

  it('leaves pulse files alone', () => {
    expect(pairs(sius('a', '10:30'), item('p', 'tcx', null))).toEqual([]);
  });
});

describe('groupInbox', () => {
  it('groups by shooter and by the day of shooting, newest first, with a pair kept together', () => {
    const g = groupInbox(
      [sius('late', '00:20', 60, {}), scatt('night', '23:00', '23:59', 70), item('p', 'tcx', null), sius('other', '10:00', 60, { shooterId: 's2' })].map((i) =>
        i.id === 'late' ? { ...i, meta: { sius: { discipline: 'x', total: 1, shots: 60, atMs: at('00:20', '2026-11-25') } } } : i,
      ),
      TZ,
    );
    expect(g.map((x) => [x.shooterId, x.day, x.items.map((i) => i.id).sort()])).toEqual([
      ['s1', '2026-11-25', ['late', 'night']],
      ['s1', '2026-11-24', ['p']],
      ['s2', '2026-11-24', ['other']],
    ]);
    expect(g[0].pairs).toEqual([{ siusId: 'late', scattId: 'night' }]);
  });
});
