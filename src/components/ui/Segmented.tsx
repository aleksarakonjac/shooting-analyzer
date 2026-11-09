'use client';
import { Label, Radio, RadioGroup } from 'react-aria-components';

/** A one-of-few choice drawn as a segmented bar (radio group underneath: arrow keys move, one tab stop). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  name,
  hideLabel,
  full = true,
}: {
  /** Keep the label for assistive tech only. */
  hideLabel?: boolean;
  /** Stretch across the container (forms); off for a compact switch in a panel. */
  full?: boolean;
  /** Form field name, for plain form submits. */
  name?: string;
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <RadioGroup className="ui-control" name={name} value={value} onChange={(v) => onChange(v as T)} orientation="horizontal">
      <Label className={hideLabel ? 'sr-only' : 'ui-label'}>{label}</Label>
      <div className={full ? 'ui-seg ui-seg--full' : 'ui-seg'}>
        {options.map((o) => (
          <Radio key={o.id} value={o.id} className="ui-seg__item">
            {o.label}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
