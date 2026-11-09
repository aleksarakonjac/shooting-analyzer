'use client';
import { parseTime, type Time } from '@internationalized/date';
import { DateInput, DateSegment, Label, TimeField } from 'react-aria-components';

const toTime = (v: string): Time | null => {
  try {
    return v ? parseTime(v) : null;
  } catch {
    return null;
  }
};
const fmt = (t: Time | null) => (t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : '');

function Clock({ label, value, onChange, name }: { label: string; value: string; onChange: (v: string) => void; name?: string }) {
  return (
    <TimeField className="ui-control" value={toTime(value)} onChange={(t) => onChange(fmt(t))} hourCycle={24} name={name}>
      <Label className="ui-label">{label}</Label>
      <DateInput className="ui-datefield">
        {(segment) => <DateSegment segment={segment} className="ui-segment" />}
      </DateInput>
    </TimeField>
  );
}

/** From–to clock times, 24-hour, as "HH:MM" strings ("" when not set). */
export function TimeRange({
  from,
  to,
  onChange,
  fromLabel = 'Od',
  toLabel = 'Do',
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  fromLabel?: string;
  toLabel?: string;
}) {
  return (
    <div className="ui-timerange">
      <Clock label={fromLabel} value={from} onChange={(v) => onChange({ from: v, to })} />
      <span className="ui-timerange__dash" aria-hidden="true">–</span>
      <Clock label={toLabel} value={to} onChange={(v) => onChange({ from, to: v })} />
    </div>
  );
}
