'use client';
import { parseDate, type CalendarDate } from '@internationalized/date';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Label,
  Popover,
  Text,
} from 'react-aria-components';
import { CalendarIcon, ChevronLeft, ChevronRight } from './icons';

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
            <header>
              <Button slot="previous" aria-label="Prethodni mesec"><ChevronLeft /></Button>
              <Heading />
              <Button slot="next" aria-label="Sledeći mesec"><ChevronRight /></Button>
            </header>
            <CalendarGrid>{(date) => <CalendarCell date={date} className="ui-cell" />}</CalendarGrid>
          </Calendar>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}
