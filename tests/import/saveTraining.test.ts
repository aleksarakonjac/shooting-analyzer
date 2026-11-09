import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSiusCsv } from '../../src/lib/parsers/siusCsv';
import { decodeText } from '../../src/lib/parsers/decode';
import { readScatt } from '../../src/lib/parsers/scatt';
import { buildSavePayload, saveTraining, type TrainingDraft } from '../../src/lib/import/saveTraining';

const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures', name)));
const sius = parseSiusCsv(decodeText(fx('2026-10-21T190309.csv')));
const scatt = await readScatt(fx('export_2026-10-22_14.11.scatt-expert'));

const base: TrainingDraft = {
  disciplineId: 'air_rifle',
  trainedOn: '2026-10-21',
  sius,
  scatt,
  selection: { kind: 'last', n: 80 },
  ignoredScattIds: [],
  hrOffsetMs: 0,
  confirmed: false,
};

describe('buildSavePayload (both fixtures, last 80)', () => {
  const p = buildSavePayload(base, 'user-1');

  it('makes one match with 8 series of 10 shots, each tied to a SCATT shot', () => {
    expect(p.match).not.toBeNull();
    expect(p.match!.series).toHaveLength(8);
    for (const s of p.match!.series) {
      expect(s.shots).toHaveLength(10);
      for (const sh of s.shots) {
        expect(sh.scatt_shot_id).not.toBeNull();
        expect(sh.t_ms).not.toBeNull();
      }
    }
  });

  it('keeps every SCATT shot outside the match as a loose shot (129 - 80 = 49)', () => {
    expect(p.loose_shots).toHaveLength(49);
    const matched = new Set(p.match!.series.flatMap((s) => s.shots.map((x) => x.scatt_shot_id)));
    for (const l of p.loose_shots) expect(matched.has(l.scatt_shot_id)).toBe(false);
    // probes are warm-up; match-flagged shots that are not in the match are failed attempts
    expect(p.loose_shots.filter((l) => l.kind === 'warmup')).toHaveLength(26);
    expect(p.loose_shots.filter((l) => l.kind === 'attempt')).toHaveLength(23);
  });

  it('carries the series figures and the shooter as owner', () => {
    const s1 = p.match!.series[0];
    expect(s1).toMatchObject({ idx: 1, total_decimal: 104.5, total: 100, mpi_x: -0.5, mpi_y: -0.4, group_mm: 8 });
    expect(s1.shots[0]).toMatchObject({ idx: 1, value: 10.6 });
    const inner = p.match!.series.flatMap((s) => s.shots).filter((x) => x.inner).length;
    expect(inner).toBe(sius.series.flatMap((s) => s.shots).filter((x) => x.inner).length);
    expect(p.training).toMatchObject({ shooter_id: 'user-1', discipline: 'air_rifle', trained_on: '2026-10-21' });
  });

  it('stores the selection so the import can be redone', () => {
    expect(p.match!.selection).toMatchObject({ kind: 'last', n: 80, ignoredScattIds: [] });
  });
});

describe('confirmation and ownership', () => {
  it('stores proposed unless the draft is confirmed', () => {
    expect(buildSavePayload(base, 'u').match!.align_state).toBe('proposed');
    expect(buildSavePayload({ ...base, confirmed: true }, 'u').match!.align_state).toBe('confirmed');
  });

  it('saves for another shooter when a coach names one', () => {
    expect(buildSavePayload({ ...base, shooterId: 'shooter-9' }, 'coach-1').training.shooter_id).toBe('shooter-9');
  });
});

describe('partial drafts', () => {
  it('saves a training with only a discipline: no match, no loose shots, a default name', () => {
    const p = buildSavePayload({ disciplineId: 'air_rifle', trainedOn: '2026-10-21', ignoredScattIds: [], hrOffsetMs: 0, confirmed: false }, 'u');
    expect(p.match).toBeNull();
    expect(p.loose_shots).toEqual([]);
    expect(p.hr_offset_ms).toBeNull();
    expect(p.training.name).toBe('21.10. Vazdušna puška');
  });

  it('keeps a custom name', () => {
    expect(buildSavePayload({ ...base, name: 'Jutarnji trening' }, 'u').training.name).toBe('Jutarnji trening');
  });

  it('SIUS without SCATT: shots keep their values and have no SCATT link', () => {
    const p = buildSavePayload({ ...base, scatt: undefined, selection: undefined }, 'u');
    expect(p.match!.series[0].shots.every((s) => s.scatt_shot_id === null && s.t_ms === null)).toBe(true);
    expect(p.loose_shots).toEqual([]);
  });

  it('SCATT without SIUS: no match, every SCATT shot is loose', () => {
    const p = buildSavePayload({ ...base, sius: undefined }, 'u');
    expect(p.match).toBeNull();
    expect(p.loose_shots).toHaveLength(129);
  });

  it('stores the heart-rate offset only when there are samples', () => {
    expect(buildSavePayload({ ...base, hr: [{ tMs: 1, bpm: 60 }], hrOffsetMs: 1500 }, 'u').hr_offset_ms).toBe(1500);
    expect(buildSavePayload({ ...base, hr: [], hrOffsetMs: 1500 }, 'u').hr_offset_ms).toBeNull();
  });
});

