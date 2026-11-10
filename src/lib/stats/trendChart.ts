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
  rez: { name: 'Prosek serije', unit: '', pick: (p) => p.avgSeries, digits: 1 },
  puls: { name: 'Prosečan puls', unit: 'otk/min', pick: (p) => p.hr, digits: 0 },
  grupa: { name: 'Prosečna grupa', unit: 'mm', pick: (p) => p.avgGroupMm, digits: 1 },
};

/** One figure per session over the calendar: average series, average heart rate or average group. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sessionsOption(points: SessionPoint[], kind: ChartKind, decimal: boolean): any {
  const m = CHART_META[kind];
  const data = points
    .map((p) => ({ p, v: m.pick(p) }))
    .filter((x): x is { p: SessionPoint; v: number } => x.v !== null)
    .map(({ p, v }) => ({ id: p.id, name: p.name, total: p.total, value: [p.trainedOn, v] }));
  const fmtDate = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
  };
  return {
    animationDuration: 300,
    grid: { left: 52, right: 16, top: 20, bottom: 30 },
    tooltip: {
      trigger: 'item',
      backgroundColor: CHART.select,
      borderColor: CHART.select,
      textStyle: { color: '#0b1530', fontFamily: CHART.font, fontSize: 12 },
      extraCssText: 'border-radius:2px;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);',
      formatter: (x: { data: { name: string; total: number | null; value: [string, number] } }) =>
        `<b>${escapeHtml(x.data.name)}</b><br/>${m.name}: ${x.data.value[1].toFixed(m.digits)}${m.unit ? ` ${m.unit}` : ''}` +
        (kind === 'rez' && x.data.total !== null ? `<br/>Ukupno: ${x.data.total.toFixed(decimal ? 1 : 0)}` : ''),
    },
    xAxis: { ...axis, type: 'time', splitNumber: 5, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, hideOverlap: true, formatter: fmtDate } },
    yAxis: { ...axis, type: 'value', name: m.unit || 'Serija', nameLocation: 'middle', nameGap: 38, nameRotate: 90, scale: true },
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
