'use client';
import { useContext, useState } from 'react';
import { Button, CalendarCell, CalendarGrid, CalendarStateContext } from 'react-aria-components';
import { sr } from '@/lib/i18n/sr';
import { ChevronLeft, ChevronRight } from './icons';

type View = 'day' | 'month' | 'year';
const YEARS_PER_PAGE = 12;

/**
 * The inside of a calendar popover (put it inside react-aria's <Calendar>): a header and the days.
 * The month and the year in the header are buttons. The month opens that year's months, then the days;
 * the year opens a page of years, then the months, then the days.
 */
export function CalendarBody() {
  const state = useContext(CalendarStateContext);
  const [view, setView] = useState<View>('day');
  // Which page of years is showing, as an offset in pages from the page of the focused year.
  const [yearPage, setYearPage] = useState(0);
  if (!state) return null;
  const focused = state.focusedDate;
  const months = sr.dashboard.months;
  const { minValue, maxValue } = state as { minValue?: typeof focused; maxValue?: typeof focused };

  const monthDisabled = (month: number) => {
    const first = focused.set({ month, day: 1 });
    const last = first.set({ day: first.calendar.getDaysInMonth(first) });
    return Boolean((maxValue && first.compare(maxValue) > 0) || (minValue && last.compare(minValue) < 0));
  };
  const yearDisabled = (year: number) =>
    Boolean((maxValue && year > maxValue.year) || (minValue && year < minValue.year));

  const firstYear = focused.year - (focused.year % YEARS_PER_PAGE) + yearPage * YEARS_PER_PAGE;
  const years = Array.from({ length: YEARS_PER_PAGE }, (_, i) => firstYear + i);

  const pickYear = (year: number) => {
    state.setFocusedDate(focused.set({ year }));
    setView('month');
  };
  const pickMonth = (month: number) => {
    state.setFocusedDate(focused.set({ month }));
    setView('day');
  };
  const open = (next: View) => {
    setYearPage(0);
    setView(next);
  };

  return (
    <>
      <header>
        {view === 'day' && <Button slot="previous" aria-label="Prethodni mesec"><ChevronLeft /></Button>}
        {view === 'month' && (
          <Button slot={null} aria-label="Prethodna godina" onPress={() => state.setFocusedDate(focused.subtract({ years: 1 }))} isDisabled={yearDisabled(focused.year - 1)}>
            <ChevronLeft />
          </Button>
        )}
        {view === 'year' && (
          <Button slot={null} aria-label="Prethodne godine" onPress={() => setYearPage((p) => p - 1)} isDisabled={yearDisabled(firstYear - 1) && Boolean(minValue)}>
            <ChevronLeft />
          </Button>
        )}
        <div className="ui-cal-title">
          {view === 'year' ? (
            <span className="ui-cal-range">{firstYear}–{firstYear + YEARS_PER_PAGE - 1}</span>
          ) : (
            <>
              {view === 'day' && (
                <Button slot={null} className="ui-cal-pick" onPress={() => open('month')} aria-label={`Mesec: ${months[focused.month - 1]}`}>
                  {months[focused.month - 1]}
                </Button>
              )}
              <Button slot={null} className="ui-cal-pick" onPress={() => open('year')} aria-label={`Godina: ${focused.year}`}>
                {focused.year}
              </Button>
            </>
          )}
        </div>
        {view === 'day' && <Button slot="next" aria-label="Sledeći mesec"><ChevronRight /></Button>}
        {view === 'month' && (
          <Button slot={null} aria-label="Sledeća godina" onPress={() => state.setFocusedDate(focused.add({ years: 1 }))} isDisabled={yearDisabled(focused.year + 1)}>
            <ChevronRight />
          </Button>
        )}
        {view === 'year' && (
          <Button slot={null} aria-label="Sledeće godine" onPress={() => setYearPage((p) => p + 1)} isDisabled={Boolean(maxValue) && yearDisabled(firstYear + YEARS_PER_PAGE)}>
            <ChevronRight />
          </Button>
        )}
      </header>
      {view === 'day' && <CalendarGrid>{(date) => <CalendarCell date={date} className="ui-cell" />}</CalendarGrid>}
      {view === 'month' && (
        <div className="ui-cal-grid" role="group" aria-label={`${focused.year}`}>
          {months.map((name, i) => (
            <Button slot={null}
              key={name}
              className="ui-cal-opt"
              data-current={i + 1 === focused.month || undefined}
              isDisabled={monthDisabled(i + 1)}
              onPress={() => pickMonth(i + 1)}
            >
              {name.slice(0, 3)}
            </Button>
          ))}
        </div>
      )}
      {view === 'year' && (
        <div className="ui-cal-grid" role="group" aria-label={`${firstYear}–${firstYear + YEARS_PER_PAGE - 1}`}>
          {years.map((y) => (
            <Button slot={null} key={y} className="ui-cal-opt" data-current={y === focused.year || undefined} isDisabled={yearDisabled(y)} onPress={() => pickYear(y)}>
              {y}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
