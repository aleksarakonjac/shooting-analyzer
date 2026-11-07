/** Offset (ms) of `tz` from UTC at the UTC instant `utcMs`. */
export function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Interprets a wall-clock time as local time in `tz`; returns the UTC instant in ms. */
export function zonedWallTimeToUtcMs(
  y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, tz: string,
): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s, ms);
  let utc = naive - tzOffsetMs(naive, tz);
  // second pass settles times near a DST change
  utc = naive - tzOffsetMs(utc, tz);
  return utc;
}
