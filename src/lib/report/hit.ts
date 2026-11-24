import type { ScattTarget } from '@/lib/scatt/targets';

/** Distance from the centre at which a ring's score is just earned (the pellet radius widens each ring), 0 beyond ring 10's inside. */
const ringReach = (tg: ScattTarget, n: number): number => (n > 10 ? 0 : n < 1 ? Infinity : (tg.rings[n] + tg.caliber) / 2);

/**
 * The band of centre distances (mm) a SIUS score can come from, or null for a miss or an unreadable value.
 * Decimal scores are linear inside each ring (SCATT's decimalScore, inverted): one tenth is a tenth of the ring width,
 * 0.25 mm on the air-rifle target. Whole-ring scores give the whole ring.
 */
export function radiusBand(value: number, decimal: boolean, tg: ScattTarget): { lo: number; hi: number } | null {
  if (!(value >= 1)) return null;
  if (!decimal) {
    const n = Math.floor(value + 1e-9);
    return n > 10 ? null : { lo: ringReach(tg, n + 1), hi: ringReach(tg, n) };
  }
  const at = (v: number) => {
    const n = Math.min(10, Math.floor(v + 1e-9));
    const outer = ringReach(tg, n);
    return outer - (v - n) * (outer - ringReach(tg, n + 1));
  };
  const v = Math.round(value * 10) / 10;
  return { lo: v >= 10.9 ? 0 : at(v + 0.1), hi: at(Math.min(v, 10.9)) };
}

const ARROWS: Record<string, number> = { '→': 0, '↗': 45, '↑': 90, '↖': 135, '←': 180, '↙': 225, '↓': 270, '↘': 315 };

/** SIUS drew no arrow because the hit is dead in the centre (see readArrow in the parsers). */
const CENTRE = '•';
/** An arrow measured from its picture carries its angle: "→350". */
const MEASURED = /^[→↗↑↖←↙↓↘](\d{1,3})$/;

/**
 * The direction (degrees, 0 = right, counter-clockwise, y up) of a SIUS arrow, or null. A bare arrow is a 45° step;
 * one measured from the report's picture has its own angle.
 */
export function arrowAngle(direction: string | null | undefined): number | null {
  if (!direction) return null;
  const measured = MEASURED.exec(direction);
  if (measured) return Number(measured[1]);
  return ARROWS[[...direction][0]] ?? null;
}

const isMeasured = (direction: string | null | undefined) => Boolean(direction && MEASURED.test(direction));
/** Only a ten can be in the centre: a blank arrow at any other score says nothing. */
const isCentre = (value: number, direction: string | null | undefined) => direction === CENTRE && value >= 10;

/** Half of the 45° step of the SIUS arrow: an angle inside it agrees with the arrow. */
export const ARROW_HALF_STEP = 22.5;

/**
 * How sure the drawn position is. The distance always comes from the SIUS score (within one tenth, 0.25 mm on the air rifle);
 * what varies is the direction: confirmed by the SIUS arrow, only SCATT's (no arrow to check it), or the arrow's alone
 * because SCATT disagreed (good to about 22 degrees), or the angle measured from the SIUS arrow (good to about a degree).
 */
export type HitConfidence = 'verified' | 'scatt-only' | 'arrow-only' | 'sius-angle' | 'sius';

export interface CorrectedHit {
  confidence: HitConfidence;
  x: number;
  y: number;
  /** How far (mm) the corrected hit lies from the SCATT point. */
  movedMm: number;
  /** The SCATT direction disagreed with the SIUS arrow and was replaced. */
  turned: boolean;
}

const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * SCATT's hit point set against what SIUS measured: the distance is forced into the band of the SIUS score,
 * and the direction is kept when it agrees with the SIUS arrow (SCATT's is finer) and replaced by the arrow
 * when it does not. An arrow with a measured angle is finer than SCATT and always gives the direction.
 * Without an arrow the SCATT direction stays.
 */
export function correctHit(
  scatt: { x: number; y: number },
  value: number,
  decimal: boolean,
  tg: ScattTarget,
  direction?: string | null,
): CorrectedHit {
  const band = radiusBand(value, decimal, tg);
  const r = Math.hypot(scatt.x, scatt.y);
  if (isCentre(value, direction)) return { x: 0, y: 0, movedMm: r, turned: false, confidence: 'sius-angle' };
  let angle = r > 1e-9 ? (Math.atan2(scatt.y, scatt.x) * 180) / Math.PI : null;
  const arrow = arrowAngle(direction);
  let turned = false;
  if (arrow !== null && (angle === null || Math.abs(wrap(angle - arrow)) > ARROW_HALF_STEP)) {
    turned = angle !== null;
    angle = arrow;
  }
  const measured = isMeasured(direction);
  if (measured) angle = arrow;
  const radius = band ? Math.min(band.hi, Math.max(band.lo, r)) : r;
  if (angle === null) return { x: scatt.x, y: scatt.y, movedMm: 0, turned: false, confidence: 'scatt-only' };
  const x = radius * Math.cos((angle * Math.PI) / 180);
  const y = radius * Math.sin((angle * Math.PI) / 180);
  const confidence: HitConfidence = measured ? 'sius-angle' : turned ? 'arrow-only' : arrow !== null ? 'verified' : 'scatt-only';
  return { x, y, movedMm: Math.hypot(x - scatt.x, y - scatt.y), turned, confidence };
}

/**
 * Where to draw a hit from SIUS alone (no SCATT trace): its coordinates when SIUS measured them (SIUS Cloud),
 * otherwise the middle of its score band in the direction of the SIUS arrow (about ±1° when measured, else ±22°).
 * Null when there is neither, or for a miss.
 */
export function siusHitPoint(
  shot: { value: number; x: number | null; y: number | null; direction: string | null },
  decimal: boolean,
  tg: ScattTarget,
): { x: number; y: number; confidence: HitConfidence } | null {
  if (shot.x !== null && shot.y !== null) return { x: shot.x, y: shot.y, confidence: 'sius' };
  if (isCentre(shot.value, shot.direction)) return { x: 0, y: 0, confidence: 'sius-angle' };
  const angle = arrowAngle(shot.direction);
  const band = radiusBand(shot.value, decimal, tg);
  if (angle === null || !band) return null;
  const r = (band.lo + band.hi) / 2;
  return { x: r * Math.cos((angle * Math.PI) / 180), y: r * Math.sin((angle * Math.PI) / 180), confidence: isMeasured(shot.direction) ? 'sius-angle' : 'arrow-only' };
}
