import { describe, expect, it } from 'vitest';
import { arrowAngleFromMask, arrowForAngle, readArrow } from '@/lib/parsers/arrow';

const N = 24;

/** A thin tail with a thick triangular head, turned by `deg` (0 = right, counter-clockwise) about the middle of the image. */
function drawArrow(deg: number): Uint8ClampedArray {
  const a = (deg * Math.PI) / 180;
  const px = new Uint8ClampedArray(N * N * 4);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const x = col + 0.5 - N / 2;
      const y = N / 2 - (row + 0.5);
      const u = x * Math.cos(a) + y * Math.sin(a);
      const v = Math.abs(y * Math.cos(a) - x * Math.sin(a));
      const tail = u >= -10 && u <= 4 && v <= 1;
      const head = u >= 4 && u <= 10 && v <= (10 - u) * 0.7;
      if (tail || head) px[(row * N + col) * 4 + 3] = 255;
    }
  }
  return px;
}

describe('arrowAngleFromMask', () => {
  it.each([0, 30, 45, 90, 142, 180, 217, 270, 329])('reads an arrow pointing at %i degrees', (deg) => {
    const got = arrowAngleFromMask(drawArrow(deg), N, N)!;
    const off = ((((got - deg + 180) % 360) + 360) % 360) - 180;
    expect(Math.abs(off)).toBeLessThan(5);
  });

  it('ignores an opaque white background', () => {
    const px = drawArrow(90);
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) px.fill(255, i, i + 4);
    }
    expect(arrowAngleFromMask(px, N, N)).toBeCloseTo(90, 0);
  });

  it('gives nothing for an empty image or one without a direction', () => {
    expect(arrowAngleFromMask(new Uint8ClampedArray(N * N * 4), N, N)).toBeNull();
    const full = new Uint8ClampedArray(N * N * 4);
    for (let i = 3; i < full.length; i += 4) full[i] = 255;
    expect(arrowAngleFromMask(full, N, N)).toBeNull();
  });
});

describe('readArrow', () => {
  it('gives the nearest arrow with the measured angle', () => {
    expect(readArrow(drawArrow(90), N, N)).toMatch(/^↑(89|90|91)$/);
    expect(readArrow(drawArrow(0), N, N)).toMatch(/^→(359|0|1)$/);
  });

  it('a blank picture is a hit dead in the centre; an unreadable one is nothing', () => {
    expect(readArrow(new Uint8ClampedArray(N * N * 4), N, N)).toBe('•');
    const full = new Uint8ClampedArray(N * N * 4);
    for (let i = 3; i < full.length; i += 4) full[i] = 255;
    expect(readArrow(full, N, N)).toBeNull();
  });
});

describe('arrowForAngle', () => {
  it('takes the nearest of the eight SIUS arrows', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(arrowForAngle).join('')).toBe('→↗↑↖←↙↓↘');
    expect([350, 22, 23, -10, 359.9].map(arrowForAngle).join('')).toBe('→→↗→→');
  });
});
