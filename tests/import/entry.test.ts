import { describe, expect, it } from 'vitest';
import { toInstantRange } from '@/lib/import/times';
import { parsePastedShots } from '@/lib/import/paste';
import { buildManualResult } from '@/lib/import/manualSeries';

const TZ = 'Europe/Belgrade';

describe('toInstantRange', () => {
  it('turns the day plus local from-to clock times into UTC instants', () => {
    expect(toInstantRange('2026-11-09', '17:00', '18:30', TZ)).toEqual({
      startedAt: '2026-11-09T16:00:00.000Z',
      endedAt: '2026-11-09T17:30:00.000Z',
    });
  });

  it('keeps a missing time as null, and a summer date uses summer time', () => {
    expect(toInstantRange('2026-07-01', '09:15', '', TZ)).toEqual({ startedAt: '2026-07-01T07:15:00.000Z', endedAt: null });
    expect(toInstantRange('2026-07-01', '', '', TZ)).toEqual({ startedAt: null, endedAt: null });
  });
});

describe('parsePastedShots', () => {
  const opts = { disciplineId: 'air_rifle' as const, date: '2026-10-21', tz: TZ };

  it('reads bare values with a decimal point or comma, ten to a series', () => {
    const lines = Array.from({ length: 12 }, (_, i) => (i % 2 ? '10,4' : '10.6')).join('\n');
    const r = parsePastedShots(lines, opts);
    if (!r.ok) throw new Error('expected ok');
    expect(r.result.series.map((s) => s.shots.length)).toEqual([10, 2]);
    expect(r.result.series[0].shots[1].value).toBe(10.4);
    expect(r.result.series[0].totalDecimal).toBe(105);
    expect(r.timed).toBe(0);
  });

  it('reads a shot number, the value, an inner-ten star and a time of day or a full timestamp', () => {
    const r = parsePastedShots('1. 10.6* 19:03:09.250\n2\t10.4\t19:03:41\n#3; 9,8; 2026-10-21 19:04:02', opts);
    if (!r.ok) throw new Error('expected ok');
    const shots = r.result.series[0].shots;
    expect(shots.map((s) => s.value)).toEqual([10.6, 10.4, 9.8]);
    expect(shots[0].inner).toBe(true);
    expect(shots[0].tMs).toBe(Date.parse('2026-10-21T17:03:09.250Z'));
    expect(shots[2].tMs).toBe(Date.parse('2026-10-21T17:04:02Z'));
    expect(r.timed).toBe(3);
  });

  it('names the first line it cannot read or whose value is out of range', () => {
    expect(parsePastedShots('10.6\nabc\n10.2', opts)).toEqual({ ok: false, error: 'invalid', line: 2 });
    expect(parsePastedShots('10.6\n11.2', opts)).toEqual({ ok: false, error: 'invalid', line: 2 });
    expect(parsePastedShots('\n  \n', opts)).toEqual({ ok: false, error: 'empty' });
  });

  it('uses whole rings for pistol and rejects decimals there', () => {
    const r = parsePastedShots('10\n9\n8', { ...opts, disciplineId: 'air_pistol' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.result.series[0].total).toBe(27);
    expect(parsePastedShots('9.5', { ...opts, disciplineId: 'air_pistol' })).toEqual({ ok: false, error: 'invalid', line: 1 });
  });
});

describe('buildManualResult', () => {
  it('takes a series total as typed when no shots are entered', () => {
    const r = buildManualResult('air_rifle', [{ total: '104,5', shots: [] }, { total: '103.2', shots: [] }]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.result.series.map((s) => s.totalDecimal)).toEqual([104.5, 103.2]);
    expect(r.result.totalDecimal).toBe(207.7);
    expect(r.result.series[0].shots).toEqual([]);
  });

  it('computes the total from the shots when shots are entered', () => {
    const shots = ['10.6', '10.4', '10.5', '10.1', '9.9', '10.8', '10.2', '10.3', '10.0', '10.7'];
    const r = buildManualResult('air_rifle', [{ total: '', shots }]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.result.series[0].totalDecimal).toBe(103.5);
    expect(r.result.series[0].total).toBe(99); // whole rings
    expect(r.result.series[0].shots).toHaveLength(10);
  });

  it('points at the row and the shot that are wrong', () => {
    expect(buildManualResult('air_rifle', [{ total: '110', shots: [] }])).toEqual({ ok: false, error: 'total', row: 1 });
    expect(buildManualResult('air_rifle', [{ total: '', shots: [] }])).toEqual({ ok: false, error: 'missing', row: 1 });
    expect(buildManualResult('air_rifle', [{ total: '100', shots: [] }, { total: '', shots: ['10.6', '12'] }])).toEqual({
      ok: false, error: 'shot', row: 2, shot: 2,
    });
    expect(buildManualResult('air_pistol', [{ total: '95.5', shots: [] }])).toEqual({ ok: false, error: 'total', row: 1 });
    expect(buildManualResult('air_rifle', [])).toEqual({ ok: false, error: 'empty' });
  });
});
