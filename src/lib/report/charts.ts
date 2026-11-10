import type { HrSample } from '@/lib/parsers/tcx';
import { hrAt } from './hrAt';
import type { Rhythm } from './rhythm';
import type { ShotAnalysis, ShotMetrics } from '@/lib/scatt/analysis';
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
  { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
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
  // The score axis starts just below the lowest shot (half a ring for decimals), so the points use the height.
  const low = shots.length ? Math.min(...shots.map((s) => s.value)) : 9;
  const minY = v.decimal ? Math.max(0, Math.floor((low - 0.2) * 2) / 2) : Math.max(0, Math.floor(low) - 1);
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
    animationDuration: 300,
    grid: { left: 46, right: hr?.length ? 46 : 12, top: 26, bottom: 48 },
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
      { ...axisCommon, type: 'value', name: 'Pogodak', nameLocation: 'middle', nameGap: 30, nameRotate: 90, min: minY, max: v.decimal ? 10.9 : 10, interval: v.decimal ? 0.5 : 1 },
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
    animationDuration: 300,
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
    animationDuration: 300,
    grid: { left: 46, right: 12, top: 26, bottom: 48 },
    tooltip: {
      ...tooltipCommon,
      trigger: 'item',
      formatter: (p: { data: { n: number; series: number; value: [string, number] } }) =>
        `<b>Pogodak ${p.data.n}</b> · Serija ${p.data.series}<br/>${p.data.value[1].toFixed(1)} s od prethodnog`,
    },
    dataZoom: zoom,
    xAxis: { ...axisCommon, type: 'category', name: 'Pogodak', nameLocation: 'middle', nameGap: 26, data: bars.map((p) => String(p.n)), splitLine: { show: false } },
    yAxis: { ...axisCommon, type: 'value', name: 's', nameLocation: 'middle', nameGap: 30, nameRotate: 90, min: 0 },
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
          data: r.meanS !== null ? [{ yAxis: r.meanS, lineStyle: { color: CHART.ink, width: 1.5, type: 'dashed' }, label: { color: CHART.ink, fontFamily: CHART.font, fontSize: 12, formatter: `prosek ${r.meanS.toFixed(1)} s` } }] : [],
        },
      },
    ],
  };
}

export type ScattMetric = 'speed250' | 'speed' | 'hold10Abs' | 'holdCircleD';

const METRIC: Record<ScattMetric, { name: string; unit: string; digits: number; max?: number }> = {
  speed250: { name: 'Brzina 0,25 s', unit: 'mm/s', digits: 1 },
  speed: { name: 'Brzina 1 s', unit: 'mm/s', digits: 1 },
  hold10Abs: { name: 'U desetki (10a0)', unit: '%', digits: 0, max: 100 },
  holdCircleD: { name: 'Krug držanja', unit: 'mm', digits: 1 },
};

/** A SCATT metric per shot (aim stability, speed): one bar per shot with SCATT data, coloured by score band. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scattMetricOption(v: ReportView, byShot: Map<number, ShotAnalysis>, metric: ScattMetric, sel: Selection): any {
  const m = METRIC[metric];
  const shots = v.series
    .flatMap((s) => s.shots)
    .map((s) => ({ s, a: s.scattId !== null ? byShot.get(s.scattId)?.metrics : undefined }))
    .filter((x): x is { s: (typeof x)['s']; a: ShotMetrics } => Boolean(x.a));
  const data = shots.map(({ s, a }) => {
    const on = s.n === sel.shot;
    const inSeries = sel.series !== null && s.series === sel.series;
    return {
      n: s.n,
      series: s.series,
      value: [String(s.n), Math.round(a[metric] * 10 ** m.digits) / 10 ** m.digits],
      itemStyle: { color: on ? CHART.select : CHART.band[s.band], opacity: sel.series === null || inSeries || on ? 1 : 0.45, borderRadius: [2, 2, 0, 0] },
    };
  });
  return {
    animationDuration: 300,
    grid: { left: 46, right: 12, top: 26, bottom: 48 },
    tooltip: {
      ...tooltipCommon,
      trigger: 'item',
      formatter: (p: { data: { n: number; series: number; value: [string, number] } }) =>
        `<b>Pogodak ${p.data.n}</b> · Serija ${p.data.series}<br/>${m.name}: ${p.data.value[1].toFixed(m.digits)} ${m.unit}`,
    },
    dataZoom: zoom,
    xAxis: { ...axisCommon, type: 'category', name: 'Pogodak', nameLocation: 'middle', nameGap: 26, data: shots.map(({ s }) => String(s.n)), splitLine: { show: false } },
    yAxis: { ...axisCommon, type: 'value', name: m.unit, nameLocation: 'middle', nameGap: 30, nameRotate: 90, min: 0, ...(m.max ? { max: m.max } : {}) },
    series: [{ type: 'bar', name: m.name, data, barMaxWidth: 14 }],
  };
}
