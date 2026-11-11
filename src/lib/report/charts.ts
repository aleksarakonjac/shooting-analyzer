import type { HrSample } from '@/lib/parsers/tcx';
import { hrAt } from './hrAt';
import type { Rhythm } from './rhythm';
import type { ShotAnalysis } from '@/lib/scatt/analysis';
import { decimalScoreExact } from '@/lib/scatt/display';
import type { ScattTarget } from '@/lib/scatt/targets';
import type { Replay } from '@/lib/scatt/replay';
import type { ScoreBand } from './target';
import type { ReportView } from './viewModel';

/** Chart colours, mirrored from tokens.css (canvas cannot read CSS variables). */
export const CHART = {
  ink: '#f3f6fc',
  muted: '#aab6d3',
  faint: '#8190b5',
  rule: '#22335e',
  panelSunk: '#0a1430',
  data: '#39c6f0',
  select: '#ffffff',
  /** SCATT's own colours for its analysis charts: green for aiming, orange for speed. */
  green: '#3ddc8a',
  orange: '#ffa21f',
  band: { top: '#39c6f0', ten: '#2a8fb4', nine: '#5c6e9c', low: '#ff6b74' } satisfies Record<ScoreBand, string>,
  font: 'Barlow, system-ui, sans-serif',
};

/** Escapes text for the HTML tooltips (anything a user typed, such as a session name). */
export const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface Selection {
  series: number | null;
  shot: number | null;
}

const clock = (tz: string) => (ms: number) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(ms);

const axisCommon = {
  axisLine: { lineStyle: { color: CHART.rule } },
  axisTick: { lineStyle: { color: CHART.rule } },
  axisLabel: { color: CHART.muted, fontFamily: CHART.font, fontSize: 12 },
  splitLine: { lineStyle: { color: CHART.rule, type: 'dashed' as const } },
  nameTextStyle: { color: CHART.muted, fontFamily: CHART.font, fontSize: 12 },
};

const tooltipCommon = {
  backgroundColor: CHART.select,
  borderColor: CHART.select,
  textStyle: { color: '#0b1530', fontFamily: CHART.font, fontSize: 13 },
  extraCssText: 'border-radius:2px;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);',
};

const timeAxis = (fmt: (ms: number) => string) => ({
  ...axisCommon,
  type: 'time',
  splitNumber: 5,
  axisLabel: { ...axisCommon.axisLabel, hideOverlap: true, formatter: (ms: number) => fmt(ms).slice(0, 5) },
  splitLine: { show: false },
});

const zoom = [
  {
    type: 'slider', xAxisIndex: 0, height: 18, bottom: 6, filterMode: 'none',
    borderColor: CHART.rule, backgroundColor: CHART.panelSunk, fillerColor: 'rgba(57,198,240,0.15)',
    dataBackground: { lineStyle: { color: CHART.faint }, areaStyle: { color: 'rgba(129,144,181,0.2)' } },
    handleStyle: { color: CHART.ink, borderColor: CHART.ink }, moveHandleStyle: { color: CHART.faint },
    showDetail: false,
  },
];

