'use client';
import { DateFormatter, parseDate, type CalendarDate } from '@internationalized/date';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
  useLocale,
} from 'react-aria-components';
import { useId } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from './icons';
import { TimeRange } from './TimeRange';

export interface DateTimeRangeValue {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** "HH:MM" or "" when not set */
  from: string;
  to: string;
}

const safeDate = (v: string): CalendarDate | null => {
  try {
    return v ? parseDate(v) : null;
  } catch {
    return null;
  }
};

/** The training's day and its from–to clock time in one field; one popover holds the calendar and both clocks. */
export function DateTimeRange({
  label,
  value,
  onChange,
  name,
  today,
}: {
  /** ISO date of "today" in the user's zone; adds a "Danas" button. */
  today?: string;
  label: string;
  value: DateTimeRangeValue;
  onChange: (v: DateTimeRangeValue) => void;
  /** Hidden inputs `${name}_date`, `${name}_from`, `${name}_to` for plain form submits. */
  name?: string;
}) {
  const { locale } = useLocale();
  const labelId = useId();
  const errId = useId();
  const date = safeDate(value.date);
  const dateText = date
    ? new DateFormatter(locale, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(date.toDate('UTC'))
    : 'Izaberite datum';
  const timeText = value.from || value.to ? `${value.from || '—'}–${value.to || '—'}` : 'bez vremena';
  const backwards = Boolean(value.from && value.to && value.to < value.from);

  return (
    <div className="ui-control">
      <span className="ui-label" id={labelId}>{label}</span>
      <DialogTrigger>
        <Button
          className="ui-trigger ui-dtr"
          aria-labelledby={labelId}
          aria-describedby={backwards ? errId : undefined}
          data-invalid={backwards || undefined}
        >
          <span className="ui-dtr__text">
            <span className="num">{dateText}</span>
            <span className="ui-dtr__sep" aria-hidden="true">·</span>
            <span className="num ui-dtr__time">{timeText}</span>
          </span>
          <CalendarIcon />
        </Button>
        <Popover className="ui-popover" offset={4} placement="bottom start">
          <Dialog className="ui-calendar ui-dtr__dialog" aria-label={label}>
            {({ close }) => (
              <>
                <Calendar value={date} onChange={(d) => onChange({ ...value, date: d.toString() })} aria-label="Datum">
                  <header>
                    <Button slot="previous" aria-label="Prethodni mesec"><ChevronLeft /></Button>
                    <Heading />
                    <Button slot="next" aria-label="Sledeći mesec"><ChevronRight /></Button>
                  </header>
                  <CalendarGrid>{(d) => <CalendarCell date={d} className="ui-cell" />}</CalendarGrid>
                </Calendar>
                <div className="ui-dtr__times">
                  <TimeRange from={value.from} to={value.to} onChange={({ from, to }) => onChange({ ...value, from, to })} />
                </div>
                <div className="ui-dtr__foot">
                  {today && (
                    <Button className="button--quiet" onPress={() => onChange({ ...value, date: today })}>
                      Danas
                    </Button>
                  )}
                  <Button className="button--quiet ui-dtr__clear" onPress={() => onChange({ ...value, from: '', to: '' })}>
                    Bez vremena
                  </Button>
                  <Button onPress={close}>Gotovo</Button>
                </div>
              </>
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>
      {backwards && <span className="ui-error" id={errId}>Kraj je pre početka.</span>}
      {name && (
        <>
          <input type="hidden" name={`${name}_date`} value={value.date} />
          <input type="hidden" name={`${name}_from`} value={value.from} />
          <input type="hidden" name={`${name}_to`} value={value.to} />
        </>
      )}
    </div>
  );
}
