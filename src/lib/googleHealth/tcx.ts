import type { HrSample } from '@/lib/parsers/tcx';

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * A minimal TCX holding heart-rate trackpoints, so pulse read from Google Health is stored and read back exactly
 * like an uploaded watch file. Times are written in UTC with `Z`, so the reader never has to guess a zone.
 */
export function buildTcx(samples: HrSample[]): string {
  if (samples.length === 0) throw new Error('no samples');
  const sorted = [...samples].sort((a, b) => a.tMs - b.tMs).filter((s, i, all) => i === 0 || s.tMs !== all[i - 1].tMs);
  const start = iso(sorted[0].tMs);
  const points = sorted
    .map((s) => `<Trackpoint><Time>${iso(s.tMs)}</Time><HeartRateBpm><Value>${Math.round(s.bpm)}</Value></HeartRateBpm></Trackpoint>`)
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n' +
    `<Activities><Activity Sport="Other"><Id>${start}</Id><Lap StartTime="${start}"><Track>\n` +
    `${points}\n` +
    '</Track></Lap></Activity></Activities>\n' +
    '</TrainingCenterDatabase>\n'
  );
}

/** `google-health-YYYY-MM-DD-HHmm.tcx`, the first sample's wall time in `tz`. */
export function tcxFileName(firstMs: number, tz: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(firstMs))
      .map((p) => [p.type, p.value]),
  );
  return `google-health-${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}.tcx`;
}
