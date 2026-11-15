/** One row of the series list: a match series, or the sighters ("Proba") fired before one. */
export type BoardRow = { kind: 'series'; idx: number } | { kind: 'sighters'; group: number };

/**
 * Series in order with each sighter group before the series it was fired before (`beforeSeries` = that series'
 * idx). Groups whose series is not in the list go at the end, in their own order.
 */
export function boardRows(series: { idx: number }[], sighters: { beforeSeries: number }[]): BoardRow[] {
  const placed = new Set<number>();
  const rows: BoardRow[] = [];
  for (const s of series) {
    sighters.forEach((g, i) => {
      if (g.beforeSeries === s.idx) {
        rows.push({ kind: 'sighters', group: i });
        placed.add(i);
      }
    });
    rows.push({ kind: 'series', idx: s.idx });
  }
  sighters.forEach((_, i) => {
    if (!placed.has(i)) rows.push({ kind: 'sighters', group: i });
  });
  return rows;
}