/** Score over clock time: one point per timed shot, a shaded band per series, the selection drawn large and white. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function timelineOption(v: ReportView, sel: Selection, tz: string, hr?: HrSample[]): any {
  const fmt = clock(tz);
  const shots = v.series.flatMap((s) => s.shots).filter((s) => s.tMs !== null);
  // The score axis starts just below the lowest shot (a tenth for decimals, with a label at every tenth), so the points use the height.
  const low = shots.length ? Math.min(...shots.map((s) => s.value)) : 9;
  const minY = v.decimal ? Math.max(0, Math.floor((low - 0.1) * 10) / 10) : Math.max(0, Math.floor(low) - 1);
  // Heart rate gets the lower third: its axis is stretched upwards so the line stays under the shots.
  const hrLo = hr?.length ? Math.min(...hr.map((x) => x.bpm)) : 0;
  const hrHi = hr?.length ? Math.max(...hr.map((x) => x.bpm)) : 0;
  const hrSpan = Math.max(1, hrHi - hrLo);
  const data = shots.map((s) => {
    const selected = s.n === sel.shot;
    const inSeries = sel.series !== null && s.series === sel.series;
    return {
      n: s.n,
      series: s.series,
      value: [s.tMs, s.value],
      symbolSize: selected ? 14 : inSeries ? 8 : 6,
      itemStyle: {
        color: selected ? CHART.select : CHART.band[s.band],
        borderColor: selected ? '#0b1530' : 'transparent',
        borderWidth: selected ? 2 : 0,
        opacity: sel.series === null || inSeries || selected ? 1 : 0.45,
      },
    };
  });
  const bands = v.series
    .map((s) => {
      const t = s.shots.map((x) => x.tMs).filter((x): x is number => x !== null);
      if (!t.length) return null;
      const on = s.idx === sel.series;
      return [
        {
          name: `S${s.idx}`,
          xAxis: Math.min(...t),
          itemStyle: { color: on ? 'rgba(255,255,255,0.08)' : s.idx % 2 ? 'rgba(57,198,240,0.04)' : 'rgba(57,198,240,0.07)' },
          label: { color: on ? CHART.ink : CHART.muted, fontFamily: CHART.font, fontSize: 12, fontWeight: on ? 700 : 500 },
        },
        { xAxis: Math.max(...t) },
      ];
    })
    .filter(Boolean);
  return {
    animation: false,
    grid: { left: 34, right: hr?.length ? 46 : 12, top: 26, bottom: 48 },
    tooltip: {
      ...tooltipCommon,
      trigger: 'item',
      formatter: (p: { data: { n: number; series: number; value: [number, number] } }) =>
        `<b>Pogodak ${p.data.n}</b> · Serija ${p.data.series}<br/>${p.data.value[1].toFixed(v.decimal ? 1 : 0)} · ${fmt(p.data.value[0])}`,
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: CHART.faint } },
    dataZoom: zoom,
    xAxis: timeAxis(fmt),
    yAxis: [
      { ...axisCommon, type: 'value', min: minY, max: v.decimal ? 10.9 : 10, interval: v.decimal ? 0.1 : 1, axisLabel: { ...axisCommon.axisLabel, formatter: (n: number) => (v.decimal ? n.toFixed(1) : String(n)) } },
      ...(hr?.length
        ? [{
            ...axisCommon, type: 'value', name: 'otk/min', nameLocation: 'middle', nameGap: 30, nameRotate: -90, position: 'right',
            min: Math.floor(hrLo - 2), max: Math.ceil(hrHi + 2 * hrSpan), splitLine: { show: false },
            // Only the heart-rate band carries labels; the stretched upper part sits beside the shots.
            axisLabel: { ...axisCommon.axisLabel, formatter: (v: number) => (v <= hrHi + 1 ? String(v) : '') },
          }]
        : []),
    ],
    series: [
      {
        type: 'scatter',
        name: 'Pogoci',
        data,
        z: 3,
        emphasis: { scale: 1.4 },
        markArea: { silent: true, data: bands },
      },
      ...(hr?.length
        ? [{
            type: 'line', name: 'Puls', yAxisIndex: 1, data: rolling(hr, 15_000), showSymbol: false, smooth: 0.3, z: 2,
            lineStyle: { color: CHART.muted, width: 1.25, opacity: 0.45 }, tooltip: { show: false },
          }]
        : []),
    ],
  };
}

/** Mean of the samples in the trailing window, one point per sample (rough smoothing of per-second data). */
export function rolling(samples: HrSample[], windowMs: number): [number, number][] {
  const out: [number, number][] = [];
  let from = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i].bpm;
    while (samples[i].tMs - samples[from].tMs > windowMs) sum -= samples[from++].bpm;
    out.push([samples[i].tMs, Math.round((sum / (i - from + 1)) * 10) / 10]);
  }
  return out;
}

