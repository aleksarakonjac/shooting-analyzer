'use client';
import { useState } from 'react';
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

/**
 * The narrowing filters (date range, discipline, type, part, place, event) in one popover.
 * It submits as a plain GET form, so the filters land in the URL and a view can be bookmarked.
 */
export function FilterBar({
  base,
  filters,
  places,
  events,
  activeCount,
}: {
  base: string;
  filters: SessionFilters;
  places: string[];
  events: { id: string; name: string }[];
  activeCount: number;
}) {
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
        {activeCount > 0 ? t.filtersActive(activeCount) : t.filters}
      </Button>
      <Popover className="ui-popover filters__pop" placement="bottom start" offset={6}>
        <Dialog className="filters" aria-label={t.filters}>
          <form method="get" action={base} className="filters__form">
            <DateField label={t.from} value={from} onChange={setFrom} name="od" />
            <DateField label={t.to} value={to} onChange={setTo} name="do" />
            <Select label={t.discipline} name="d" value={d} onChange={setD} items={[any, ...(Object.keys(DISCIPLINES) as (keyof typeof DISCIPLINES)[]).map((id) => ({ id, label: DISCIPLINES[id].nameSr }))]} />
            <Select label={t.kind} name="v" value={v} onChange={setV} items={[any, ...(['trening', 'kontrolni', 'takmicenje'] as const).map((id) => ({ id, label: nt.kinds[id] }))]} />
            <Select label={t.stage} name="deo" value={deo} onChange={setDeo} items={[any, ...(['slobodno', 'eliminacije', 'kvalifikacije', 'finale'] as const).map((id) => ({ id, label: nt.stages[id] }))]} />
            <Select label={t.place} name="m" value={m} onChange={setM} items={[any, ...places.map((p) => ({ id: p, label: p }))]} />
            {events.length > 0 && <Select label={t.event} name="e" value={e} onChange={setE} items={[any, ...events.map((x) => ({ id: x.id, label: x.name }))]} />}
            {filters.chart !== 'rez' && <input type="hidden" name="g" value={filters.chart} />}
            {/* Without a range the period chosen by the quick tabs stays. */}
            {!from && !to && filters.quick !== 'recent' && filters.quick !== 'range' && <input type="hidden" name="p" value={filters.quick} />}
            <div className="filters__actions">
              <button type="submit">{t.apply}</button>
              <a className="button button--quiet" href={base}>{t.clear}</a>
            </div>
          </form>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
