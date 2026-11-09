import { CHART } from '@/lib/report/charts';
import type { Bucket } from './periodStats';

const axis = {
  axisLine: { lineStyle: { color: CHART.rule } },
  axisTick: { show: false },
  axisLabel: { color: CHART.faint, fontFamily: CHART.font },
  splitLine: { lineStyle: { color: CHART.rule, type: 'dashed' as const } },
  nameTextStyle: { color: CHART.muted, fontFamily: CHART.font },
};

/**
 * Period trend: average series as a line (left axis), average group as bars in mm (right axis).
 * Empty buckets get no point; the line is drawn across them so a trend reads even when training is not daily.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trendOption(buckets: Bucket[], decimal: boolean): any {
  const digits = decimal ? 1 : 1;
  return {
    animationDuration: 300,
    grid: { left: 52, right: 44, top: 40, bottom: 28 },
    legend: {
      data: ['Prosek serije', 'Prosečna grupa'],
      top: 4,
      left: 0,
      textStyle: { color: CHART.muted, fontFamily: CHART.font },
      itemWidth: 14,
      itemHeight: 8,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: CHART.select,
      borderColor: CHART.select,
      textStyle: { color: '#0b1530', fontFamily: CHART.font, fontSize: 12 },
      extraCssText: 'border-radius:2px;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);',
      valueFormatter: (v: number | null) => (v === null || v === undefined ? '—' : Number(v).toFixed(digits)),
    },
    xAxis: { ...axis, type: 'category', data: buckets.map((b) => b.label), splitLine: { show: false } },
    yAxis: [
      { ...axis, type: 'value', name: 'Serija', nameLocation: 'middle', nameGap: 38, nameRotate: 90, scale: true },
      { ...axis, type: 'value', name: 'mm', nameLocation: 'middle', nameGap: 30, nameRotate: -90, position: 'right', min: 0, splitLine: { show: false } },
    ],
    series: [
      {
        type: 'bar',
        name: 'Prosečna grupa',
        yAxisIndex: 1,
        data: buckets.map((b) => b.avgGroupMm),
        barMaxWidth: 18,
        itemStyle: { color: 'rgba(129,144,181,0.22)', borderColor: 'rgba(129,144,181,0.6)', borderWidth: 1 },
        z: 1,
      },
      {
        type: 'line',
        name: 'Prosek serije',
        data: buckets.map((b) => b.avgSeries),
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { color: CHART.data, width: 2.5 },
        itemStyle: { color: CHART.data, borderColor: '#0b1530', borderWidth: 1.5 },
        z: 3,
      },
    ],
  };
}
