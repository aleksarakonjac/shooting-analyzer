'use client';
import Form from 'next/form';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import { sr } from '@/lib/i18n/sr';
import type { SessionFilters } from '@/lib/stats/filters';
import { DateField } from '../ui/DateField';
import { Select } from '../ui/Select';

const t = sr.dashboard;
const nt = sr.newTraining;
const ANY = '';
const dayBefore = (v: string) => new Date(Date.parse(`${v}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const short = (v: string) => {
  const [y, m, d] = v.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}.`;
};

/** Leaves unset filters out of the URL: a field with no value is disabled just before the GET submit. */
const dropEmpty = (e: FormEvent<HTMLFormElement>) => {
  for (const el of Array.from(e.currentTarget.elements)) {
    if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name && el.value === '') el.disabled = true;
  }
};

/** What the trigger says about the period, so the view is readable without opening the panel. */
export function periodLabel(f: SessionFilters): string {
  if (f.quick === 'period' && f.year) return f.month ? `${t.months[Number(f.month) - 1]} ${f.year}.` : `${f.year}.`;
  if (f.quick === 'range') {
    const from = f.from ? short(f.from) : '…';
    const to = f.to ? short(dayBefore(f.to)) : '…';
    return t.rangeLabel(from, to);
  }
  return t.filters;
}

const funnel = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" /></svg>
);

/**
 * The period and the narrowing filters (discipline, type, part, place, event) in one floating panel.
 * It submits as a plain GET form, so the view lands in the URL and can be bookmarked.
 */
export function FilterBar({
  base,
  filters,
  places,
  events,
  years,
  activeCount,
}: {
  base: string;
  filters: SessionFilters;
  places: string[];
  events: { id: string; name: string }[];
  /** Years that have sessions, newest first. */
  years: string[];
  /** Narrowing filters in use, not counting the period. */
  activeCount: number;
}) {
  const [year, setYear] = useState(filters.year ?? ANY);
  const [month, setMonth] = useState(filters.month ?? ANY);
  const [from, setFrom] = useState(filters.quick === 'range' ? (filters.from ?? '') : '');
  const [to, setTo] = useState(filters.quick === 'range' && filters.to ? dayBefore(filters.to) : '');
  const [d, setD] = useState<string>(filters.discipline ?? ANY);
  const [v, setV] = useState<string>(filters.kind ?? ANY);
  const [deo, setDeo] = useState<string>(filters.stage ?? ANY);
  const [m, setM] = useState<string>(filters.place ?? ANY);
  const [e, setE] = useState<string>(filters.event ?? ANY);
  const any = { id: ANY, label: t.any };

  return (
    <DialogTrigger>
      <Button className="ui-trigger filters__trigger" data-active={activeCount > 0 || undefined}>
        {funnel}
        <span className="filters__period">{periodLabel(filters)}</span>
        {activeCount > 0 && <span className="filters__count">{t.narrowing(activeCount)}</span>}
      </Button>
      <Popover className="ui-popover filters__pop" placement="bottom end" offset={6}>
        <Dialog className="filters" aria-label={t.filters}>
          {({ close }) => (
          // next/form: same GET-and-URL behaviour, but a client navigation instead of a document reload.
          <Form action={base} className="filters__form" onSubmit={(ev) => { dropEmpty(ev); close(); }}>
            <Select label={t.year} name="y" value={year} onChange={(v) => { setYear(v); setFrom(''); setTo(''); }} items={[any, ...years.map((y) => ({ id: y, label: y }))]} />
            <Select label={t.month} name="mo" value={month} onChange={(v) => { setMonth(v); setFrom(''); setTo(''); }} items={[any, ...t.months.map((label, i) => ({ id: String(i + 1).padStart(2, '0'), label }))]} />
            <DateField label={t.from} value={from} onChange={(v) => { setFrom(v); setYear(ANY); setMonth(ANY); }} name="od" />
            <DateField label={t.to} value={to} onChange={(v) => { setTo(v); setYear(ANY); setMonth(ANY); }} name="do" />
            <Select label={t.discipline} name="d" value={d} onChange={setD} items={[any, ...(Object.keys(DISCIPLINES) as (keyof typeof DISCIPLINES)[]).map((id) => ({ id, label: DISCIPLINES[id].nameSr }))]} />
            <Select label={t.kind} name="v" value={v} onChange={setV} items={[any, ...(['trening', 'kontrolni', 'takmicenje'] as const).map((id) => ({ id, label: nt.kinds[id] }))]} />
            <Select label={t.stage} name="deo" value={deo} onChange={setDeo} items={[any, ...(['slobodno', 'eliminacije', 'kvalifikacije', 'finale'] as const).map((id) => ({ id, label: nt.stages[id] }))]} />
            <Select label={t.place} name="m" value={m} onChange={setM} items={[any, ...places.map((p) => ({ id: p, label: p }))]} />
            {events.length > 0 && <Select label={t.event} name="e" value={e} onChange={setE} items={[any, ...events.map((x) => ({ id: x.id, label: x.name }))]} />}
            {filters.chart !== 'rez' && <input type="hidden" name="g" value={filters.chart} />}
            {filters.side && <input type="hidden" name="s" value="1" />}
            <div className="filters__actions">
              <button type="submit">{t.apply}</button>
              <Link className="button button--quiet" href={base} onClick={() => close()}>{t.clear}</Link>
            </div>
          </Form>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
