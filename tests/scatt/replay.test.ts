import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScattTraces } from '@/lib/parsers/scatt';
import { displayIndex, displaySamples, minCircle, OUT_RATE } from '@/lib/scatt/display';
import { angleAt, buildReplay, endFor, pointAt, segmentsUpTo } from '@/lib/scatt/replay';
import type { TraceSamples } from '@/lib/scatt/decode';

const file = new Uint8Array(readFileSync(join(__dirname, '../fixtures/export_2026-10-22_14.11.scatt-expert')));

/** A synthetic 100 Hz trace: x = i/100 mm, y = 0, angle = 0.01 rad per sample. */
function ramp(n: number): TraceSamples {
  return {
    x: Float64Array.from({ length: n }, (_, i) => i / 100),
    y: new Float64Array(n),
    angle: Float64Array.from({ length: n }, (_, i) => 0.01 * i),
    trigger: null,
  };
}

describe('buildReplay', () => {
  it('cuts the trace into the four SCATT colour segments around the shot', () => {
    const r = buildReplay(ramp(1000), 800, 100);
    expect(r.rate).toBe(OUT_RATE);
    const shot = r.shot;
    expect(r.segments.map((s) => s.kind)).toEqual(['before', 'control', 'last250', 'after']);
    expect(r.segments[0]).toEqual({ kind: 'before', from: 0, to: shot - 200 });
    expect(r.segments[1]).toEqual({ kind: 'control', from: shot - 200, to: shot - 50 });
    expect(r.segments[2]).toEqual({ kind: 'last250', from: shot - 50, to: shot });
    expect(r.segments[3].from).toBe(shot);
    expect(r.segments[3].to).toBe(r.x.length - 1);
  });

  it('keeps at most 60 s before and 2 s after the shot', () => {
    const r = buildReplay(ramp(10_000), 9000, 100);
    expect(r.shot).toBe(60 * OUT_RATE);
    expect(r.x.length - 1 - r.shot).toBeLessThanOrEqual(2 * OUT_RATE);
  });

  it('drops segments that are empty when the trace starts inside the control interval', () => {
    const r = buildReplay(ramp(200), 50, 100);
    expect(r.segments.map((s) => s.kind)).toEqual(['control', 'last250', 'after']);
    expect(r.segments[0].from).toBe(0);
  });

  it('uses the display samples and the hold circle of the control interval', async () => {
    const f = await readScattTraces(file);
    const s = f.shots.find((x) => x.match && !x.missed)!;
    const tr = f.traces.get(s.traceId)!;
    const r = buildReplay(tr, s.offset, f.sampleRate);
    const D = displaySamples(tr.x, tr.y, f.sampleRate);
    const di = Math.min(displayIndex(s.offset, f.sampleRate), D.x.length - 1);
    const start = di - r.shot;
    expect(r.x[r.shot]).toBeCloseTo(D.x[di], 9);
    expect(r.y[0]).toBeCloseTo(D.y[start], 9);
    const c = minCircle(D.x.slice(Math.max(0, di - 200), di + 1), D.y.slice(Math.max(0, di - 200), di + 1));
    expect(r.hold.r).toBeCloseTo(c.r, 9);
    expect(r.angle).not.toBeNull();
  });

  it('converts the tilt to degrees and leaves it null when not recorded', () => {
    const r = buildReplay(ramp(400), 300, 100);
    // display index 2 is raw sample 1: 0.01 rad
    expect(r.angle![2]).toBeCloseTo((0.01 * 180) / Math.PI, 6);
    const none = buildReplay({ ...ramp(400), angle: null }, 300, 100);
    expect(none.angle).toBeNull();
  });
});

describe('replay helpers', () => {
  const r = buildReplay(ramp(1000), 800, 100);

  it('ends the replay the chosen time after the shot, never past the data', () => {
    expect(endFor(r, 1)).toBe(r.shot + OUT_RATE);
    expect(endFor(r, 0.5)).toBe(r.shot + OUT_RATE / 2);
    expect(endFor(r, 99)).toBe(r.x.length - 1);
  });

  it('interpolates the aim point between samples', () => {
    const p = pointAt(r, 10.5);
    expect(p.x).toBeCloseTo((r.x[10] + r.x[11]) / 2, 9);
    expect(pointAt(r, 1e9).x).toBe(r.x[r.x.length - 1]);
    expect(pointAt(r, -5).x).toBe(r.x[0]);
  });

  it('shows only the part of each segment that has been drawn', () => {
    const drawn = segmentsUpTo(r, r.shot - 100, endFor(r, 1));
    expect(drawn.map((s) => s.kind)).toEqual(['before', 'control']);
    expect(drawn[1].to).toBe(r.shot - 100);
    const all = segmentsUpTo(r, 1e9, endFor(r, 0.5));
    expect(all.at(-1)).toEqual({ kind: 'after', from: r.shot, to: r.shot + OUT_RATE / 2 });
  });

  it('smooths the tilt over the last 0.1 s', () => {
    const k = 100;
    const n = OUT_RATE / 10;
    const mean = r.angle!.slice(k - n + 1, k + 1).reduce((a, b) => a + b, 0) / n;
    expect(angleAt(r, k)).toBeCloseTo(mean, 9);
    expect(angleAt({ ...r, angle: null }, k)).toBeNull();
  });
});