/** Heart rate over the same clock as the timeline; every timed shot sits on the curve at its moment's heart rate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hrOption(samples: HrSample[], v: ReportView, sel: Selection, tz: string): any {
  const fmt = clock(tz);
  const dec = v.decimal ? 1 : 0;
  const shots = v.series
    .flatMap((s) => s.shots)
    .filter((s) => s.tMs !== null)
    .map((s) => ({ s, bpm: hrAt(samples, s.tMs!) }))
    .filter((x): x is { s: (typeof x)['s']; bpm: number } => x.bpm !== null)
    .map(({ s, bpm }) => {
      const on = s.n === sel.shot;
      const inSeries = sel.series !== null && s.series === sel.series;
      return {
        n: s.n,
        series: s.series,
        score: s.value,
        value: [s.tMs, bpm],
        symbolSize: on ? 14 : inSeries ? 10 : 7,
        itemStyle: {
          color: on ? CHART.select : CHART.band[s.band],
          borderColor: '#0b1530',
          borderWidth: on ? 2 : 1.5,
          opacity: sel.series === null || inSeries || on ? 1 : 0.5,
        },
      };
    });
  const picked = shots.find((d) => d.n === sel.shot);
  return {
    animation: false,
    grid: { left: 46, right: 12, top: 26, bottom: 48 },
    tooltip: {
      ...tooltipCommon,
      trigger: 'item',
      formatter: (p: { seriesName: string; data: { n: number; series: number; score: number; value: [number, number] } }) =>
        p.seriesName === 'Pogoci'
          ? `<b>Pogodak ${p.data.n}</b> · Serija ${p.data.series}<br/>${p.data.score.toFixed(dec)} · puls ${Math.round(p.data.value[1])} · ${fmt(p.data.value[0])}`
          : '',
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }], lineStyle: { color: CHART.faint } },
    dataZoom: zoom,
    xAxis: timeAxis(fmt),
    yAxis: { ...axisCommon, type: 'value', name: 'otk/min', nameLocation: 'middle', nameGap: 30, nameRotate: 90, scale: true },
    series: [
      {
        type: 'line',
        name: 'Puls',
        data: samples.map((s) => [s.tMs, s.bpm]),
        showSymbol: false,
        lineStyle: { color: CHART.faint, width: 1, opacity: 0.45, type: 'dotted' },
        tooltip: { show: false },
        markLine: {
          silent: true,
          symbol: 'none',
          data: picked ? [{ xAxis: picked.value[0], lineStyle: { color: CHART.select, width: 1.5, type: 'solid' }, label: { show: false } }] : [],
        },
      },
      {
        type: 'line',
        name: 'Prosek 15 s',
        data: rolling(samples, 15_000),
        showSymbol: false,
        smooth: 0.3,
        lineStyle: { color: CHART.muted, width: 2 },
        tooltip: { show: false },
      },
      { type: 'scatter', name: 'Pogoci', data: shots, z: 5, emphasis: { scale: 1.4 } },
    ],
  };
}

/**
 * Time between shots: one bar per gap inside a series, coloured by the shot's score band, with the mean
 * as a line and mean ± one standard deviation as a band. Gaps across a series break are left out.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rhythmOption(r: Rhythm, sel: Selection): any {
  const bars = r.points.filter((p) => !p.afterBreak);
  const data = bars.map((p) => {
    const on = p.n === sel.shot;
    const inSeries = sel.series !== null && p.series === sel.series;
    return {
      n: p.n,
      series: p.series,
      value: [String(p.n), p.seconds],
      itemStyle: {
        color: on ? CHART.select : CHART.band[p.band],
        opacity: sel.series === null || inSeries || on ? 1 : 0.45,
        borderRadius: [2, 2, 0, 0],
      },
    };
  });
  const band =
    r.meanS !== null && r.sdS !== null
      ? [[{ yAxis: Math.max(0, r.meanS - r.sdS), itemStyle: { color: 'rgba(57,198,240,0.08)' } }, { yAxis: r.meanS + r.sdS }]]
      : [];
  return {
    animation: false,
    grid: { left: 34, right: 6, top: 18, bottom: 48 },
    tooltip: {
      ...tooltipCommon,
      trigger: 'item',
      formatter: (p: { data: { n: number; series: number; value: [string, number] } }) =>
        `<b>Pogodak ${p.data.n}</b> · Serija ${p.data.series}<br/>${p.data.value[1].toFixed(1)} s od prethodnog`,
    },
    dataZoom: zoom,
    xAxis: { ...axisCommon, type: 'category', name: 'Pogodak', nameLocation: 'middle', nameGap: 26, data: bars.map((p) => String(p.n)), splitLine: { show: false } },
    yAxis: { ...axisCommon, type: 'value', min: 0 },
    series: [
      {
        type: 'bar',
        name: 'Razmak',
        data,
        barMaxWidth: 14,
        markArea: { silent: true, data: band },
        markLine: {
          silent: true,
          symbol: 'none',
          data: r.meanS !== null ? [{ yAxis: r.meanS, lineStyle: { color: CHART.ink, width: 1.5, type: 'dashed' }, label: { color: CHART.ink, fontFamily: CHART.font, fontSize: 12, position: 'insideEndTop', formatter: `prosek ${r.meanS.toFixed(1)} s` } }] : [],
        },
      },
    ],
  };
}

export type ScattMetric = 'speed250' | 'speed' | 'hold10Abs' | 'holdCircleD' | 'aiming';

const METRIC: Record<ScattMetric, { name: string; unit: string; digits: number; max?: number }> = {
  speed250: { name: 'Brzina 0,25 s', unit: 'mm/s', digits: 1 },
  speed: { name: 'Brzina 1 s', unit: 'mm/s', digits: 1 },
  hold10Abs: { name: 'U desetki (10a0)', unit: '%', digits: 0, max: 100 },
  holdCircleD: { name: 'Krug držanja', unit: 'mm', digits: 1 },
  aiming: { name: 'Vreme nišanjenja', unit: 's', digits: 1 },
};

/** A SCATT metric per shot (aim stability, speed): one bar per shot with SCATT data, coloured by score band. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scattMetricOption(v: ReportView, byShot: Map<number, ShotAnalysis>, metric: ScattMetric, sel: Selection): any {
  const m = METRIC[metric];
  const isSpeed = metric === 'speed250' || metric === 'speed' || metric === 'aiming';
  // Speed over a series or the whole match: dots with a line at the average. A series is chosen by selecting it.
  const pool = isSpeed && sel.series !== null ? v.series.filter((s) => s.idx === sel.series) : v.series;
  const shots = pool
    .flatMap((s) => s.shots)
    .map((s) => {
      const an = s.scattId !== null ? byShot.get(s.scattId) : undefined;
      const val = !an ? undefined : metric === 'aiming' ? an.aimingMs / 1000 : an.metrics?.[metric];
      return { s, val };
    })
    .filter((x): x is { s: (typeof x)['s']; val: number } => x.val !== undefined);
  const round = (n: number) => Math.round(n * 10 ** m.digits) / 10 ** m.digits;
  const dotColor = metric === 'aiming' ? CHART.green : CHART.orange;
  const firstOfSeries = new Map(shots.filter(({ s }, i) => i === 0 || shots[i - 1].s.series !== s.series).map(({ s }) => [String(s.n), s.series]));
  const data = shots.map(({ s, val }) => {
    const on = s.n === sel.shot;
    const inSeries = sel.series !== null && s.series === sel.series;
    return {
      n: s.n,
      series: s.series,
      value: [String(s.n), round(val)],
      ...(isSpeed ? { symbolSize: on ? 11 : 8 } : {}),
      itemStyle: isSpeed
        ? on
          ? { color: 'transparent', borderColor: CHART.select, borderWidth: 2 }
          : { color: dotColor, opacity: sel.series === null || inSeries ? 1 : 0.45 }
        : { color: on ? CHART.select : CHART.band[s.band], opacity: sel.series === null || inSeries || on ? 1 : 0.45, borderRadius: [2, 2, 0, 0] },
    };
  });
  const avg = shots.length ? shots.reduce((t, { val }) => t + val, 0) / shots.length : null;
  return {
    animation: false,
    grid: { left: 46, right: 12, top: 14, bottom: isSpeed ? 28 : 48 },
    tooltip: {
      ...tooltipCommon,
      trigger: 'item',
      formatter: (p: { data: { n: number; series: number; value: [string, number] } }) =>
        `<b>Pogodak ${p.data?.n}</b> · Serija ${p.data?.series}<br/>${m.name}: ${p.data?.value[1].toFixed(m.digits)} ${m.unit}`,
    },
    ...(isSpeed ? {} : { dataZoom: zoom }),
    xAxis: { ...axisCommon, type: 'category', name: isSpeed ? '' : 'Pogodak', nameLocation: 'middle', nameGap: 26, data: shots.map(({ s }) => String(s.n)), splitLine: { show: false }, ...(isSpeed ? { axisLabel: { ...axisCommon.axisLabel, interval: 0, formatter: (n: string) => (firstOfSeries.has(n) ? `Serija ${firstOfSeries.get(n)}` : '') } } : {}) },
    yAxis: { ...axisCommon, type: 'value', name: isSpeed ? '' : m.unit, nameLocation: 'middle', nameGap: 30, nameRotate: 90, min: 0, ...(m.max ? { max: m.max } : {}) },
    series: [
      isSpeed
        ? {
            type: 'scatter',
            name: m.name,
            data,
            markLine: {
              silent: true,
              symbol: 'none',
              data: avg === null ? [] : [{ yAxis: avg, lineStyle: { color: CHART.data, width: 1.5, type: 'dashed' }, label: { color: CHART.data, fontFamily: CHART.font, fontSize: 12, position: 'insideEndTop', formatter: `prosek ${avg.toFixed(m.digits)}` } }],
            },
          }
        : { type: 'bar', name: m.name, data, barMaxWidth: 14 },
    ],
  };
}

/** One shot's aim trace picked for a chart: its replay, shot number, and whether it is the selected shot. */
export interface TracePick {
  r: Replay;
  n: number;
  selected: boolean;
}

