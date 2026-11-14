import { CHART, escapeHtml } from '@/lib/report/charts';
import type { ChartKind } from './filters';
import type { SessionPoint } from './periodStats';

const axis = {
  axisLine: { lineStyle: { color: CHART.rule } },
  axisTick: { show: false },
  axisLabel: { color: CHART.muted, fontFamily: CHART.font, fontSize: 12 },
  splitLine: { lineStyle: { color: CHART.rule, type: 'dashed' as const } },
  nameTextStyle: { color: CHART.muted, fontFamily: CHART.font },
};

const CHART_META: Record<ChartKind, { name: string; unit: string; pick: (p: SessionPoint) => number | null; digits: number }> = {
  rez: { name: 'Rezultat', unit: '', pick: (p) => p.matchScore, digits: 1 },
  puls: { name: 'Prosečan puls', unit: 'otk/min', pick: (p) => p.hr, digits: 0 },
  grupa: { name: 'Prosečna grupa', unit: 'mm', pick: (p) => p.avgGroupMm, digits: 1 },
};

const DAY_MS = 86_400_000;

/** "1 serija", "3 serije", "8 serija" */
export const seriesWord = (n: number) => {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? 'serija' : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 'serije' : 'serija';
};

type NiceAxis = { min: number; max: number; interval: number };

/** A value axis that never gets narrower than `minSpan`, centred on the data with a little room, on round ticks. */
function niceAxis(values: number[], minSpan: number, intervalFor: (span: number) => number, floor?: number): NiceAxis | null {
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(minSpan, (hi - lo) * 1.3);
  const interval = intervalFor(span);
  const mid = (lo + hi) / 2;
  let min = Math.floor((mid - span / 2) / interval) * interval;
  const max = Math.ceil((mid + span / 2) / interval) * interval;
  if (floor !== undefined) min = Math.max(floor, min);
  return { min, max, interval };
}

/** Score axis: never narrower than 6 points, so a few points between sessions read as a few points, not a cliff.
 *  Labels every point, a faint 0.5 grid between them for reading values finely. */
export function scoreAxis(values: number[]): NiceAxis | null {
  return niceAxis(values, 6, (span) => (span <= 14 ? 1 : span <= 30 ? 5 : 10));
}

/** Heart-rate axis (bpm): at least 20 wide, so a few beats between sessions do not look like a swing. */
export function pulseAxis(values: number[]): NiceAxis | null {
  return niceAxis(values, 20, (span) => (span <= 40 ? 5 : span <= 100 ? 10 : 20));
}

/** Group axis (mm): at least 2 wide, never below zero (a group cannot be smaller than none). */
export function groupAxis(values: number[]): NiceAxis | null {
  return niceAxis(values, 2, (span) => (span <= 4 ? 0.5 : span <= 10 ? 1 : 2), 0);
}

/** Tooltip lines under the score: what the plotted figure is made of. */
export function scoreDetail(p: SessionPoint, decimal: boolean): string[] {
  const f = (v: number) => v.toFixed(decimal ? 1 : 0);
  const n = p.matchSeries;
  const k = p.seriesCount;
  if (p.matchScore === null || p.total === null) return [];
  if (n === null || (k === n && !p.projected)) {
    return [`Rezultat (${k} ${seriesWord(k)}): ${f(p.matchScore)}`, ...(p.avgSeries !== null ? [`Prosek serije: ${p.avgSeries.toFixed(1)}`] : [])];
  }
  if (p.projected) {
    const avg = p.total / k;
    return [
      `Procena za ${n} serija: ${f(p.matchScore)}`,
      `Ukupno (${k} ${seriesWord(k)}): ${f(p.total)}`,
      `Prosek serije: ${avg.toFixed(1)}`,
      // Two decimals here, so the multiplication shown adds up to the figure plotted
      `Računato: ${avg.toFixed(2)} × ${n} = ${f(p.matchScore)}`,
    ];
  }
  return [
    `Rezultat (prvih ${n} serija): ${f(p.matchScore)}`,
    `Ukupno (${k} ${seriesWord(k)}): ${f(p.total)}`,
    ...(p.avgSeries !== null ? [`Prosek serije (${k}): ${p.avgSeries.toFixed(1)}`] : []),
  ];
}

