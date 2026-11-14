import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScattTraces } from '@/lib/parsers/scatt';
import { analyseShots, intervalStability } from '@/lib/scatt/analysis';
import { SCATT_TARGETS } from '@/lib/scatt/targets';

const file = new Uint8Array(readFileSync(join(__dirname, '../fixtures/export_2026-10-22_14.11.scatt-expert')));
const [head, ...lines] = readFileSync(join(__dirname, '../fixtures/scatt/analysis_expected.csv'), 'utf8').trim().split('\n');
const keys = head.split(',');
const expected = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [keys[i], v])));

describe('SCATT shot analysis (sample, against the reference implementation)', () => {
  it('matches every shot and metric of re/analysis.py', async () => {
    const f = await readScattTraces(file);
    const rows = await analyseShots(f, SCATT_TARGETS.ar10);
    expect(rows).toHaveLength(expected.length);
    const byId = new Map(rows.map((r) => [r.shotId, r]));
    for (const e of expected) {
      const r = byId.get(Number(e.shot_id))!;
      expect(r, `shot ${e.shot_id}`).toBeDefined();
      expect(r.x).toBeCloseTo(Number(e.x), 3);
      expect(r.y).toBeCloseTo(-Number(e.y), 3); // the reference keeps SCATT's y down; ours is y up
      expect(r.score).toBe(Number(e.score));
      expect(r.aimingMs).toBe(Number(e.aiming_ms));
      expect(r.shotMs).toBe(Number(e.shot_time_ms));
      if (e.speed === '' || e.speed === undefined) {
        expect(r.metrics).toBeNull();
        continue;
      }
      const m = r.metrics!;
      expect(m.hold10Abs).toBe(Number(e.h10_abs));
      expect(m.hold10Rel).toBe(Number(e.h10_rel));
      expect(m.hold9Abs).toBe(Number(e.hz_abs));
      expect(m.hold9Rel).toBe(Number(e.hz_rel));
      expect(m.hold8Abs).toBe(Number(e.hz2_abs));
      expect(m.speed).toBeCloseTo(Number(e.speed), 2);
      expect(m.speedX).toBeCloseTo(Number(e.speed_x), 2);
      expect(m.speedY).toBeCloseTo(Number(e.speed_y), 2);
      expect(m.speed250).toBeCloseTo(Number(e.speed_250ms), 2);
      expect(m.aapX).toBeCloseTo(Number(e.aap_x), 2);
      expect(m.aapY).toBeCloseTo(-Number(e.aap_y), 2);
      expect(m.boxW).toBeCloseTo(Number(e.box_w), 2);
      expect(m.boxH).toBeCloseTo(Number(e.box_h), 2);
      expect(m.holdCircleD).toBeCloseTo(Number(e.hold_circle_d), 2);
      expect(m.breachFromAap).toBeCloseTo(Number(e.breach_from_aap), 2);
    }
  });

  it('interval stability: 100 below three shots, lower with uneven gaps', () => {
    expect(intervalStability([0, 1000])).toBe(100);
    expect(intervalStability([0, 1000, 2000, 3000])).toBe(100);
    expect(intervalStability([0, 1000, 5000])).toBe(40); // gaps 1 s and 4 s: mean 2.5, deviation 3 s over 5 s
  });
});

describe('scattTargetFor', () => {
  it('gives every discipline its target', async () => {
    const { scattTargetFor } = await import('@/lib/scatt/targets');
    expect(scattTargetFor('air_rifle')?.id).toBe('ar10');
    expect(scattTargetFor('air_pistol')?.id).toBe('ap10');
    expect(scattTargetFor('smallbore_3p')?.id).toBe('sbr50');
    expect(scattTargetFor('smallbore_3p').caliber).toBe(5.6);
  });
});