/** Values of one shot at `k` samples from the shot (k from -nb to na), or null where the trace has no sample. */
function perSample(r: Replay, nb: number, na: number, f: (i: number) => number): ([number, number] | null)[] {
  const out: ([number, number] | null)[] = [];
  for (let k = -nb; k <= na; k++) {
    const i = r.shot + k;
    out.push(i >= 1 && i < r.x.length ? [Math.round((k / r.rate) * 100) / 100, f(i)] : null);
  }
  return out;
}

/** Mean over shots at each time step, skipping steps where fewer than half of the shots have a sample. */
function meanLine(lines: ([number, number] | null)[][]): [number, number][] {
  const out: [number, number][] = [];
  const len = lines[0]?.length ?? 0;
  for (let k = 0; k < len; k++) {
    const vals = lines.map((l) => l[k]).filter((p): p is [number, number] => Boolean(p));
    if (vals.length * 2 >= lines.length && vals.length) out.push([vals[0][0], vals.reduce((a, p) => a + p[1], 0) / vals.length]);
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Moving-average speed (mm/s) at sample i: distance between neighbouring samples times the rate, over 50 ms. */
const speedAt = (r: Replay, i: number): number => {
  const win = Math.max(1, Math.round(r.rate * 0.05));
  let sum = 0;
  let n = 0;
  for (let k = Math.max(1, i - win + 1); k <= i; k++) {
    sum += Math.hypot(r.x[k] - r.x[k - 1], r.y[k] - r.y[k - 1]) * r.rate;
    n++;
  }
  return sum / n;
};

/** Shared frame of the over-time charts: a value x axis in seconds from the shot, the dashed shot line, the lines. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function overTimeOption(picks: TracePick[], beforeS: number, afterS: number, colour: string, areaRgb: string, f: (r: Replay, i: number) => number, y: Record<string, unknown>, fmt: (n: number) => string, smooth: boolean): any {
  const rate = picks[0]?.r.rate ?? 200;
  const nb = Math.max(0, Math.round(beforeS * rate));
  const na = Math.max(0, Math.round(afterS * rate));
  const many = picks.length > 1;
  // Every shot on the same time grid (nb before to na after the shot); samples a shot lacks are null.
  const lines = picks.map((p) => perSample(p.r, nb, na, (i) => f(p.r, i)));
  const clean = (l: ([number, number] | null)[]) => l.filter((p): p is [number, number] => p !== null);
  const base = { type: 'line', showSymbol: false, smooth, animation: false };
  // One shot: its own curve. A series or the match: the mean curve over its shots, not every shot at once.
  const data = many ? meanLine(lines) : clean(lines[0] ?? []);
  const series = [
    {
      ...base,
      name: many ? 'Prosek' : 'Vrednost',
      data,
      lineStyle: { color: colour, width: 1.5 },
      areaStyle: { origin: 'auto', color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `rgba(${areaRgb},0.45)` }, { offset: 1, color: `rgba(${areaRgb},0.03)` }] } },
      markLine: SHOT_LINE,
    },
  ];
  return {
    animation: false,
    grid: { left: 40, right: 12, top: 14, bottom: 30 },
    tooltip: { ...tooltipCommon, trigger: 'axis', formatter: (p: { data: [number, number] }[]) => `${p[0].data[0] >= 0 ? '+' : ''}${p[0].data[0].toFixed(2)} s<br/>${fmt(p[0].data[1])}` },
    xAxis: { ...axisCommon, axisLine: { ...axisCommon.axisLine, onZero: false }, type: 'value', min: data[0]?.[0] ?? 0, max: data.at(-1)?.[0] ?? 0, splitLine: { show: false }, axisLabel: { ...axisCommon.axisLabel, formatter: (n: number) => (n === 0 ? '' : `${n > 0 ? '+' : ''}${n}s`) } },
    // The y axis stays at the left edge (not on the x = 0 line of the shot), so nothing of it sits on the shot line.
    yAxis: { ...axisCommon, axisLine: { ...axisCommon.axisLine, onZero: false }, type: 'value', ...y },
    series,
  };
}

/**
 * How fast the aim point moved while aiming, over time, with a dashed line at the moment of the shot: one shot's
 * curve, or for a series or the match the mean curve of its shots aligned at the shot.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shotSpeedOption(picks: TracePick[], beforeS: number, afterS: number): any {
  return overTimeOption(picks, beforeS, afterS, CHART.orange, '255,162,31', speedAt, { min: 0 }, (n) => round1(n).toFixed(1), false);
}

/** The dashed vertical line at the moment of the shot (time 0). */
const SHOT_LINE = {
  silent: true,
  symbol: 'none',
  data: [{ xAxis: 0, lineStyle: { color: CHART.muted, width: 1.25, type: 'dashed' }, label: { show: false } }],
};

/**
 * Coordination as SCATT draws it: how close to the centre the aim point was over time, as the decimal score of
 * that point (10 at the bottom). One shot's curve, or for a series or the match the mean curve of its shots.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function coordinationOption(picks: TracePick[], tg: ScattTarget, beforeS: number, afterS: number): any {
  const score = (r: Replay, i: number) => Math.min(10.9, decimalScoreExact(r.x[i], r.y[i], tg.rings, tg.caliber));
  const low = Math.min(10, ...picks.flatMap((p) => [score(p.r, Math.max(0, p.r.shot - Math.round(beforeS * p.r.rate)))]));
  const o = overTimeOption(picks, beforeS, afterS, CHART.green, '61,220,138', score, { inverse: true, min: Math.floor(Math.max(0, low - 0.5)), max: 10.9, axisLabel: { ...axisCommon.axisLabel, formatter: (n: number) => (n > 10.05 ? '' : String(Math.round(n))) } }, (n) => n.toFixed(1), true);
  // The area fills towards the ten (bottom), not towards the axis start.
  o.series[0].areaStyle.origin = 'end';
  o.series[0].areaStyle.color = { type: 'linear', x: 0, y: 1, x2: 0, y2: 0, colorStops: [{ offset: 0, color: 'rgba(61,220,138,0.4)' }, { offset: 1, color: 'rgba(61,220,138,0.03)' }] };
  return o;
}