/** One figure per session over the calendar: the session's total score, average heart rate or average group. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sessionsOption(points: SessionPoint[], kind: ChartKind, decimal: boolean): any {
  const m = CHART_META[kind];
  const data = points
    .map((p) => ({ p, v: m.pick(p) }))
    .filter((x): x is { p: SessionPoint; v: number } => x.v !== null)
    .map(({ p, v }) => ({
      id: p.id,
      name: p.name,
      detail: kind === 'rez' ? scoreDetail(p, decimal) : [],
      value: [Date.parse(`${p.trainedOn}T00:00:00`), v],
      // An estimate (fewer series than a match) is a hollow ring, not a filled dot: a form, not only a word in the tooltip.
      ...(kind === 'rez' && p.projected ? { itemStyle: { color: '#0b1530', borderColor: CHART.data, borderWidth: 2 } } : {}),
    }));
  const ys = data.map((d) => d.value[1]);
  const fixedAxis = kind === 'rez' ? scoreAxis(ys) : kind === 'puls' ? pulseAxis(ys) : groupAxis(ys);
  // Round ticks, each with a faint grid line halfway (the score keeps its 0.5-point lines).
  const minorParts = kind === 'rez' ? (fixedAxis?.interval ?? 1) * 2 : 2;
  // Ticks never fall within a day, so a date is never labelled twice; a short span is padded to at least a day each side.
  const xs = data.map((d) => d.value[0]);
  const lo = xs.length ? Math.min(...xs) : 0;
  const hi = xs.length ? Math.max(...xs) : 0;
  const padX = Math.max(DAY_MS, (hi - lo) * 0.04);
  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getDate()}. ${d.getMonth() + 1}.`; // ECharts puts day ticks at local midnight
  };
  return {
    animationDuration: 300,
    grid: { left: 40, right: 16, top: 20, bottom: 30 },
    tooltip: {
      trigger: 'item',
      backgroundColor: CHART.select,
      borderColor: CHART.select,
      textStyle: { color: '#0b1530', fontFamily: CHART.font, fontSize: 12 },
      extraCssText: 'border-radius:2px;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);',
      formatter: (x: { data: { name: string; detail: string[]; value: [number, number] } }) =>
        `<b>${escapeHtml(x.data.name)}</b><br/>` +
        (x.data.detail.length
          ? x.data.detail.join('<br/>')
          : `${m.name}: ${x.data.value[1].toFixed(m.digits)}${m.unit ? ` ${m.unit}` : ''}`),
    },
    xAxis: {
      ...axis,
      type: 'time',
      splitNumber: 5,
      minInterval: DAY_MS,
      min: lo - padX,
      max: hi + padX,
      splitLine: { show: false },
      axisLabel: { ...axis.axisLabel, hideOverlap: true, formatter: fmtDate },
    },
    yAxis: {
      ...axis,
      type: 'value',
      scale: true,
      ...(fixedAxis
        ? {
            ...fixedAxis,
            minorTick: { show: false },
            minorSplitLine: { show: true, lineStyle: { color: CHART.rule, opacity: 0.45 } },
            minorSplitNumber: minorParts,
            // A half-unit tick (0.5 mm) needs its decimal
            axisLabel: { ...axis.axisLabel, formatter: (v: number) => (fixedAxis.interval < 1 ? v.toFixed(1) : String(v)) },
          }
        : {}),
    },
    series: [
      {
        type: kind === 'grupa' ? 'bar' : 'line',
        name: m.name,
        data,
        symbol: 'circle',
        symbolSize: 8,
        barMaxWidth: 14,
        lineStyle: { color: CHART.data, width: 2 },
        itemStyle:
          kind === 'grupa'
            ? { color: 'rgba(129,144,181,0.35)', borderColor: 'rgba(129,144,181,0.8)', borderWidth: 1 }
            : { color: CHART.data, borderColor: '#0b1530', borderWidth: 1.5 },
      },
    ],
  };
}
