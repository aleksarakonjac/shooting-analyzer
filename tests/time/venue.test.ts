import { describe, expect, it } from 'vitest';
import { toInstantRange } from '@/lib/import/times';
import { wallTimeCandidates } from '@/lib/time/zone';
import { parsePastedShots } from '@/lib/import/paste';

describe('wallTimeCandidates', () => {
  it('has one instant on an ordinary day', () => {
    expect(wallTimeCandidates('2026-11-09', '17:00', 'Europe/Belgrade')).toEqual([Date.parse('2026-11-09T16:00:00Z')]);
  });

  it('has two instants in the repeated hour when clocks go back (summer time first)', () => {
    expect(wallTimeCandidates('2026-10-25', '02:30', 'Europe/Belgrade')).toEqual([
      Date.parse('2026-10-25T00:30:00Z'),
      Date.parse('2026-10-25T01:30:00Z'),
    ]);
  });
});

describe('toInstantRange in the venue zone', () => {
  it('reads the clock in the session zone, six hours from home', () => {
    expect(toInstantRange('2026-11-09', '17:00', '19:00', 'Asia/Almaty')).toMatchObject({
      startedAt: '2026-11-09T12:00:00.000Z',
      endedAt: '2026-11-09T14:00:00.000Z',
      endsNextDay: false,
    });
  });

  it('takes an end before the start as the next day', () => {
    expect(toInstantRange('2026-11-09', '22:30', '00:45', 'Europe/Belgrade')).toMatchObject({
      startedAt: '2026-11-09T21:30:00.000Z',
      endedAt: '2026-11-09T23:45:00.000Z',
      endsNextDay: true,
    });
  });

  it('uses the chosen reading of a repeated hour', () => {
    const summer = toInstantRange('2026-10-25', '02:10', '02:50', 'Europe/Belgrade', { from: 'earlier', to: 'later' });
    expect(summer.startedAt).toBe('2026-10-25T00:10:00.000Z');
    expect(summer.endedAt).toBe('2026-10-25T01:50:00.000Z');
    expect(summer.endsNextDay).toBe(false);
  });
});

describe('pasted ISO timestamps without an offset', () => {
  it('are read in the session zone, not the browser zone', () => {
    const r = parsePastedShots('10.4 2026-10-21T19:03:09', { disciplineId: 'air_rifle', date: '2026-10-21', tz: 'Asia/Tokyo' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.result.series[0].shots[0].tMs).toBe(Date.parse('2026-10-21T10:03:09Z'));
  });
});

import { samplesFromTcx } from '@/lib/parsers/tcx';

describe('samplesFromTcx with a chosen zone', () => {
  const tp = (time: string, bpm: number) =>
    `<Trackpoint><Time>${time}</Time><HeartRateBpm><Value>${bpm}</Value></HeartRateBpm></Trackpoint>`;
  const xml = `<TrainingCenterDatabase><Activities><Activity><Lap><Track>${tp('2026-10-25T01:30:00.000+03:00', 80)}${tp('2026-10-25T04:30:00.000+03:00', 90)}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;

  it('reads every sample in the zone on its own, so a clock change inside the file is honoured', () => {
    const s = samplesFromTcx(xml, 'Europe/Belgrade');
    expect(s.map((x) => new Date(x.tMs).toISOString())).toEqual(['2026-10-24T23:30:00.000Z', '2026-10-25T03:30:00.000Z']);
  });

  it('keeps the file clock when no zone was chosen', () => {
    const s = samplesFromTcx(xml, null);
    expect(new Date(s[0].tMs).toISOString()).toBe('2026-10-24T22:30:00.000Z');
  });
});
