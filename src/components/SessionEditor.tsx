'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { EventOption } from '@/lib/events';
import type { SessionKind, SessionStage } from '@/lib/import/saveTraining';
import { sr } from '@/lib/i18n/sr';
import { zoneNames } from '@/lib/time/zone';
import { updateTrainingForm } from '@/lib/trainings';
import { ComboField } from './ui/ComboField';
import { DateTimeRange, type DateTimeRangeValue } from './ui/DateTimeRange';
import { Segmented } from './ui/Segmented';

const t = sr.newTraining;
const r = sr.report;

export interface SessionEditorValue {
  id: string;
  name: string;
  place: string;
  notes: string;
  kind: SessionKind;
  stage: SessionStage;
  tz: string;
  eventName: string;
  when: DateTimeRangeValue;
}

/** Edits a saved session: its words, type, part, event, day, clock time and venue zone. */
export function SessionEditor({
  value,
  events,
  places,
  invalid,
}: {
  value: SessionEditorValue;
  events: EventOption[];
  places: string[];
  invalid?: boolean;
}) {
  const [kind, setKind] = useState(value.kind);
  const [stage, setStage] = useState(value.stage);
  const [eventName, setEventName] = useState(value.eventName);
  const [when, setWhen] = useState(value.when);
  const [tz, setTz] = useState(value.tz);
  const [place, setPlace] = useState(value.place);
  const zones = useMemo(() => zoneNames(value.tz), [value.tz]);

  return (
    <form action={updateTrainingForm} className="session-edit">
      <input type="hidden" name="id" value={value.id} />
      <label className="span-2">
        {t.name}
        <input name="name" defaultValue={value.name} />
      </label>
      <Segmented
        name="kind"
        label={t.kind}
        value={kind}
        onChange={setKind}
        options={(['trening', 'kontrolni', 'takmicenje'] as const).map((id) => ({ id, label: t.kinds[id] }))}
      />
      <Segmented
        name="stage"
        label={t.stage}
        value={stage}
        onChange={setStage}
        options={(['slobodno', 'eliminacije', 'kvalifikacije', 'finale'] as const).map((id) => ({ id, label: t.stages[id] }))}
      />
      {kind !== 'trening' && (
        <ComboField
          name="event"
          label={t.event}
          value={eventName}
          onChange={setEventName}
          suggestions={events.filter((e) => e.kind === kind).map((e) => e.name)}
          description={t.eventHint}
        />
      )}
      <DateTimeRange label={t.dateTime} name="when" value={when} onChange={setWhen} />
      <ComboField name="tz" label={t.venueTz} value={tz} onChange={setTz} suggestions={zones} description={t.venueTzHint} />
      <ComboField name="place" label={t.place} value={place} onChange={setPlace} suggestions={places} />
      <label className="span-2">
        {t.notes}
        <textarea name="notes" rows={3} defaultValue={value.notes} />
      </label>
      {invalid && <p role="alert" className="span-2">{r.editInvalid}</p>}
      <p className="panel__empty span-2">{r.editLater}</p>
      <div className="session-edit__actions span-2">
        <button type="submit">{r.save}</button>
        <Link className="button button--quiet" href={`/trening/${value.id}`}>{r.cancel}</Link>
      </div>
    </form>
  );
}
