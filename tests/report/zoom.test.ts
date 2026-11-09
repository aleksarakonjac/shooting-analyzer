import { describe, expect, it } from 'vitest';
import { wheelGesture, zoomWindow, panWindow } from '@/lib/report/zoom';

describe('zoomWindow', () => {
  it('zooms in around the cursor, keeping the point under it in place', () => {
    const w = zoomWindow({ start: 0, end: 100 }, 0.25, 0.5);
    expect(w.start).toBeCloseTo(12.5);
    expect(w.end).toBeCloseTo(62.5);
  });

  it('stays inside 0..100 and never narrower than the minimum span', () => {
    expect(zoomWindow({ start: 0, end: 100 }, 0.5, 4)).toEqual({ start: 0, end: 100 });
    const tight = zoomWindow({ start: 40, end: 42 }, 0.5, 0.1);
    expect(tight.end - tight.start).toBeCloseTo(1);
  });
});

describe('panWindow', () => {
  it('moves the window by a share of its width and stops at the edges', () => {
    expect(panWindow({ start: 20, end: 40 }, 0.5)).toEqual({ start: 30, end: 50 });
    expect(panWindow({ start: 80, end: 95 }, 1)).toEqual({ start: 85, end: 100 });
    expect(panWindow({ start: 5, end: 25 }, -1)).toEqual({ start: 0, end: 20 });
  });
});

describe('wheelGesture', () => {
  it('reads a trackpad pinch (ctrl + wheel) as zoom', () => {
    const g = wheelGesture({ deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: true }, 600);
    expect(g.kind).toBe('zoom');
    expect(g.kind === 'zoom' && g.factor).toBeLessThan(1);
  });

  it('reads a sideways swipe as a pan', () => {
    const g = wheelGesture({ deltaX: 60, deltaY: 4, deltaMode: 0, ctrlKey: false }, 600);
    expect(g).toEqual({ kind: 'pan', share: 0.1 });
  });

  it('zooms gently on a mouse-wheel notch', () => {
    const g = wheelGesture({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false }, 600);
    expect(g.kind).toBe('zoom');
    if (g.kind === 'zoom') {
      expect(g.factor).toBeGreaterThan(1);
      expect(g.factor).toBeLessThan(1.2);
    }
  });
});