describe('hr_avg_bpm (average heart rate over the match shots)', () => {
  const times = buildSavePayload(base, 'u').match!.series.flatMap((x) => x.shots.map((y) => y.t_ms as number));
  const first = Math.min(...times);
  const last = Math.max(...times);

  it('averages only the samples inside the shot window, shifted by the offset', () => {
    const hr = [
      { tMs: first - 600_000, bpm: 50 }, // before the first shot: ignored
      { tMs: first - 1000, bpm: 80 }, // inside after a +2 s offset
      { tMs: last - 3000, bpm: 100 },
      { tMs: last + 600_000, bpm: 200 }, // after the last shot: ignored
    ];
    const p = buildSavePayload({ ...base, hr, hrOffsetMs: 2000 }, 'u');
    expect(p.hr_avg_bpm).toBe(90);
  });

  it('is null without samples, without shot times, or when no sample falls in the window', () => {
    expect(buildSavePayload(base, 'u').hr_avg_bpm).toBeNull();
    expect(buildSavePayload({ ...base, hr: [{ tMs: first - 600_000, bpm: 70 }] }, 'u').hr_avg_bpm).toBeNull();
    expect(buildSavePayload({ ...base, scatt: undefined, hr: [{ tMs: 1, bpm: 70 }] }, 'u').hr_avg_bpm).toBeNull();
  });
});

describe('ignored SCATT shots', () => {
  it('moves an ignored shot out of the alignment and keeps it as a loose shot', () => {
    const sorted = [...scatt.shots].sort((a, b) => a.tMs - b.tMs);
    const inside = sorted[sorted.length - 40].id;
    const p = buildSavePayload({ ...base, ignoredScattIds: [inside] }, 'u');
    const ids = p.match!.series.flatMap((s) => s.shots.map((x) => x.scatt_shot_id));
    expect(ids).not.toContain(inside);
    expect(p.loose_shots.some((l) => l.scatt_shot_id === inside)).toBe(true);
    expect(p.loose_shots).toHaveLength(50);
    // 79 usable SCATT shots for 80 SIUS shots: the last SIUS shot has no SCATT link
    expect(ids.filter((x) => x === null)).toHaveLength(1);
  });
});

describe('saveTraining', () => {
  it('sends the payload to save_training and returns the new id', async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: 'new-id', error: null };
      },
    };
    const r = await saveTraining(base, 'user-1', client);
    expect(r).toEqual({ trainingId: 'new-id' });
    expect((calls[0] as [string, { payload: unknown }])[0]).toBe('save_training');
  });

  it('throws when the database refuses', async () => {
    const client = { rpc: async () => ({ data: null, error: { message: 'denied' } }) };
    await expect(saveTraining(base, 'u', client)).rejects.toThrow('denied');
  });
});

describe('buildSavePayload: clock times and total-only series', () => {
  it('stores the start and end instants when given, null otherwise', () => {
    const p = buildSavePayload({ ...base, startedAt: '2026-10-21T15:00:00.000Z', endedAt: '2026-10-21T16:30:00.000Z' }, 'u');
    expect(p.training.started_at).toBe('2026-10-21T15:00:00.000Z');
    expect(p.training.ended_at).toBe('2026-10-21T16:30:00.000Z');
    expect(buildSavePayload(base, 'u').training.started_at).toBeNull();
  });

  it('keeps the typed total of a series that has no shots', () => {
    const manual = {
      discipline: 'Vazdušna puška', disciplineId: 'air_rifle' as const, total: 104, totalDecimal: 104.5,
      series: [{ index: 1, shots: [], total: 104, totalDecimal: 104.5 }],
    };
    const p = buildSavePayload({ ...base, sius: manual, scatt: undefined, selection: undefined }, 'u');
    expect(p.match!.series[0]).toMatchObject({ total: 104, total_decimal: 104.5, shots: [] });
  });
});
