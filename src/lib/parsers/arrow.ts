const ARROWS = '→↗↑↖←↙↓↘';

/** The nearest of the eight SIUS arrows for a direction in degrees (0 = right, counter-clockwise). */
export const arrowForAngle = (deg: number): string => ARROWS[((Math.round(deg / 45) % 8) + 8) % 8];

/** The variance along the arrow is at least this many times the one across it; a blob without a direction is not. */
const MIN_ELONGATION = 2;
/** A thin tail with a heavy head is clearly lopsided along its length (about 0.5 and up in real reports). */
const MIN_SKEW = 0.15;

/**
 * The direction (degrees, 0 = right, counter-clockwise) of a small arrow picture, as RGBA pixels, or null when the
 * picture shows none. Dark pixels are the arrow. Its axis is the one along which they spread most; the thin tail
 * reaches farther from their centre than the heavy head, which tells the two ends apart.
 */
export function arrowAngleFromMask(rgba: ArrayLike<number>, width: number, height: number): number | null {
  const ink = (i: number) => (rgba[i + 3] / 255) * (1 - (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 765);
  let w = 0;
  let cx = 0;
  let cy = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const m = ink((row * width + col) * 4);
      w += m;
      cx += m * col;
      cy -= m * row;
    }
  }
  if (!(w > 0)) return null;
  cx /= w;
  cy /= w;

  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const m = ink((row * width + col) * 4);
      const dx = col - cx;
      const dy = -row - cy;
      xx += m * dx * dx;
      yy += m * dy * dy;
      xy += m * dx * dy;
    }
  }
  const mid = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  if (mid + spread < MIN_ELONGATION * (mid - spread)) return null;
  const axis = Math.atan2(2 * xy, xx - yy) / 2;

  let third = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const u = (col - cx) * Math.cos(axis) + (-row - cy) * Math.sin(axis);
      third += ink((row * width + col) * 4) * u ** 3;
    }
  }
  const skew = (third * Math.sqrt(w)) / (mid + spread) ** 1.5;
  if (!(Math.abs(skew) >= MIN_SKEW)) return null;
  const deg = (axis * 180) / Math.PI + (skew > 0 ? 180 : 0);
  return ((deg % 360) + 360) % 360;
}

/** What a report's arrow picture says: the nearest arrow with the measured angle ("→350"), "•" when it is blank (dead centre), null when unreadable. */
export function readArrow(rgba: ArrayLike<number>, width: number, height: number): string | null {
  const angle = arrowAngleFromMask(rgba, width, height);
  if (angle !== null) return `${arrowForAngle(angle)}${Math.round(angle) % 360}`;
  for (let i = 3; i < width * height * 4; i += 4) if (rgba[i] !== 0) return null;
  return '•';
}
