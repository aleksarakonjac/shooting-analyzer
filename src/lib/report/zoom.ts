/** The visible part of a chart's x axis, as ECharts dataZoom percentages (0..100). */
export interface ZoomWindow {
  start: number;
  end: number;
}

/** Never zoom in past 1 % of the axis. */
const MIN_SPAN = 1;

const clampWindow = (start: number, span: number): ZoomWindow => {
  const s = Math.min(Math.max(0, start), 100 - span);
  return { start: s, end: s + span };
};

/** Scale the window by `factor` (< 1 zooms in) around the point at `at` (0..1 across the window). */
export function zoomWindow(w: ZoomWindow, at: number, factor: number): ZoomWindow {
  const span = w.end - w.start;
  const next = Math.min(100, Math.max(MIN_SPAN, span * factor));
  const anchor = w.start + at * span;
  return clampWindow(anchor - at * next, next);
}

/** Move the window by `share` of its own width (positive moves right). */
export function panWindow(w: ZoomWindow, share: number): ZoomWindow {
  const span = w.end - w.start;
  return clampWindow(w.start + share * span, span);
}

export type WheelGesture = { kind: 'zoom'; factor: number } | { kind: 'pan'; share: number };

/**
 * What a wheel event means on a chart `width` pixels wide:
 * a trackpad pinch (the browser reports it as ctrl + wheel) zooms, a sideways swipe pans,
 * and an upright wheel zooms at a low rate so one mouse notch is a small step.
 */
export function wheelGesture(
  e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean },
  width: number,
): WheelGesture {
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(dy * 0.01) };
  if (Math.abs(dx) > Math.abs(dy)) return { kind: 'pan', share: dx / Math.max(1, width) };
  return { kind: 'zoom', factor: Math.exp(dy * 0.0015) };
}
