'use client';
import { parseDate, type CalendarDate } from '@internationalized/date';
import {
  Button,
  Calendar,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Label,
  Popover,
  Text,
} from 'react-aria-components';
import { CalendarBody } from './CalendarBody';
import { CalendarIcon } from './icons';

/** A styled date picker (typed segments plus a calendar popover). Value is an ISO date "YYYY-MM-DD". */
export function DateField({
  label,
  value,
  onChange,
  name,
  description,
  maxValue,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  name?: string;
  description?: string;
  maxValue?: string;
}) {
  let parsed: CalendarDate | null = null;
  try {
    parsed = value ? parseDate(value) : null;
  } catch {
    parsed = null;
  }
  return (
    <DatePicker
      className="ui-control"
      value={parsed}
      onChange={(d) => d && onChange(d.toString())}
      name={name}
      maxValue={maxValue ? parseDate(maxValue) : undefined}
    >
      <Label className="ui-label">{label}</Label>
      <Group className="ui-datefield">
        <DateInput style={{ display: 'flex' }}>
          {(segment) => <DateSegment segment={segment} className="ui-segment" />}
        </DateInput>
        <Button className="ui-cal-btn" aria-label="Otvori kalendar">
          <CalendarIcon />
        </Button>
      </Group>
      {description && <Text slot="description" className="ui-desc">{description}</Text>}
      <Popover className="ui-popover" offset={4}>
        <Dialog className="ui-calendar" aria-label={label}>
          <Calendar>
            <CalendarBody />
          </Calendar>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}
