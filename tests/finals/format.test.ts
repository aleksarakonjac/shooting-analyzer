import { describe, expect, it } from 'vitest';
import {
  FINAL_FORMATS,
  maxFinalShots,
  parseTimestamps,
  stageOfShot,
  stageTotals,
  validateFinal,
  validateFinalShot,
} from '@/lib/finals/format';

describe('final formats (spec 6a)', () => {
  it('air rifle and air pistol: two series of 5, then 14 single shots = 24', () => {
    for (const d of ['air_rifle', 'air_pistol'] as const) {
      expect(FINAL_FORMATS[d]).toEqual([
        { kind: 'series', shots: 5 },
        { kind: 'series', shots: 5 },
        { kind: 'singles', shots: 14 },
      ]);
      expect(maxFinalShots(d)).toBe(24);
    }
  });

  it('small-bore 3 positions: kneeling 10, prone 10, standing 5, standing 5, then 5 singles = 35', () => {
    const stages = FINAL_FORMATS.smallbore_3p;
    expect(stages.filter((s) => s.kind === 'series')).toEqual([
      { kind: 'series', shots: 10, position: 'kneeling' },
      { kind: 'series', shots: 10, position: 'prone' },
      { kind: 'series', shots: 5, position: 'standing' },
      { kind: 'series', shots: 5, position: 'standing' },
    ]);
    expect(stages.at(-1)).toEqual({ kind: 'singles', shots: 5 });
    expect(maxFinalShots('smallbore_3p')).toBe(35);
  });
});

describe('validateFinalShot', () => {
  it('accepts one decimal up to 10.9', () => {
    expect(validateFinalShot(10.9)).toEqual({ ok: true });
    expect(validateFinalShot(0)).toEqual({ ok: true });
    expect(validateFinalShot(9.4)).toEqual({ ok: true });
  });

  it('rejects two decimals, values above 10.9 and negatives', () => {
    expect(validateFinalShot(10.95)).toEqual({ ok: false, error: 'decimals' });
    expect(validateFinalShot(11)).toEqual({ ok: false, error: 'range' });
    expect(validateFinalShot(-0.1)).toEqual({ ok: false, error: 'range' });
    expect(validateFinalShot(Number.NaN)).toEqual({ ok: false, error: 'range' });
  });
});

describe('stageOfShot', () => {
  it('maps a 1-based shot number to its stage', () => {
    expect(stageOfShot('air_rifle', 1)).toEqual({ stageIdx: 0, indexInStage: 1 });
    expect(stageOfShot('air_rifle', 5)).toEqual({ stageIdx: 0, indexInStage: 5 });
    expect(stageOfShot('air_rifle', 6)).toEqual({ stageIdx: 1, indexInStage: 1 });
    expect(stageOfShot('air_rifle', 24)).toEqual({ stageIdx: 2, indexInStage: 14 });
    expect(stageOfShot('smallbore_3p', 31)).toEqual({ stageIdx: 4, indexInStage: 1 });
  });

  it('is undefined outside 1..max', () => {
    expect(stageOfShot('air_rifle', 0)).toBeUndefined();
    expect(stageOfShot('air_rifle', 25)).toBeUndefined();
  });
});

describe('stageTotals', () => {
  it('sums each stage and counts the shots entered', () => {
    const values = [10.1, 10.2, 10.3, 10.4, 10.5, 9.0, 9.1, null, null, null, ...Array(14).fill(null)];
    const t = stageTotals('air_rifle', values);
    expect(t).toEqual([
      { stageIdx: 0, shots: 5, total: 51.5 },
      { stageIdx: 1, shots: 2, total: 18.1 },
      { stageIdx: 2, shots: 0, total: 0 },
    ]);
  });
});

