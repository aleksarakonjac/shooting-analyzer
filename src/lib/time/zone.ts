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

/**
 * Every UTC instant at which the wall clock in `tz` reads `date` `hh:mm`, earliest first.
 * Usually one; two in the repeated hour when clocks go back (summer reading first);
 * none in the skipped hour, where the nearest valid instant is returned instead.
 */
export function wallTimeCandidates(date: string, hhmm: string, tz: string): number[] {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  const DAY = 86_400_000;
  const found = new Set<number>();
  for (const probe of [naive - DAY, naive + DAY]) {
    const off = tzOffsetMs(probe, tz);
    const candidate = naive - off;
    if (tzOffsetMs(candidate, tz) === off) found.add(candidate);
  }
  const list = [...found].sort((a, b) => a - b);
  return list.length ? list : [zonedWallTimeToUtcMs(y, mo, d, h, mi, 0, 0, tz)];
}

/** Every IANA zone the runtime knows, for zone pickers; falls back to the given zone alone. */
export function zoneNames(fallback: string): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [fallback];
  }
}
