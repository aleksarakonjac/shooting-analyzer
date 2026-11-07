import { XMLParser } from 'fast-xml-parser';
import { zonedWallTimeToUtcMs } from '@/lib/time/zone';

export interface HrSample {
  /** Unix epoch milliseconds, UTC. */
  tMs: number;
  bpm: number;
}

interface RawPoint {
  time: string;
  bpm?: number;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // keep <Time> text exactly as written
  isArray: (name) => name === 'Trackpoint',
});

function rawPoints(xml: string): RawPoint[] {
  const doc = parser.parse(xml);
  const points: RawPoint[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'Trackpoint' && Array.isArray(val)) {
        for (const tp of val as Record<string, unknown>[]) {
          const time = typeof tp.Time === 'string' ? tp.Time : undefined;
          if (!time) continue;
          const hr = tp.HeartRateBpm as { Value?: string } | undefined;
          const bpm = hr?.Value !== undefined ? Number(hr.Value) : undefined;
          points.push({ time, bpm });
        }
      } else walk(val);
    }
  };
  walk(doc);
  return points;
}

const valid = (bpm: number | undefined): bpm is number => bpm !== undefined && Number.isFinite(bpm) && bpm > 0;
const bySampleTime = (a: HrSample, b: HrSample) => a.tMs - b.tMs;

/** Parses a TCX file honouring the written UTC offset. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

export interface ParsedTcx {
  samples: HrSample[];
  startLocalAsWritten: string;
  /** True when some <Time> carried no UTC offset; those were read as UTC, so the UI should offer zone reinterpretation. */
  missingOffset: boolean;
}

export function parseTcx(xml: string): ParsedTcx {
  const points = rawPoints(xml);
  const samples: HrSample[] = [];
  let missingOffset = false;
  for (const p of points) {
    const hasOffset = HAS_OFFSET.test(p.time);
    if (!hasOffset) missingOffset = true;
    // Date.parse of an offset-less time uses the device zone; pin it to UTC instead.
    const tMs = Date.parse(hasOffset ? p.time : `${p.time}Z`);
    if (Number.isFinite(tMs) && valid(p.bpm)) samples.push({ tMs, bpm: p.bpm });
  }
  samples.sort(bySampleTime);
  return { samples, startLocalAsWritten: points[0]?.time ?? '', missingOffset };
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/;

/** Ignores the written offset and treats each wall-clock time as local time in `tz`. */
export function reinterpretAsZone(xml: string, tz: string): HrSample[] {
  const samples: HrSample[] = [];
  for (const p of rawPoints(xml)) {
    const m = WALL.exec(p.time);
    if (!m || !valid(p.bpm)) continue;
    const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
    const ms = m[7] ? Number(m[7].padEnd(3, '0').slice(0, 3)) : 0;
    samples.push({ tMs: zonedWallTimeToUtcMs(y, mo, d, h, mi, s, ms, tz), bpm: p.bpm });
  }
  return samples.sort(bySampleTime);
}

/**
 * Samples whose corrected time (tMs + offsetMs) lies in [fromMs, toMs].
 * Returned samples carry the corrected time so they sit on the shot clock.
 */
export function hrWindow(samples: HrSample[], fromMs: number, toMs: number, offsetMs: number): HrSample[] {
  const out: HrSample[] = [];
  for (const s of samples) {
    const t = s.tMs + offsetMs;
    if (t >= fromMs && t <= toMs) out.push({ tMs: t, bpm: s.bpm });
  }
  return out;
}