describe('validateFinal', () => {
  const v = (n: number) => Array.from({ length: n }, (_, i) => 10 + (i % 9) / 10);

  it('accepts a full 24-shot final without elimination', () => {
    expect(validateFinal('air_rifle', v(24), null, 1)).toEqual({ ok: true });
  });

  it('accepts an elimination after the last entered shot', () => {
    expect(validateFinal('air_rifle', v(18), 18, 5)).toEqual({ ok: true });
  });

  it('rejects an elimination point that does not match the shots entered', () => {
    expect(validateFinal('air_rifle', v(20), 18, null)).toEqual({ ok: false, error: 'eliminated' });
    expect(validateFinal('air_rifle', v(24), 24, null)).toEqual({ ok: false, error: 'eliminated' });
  });

  it('rejects an empty final, a gap and a bad shot', () => {
    expect(validateFinal('air_rifle', [], null, null)).toEqual({ ok: false, error: 'empty' });
    expect(validateFinal('air_rifle', [10.1, null, 10.3], null, null)).toEqual({ ok: false, error: 'gap' });
    expect(validateFinal('air_rifle', [10.1, 10.95], null, null)).toEqual({ ok: false, error: 'decimals' });
  });

  it('rejects more shots than the format has and a bad placement', () => {
    expect(validateFinal('air_rifle', v(25), null, null)).toEqual({ ok: false, error: 'range' });
    expect(validateFinal('air_rifle', v(24), null, 0)).toEqual({ ok: false, error: 'placement' });
    expect(validateFinal('air_rifle', v(24), null, 2.5)).toEqual({ ok: false, error: 'placement' });
  });
});

describe('parseTimestamps', () => {
  const TZ = 'Europe/Belgrade';

  it('reads epoch milliseconds, ISO with offset and local wall time (one per line)', () => {
    const r = parseTimestamps('1792596598645\n2026-10-21T19:03:09+02:00\n2026-10-21 19:03:10.250\n', TZ, 24);
    expect(r).toEqual({
      ok: true,
      tMs: [1792596598645, Date.parse('2026-10-21T17:03:09Z'), Date.parse('2026-10-21T17:03:10.250Z')],
    });
  });

  it('ignores blank lines and surrounding spaces', () => {
    expect(parseTimestamps('\n  1792596598645  \n\n', TZ, 24)).toEqual({ ok: true, tMs: [1792596598645] });
  });

  it('reports the first line it cannot read', () => {
    expect(parseTimestamps('1792596598645\nnot a time', TZ, 24)).toEqual({ ok: false, error: 'invalid', line: 2 });
  });

  it('rejects more timestamps than the final has shots', () => {
    const lines = Array.from({ length: 25 }, (_, i) => String(1792596598645 + i)).join('\n');
    expect(parseTimestamps(lines, TZ, 24)).toEqual({ ok: false, error: 'toomany' });
  });
});

import { buildFinalPayload } from '@/lib/finals/format';

describe('buildFinalPayload', () => {
  it('turns typed cells into shots with stage indexes and times, ignoring trailing blanks', () => {
    const cells = ['10.1', '10,2', '10.3', '10.4', '10.5', '9.9', '', ...Array(17).fill('')];
    const r = buildFinalPayload('air_rifle', cells, '3', '', [1000, 2000]);
    if (!r.ok) throw new Error('expected ok');
    expect(r.payload.placement).toBe(3);
    expect(r.payload.eliminated_after_shot).toBeNull();
    expect(r.payload.shots.map((s) => [s.idx, s.stage_idx, s.value, s.t_ms])).toEqual([
      [1, 0, 10.1, 1000], [2, 0, 10.2, 2000], [3, 0, 10.3, null], [4, 0, 10.4, null], [5, 0, 10.5, null], [6, 1, 9.9, null],
    ]);
  });

  it('reports the first problem', () => {
    expect(buildFinalPayload('air_rifle', ['10.95'], '', '', [])).toEqual({ ok: false, error: 'decimals' });
    expect(buildFinalPayload('air_rifle', [], '', '', [])).toEqual({ ok: false, error: 'empty' });
  });
});
