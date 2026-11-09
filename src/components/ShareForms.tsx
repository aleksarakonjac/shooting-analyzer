'use client';
import { useState } from 'react';
import { DateField } from '@/components/ui/DateField';
import { Select } from '@/components/ui/Select';
import { sr } from '@/lib/i18n/sr';
import { addShareForm } from '@/lib/links';

const t = sr.sharing;

/** Three ways to share more with the coach: everything, one training, or a period. */
export function ShareForms({ trainings, coachId }: { trainings: { id: string; label: string }[]; coachId: string }) {
  const [training, setTraining] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return (
    <div className="stack stack--wide">
      <form action={addShareForm} className="stack">
        <input type="hidden" name="scope" value="all" />
        <input type="hidden" name="coachId" value={coachId} />
        <button type="submit">{t.addAll}</button>
      </form>
      <form action={addShareForm} className="stack">
        <input type="hidden" name="scope" value="training" />
        <input type="hidden" name="coachId" value={coachId} />
        <Select label={t.training} placeholder={t.choose} name="trainingId" isRequired value={training} onChange={setTraining} items={trainings} />
        <button type="submit" disabled={!training}>{t.addTraining}</button>
      </form>
      <form action={addShareForm} className="stack">
        <input type="hidden" name="scope" value="period" />
        <input type="hidden" name="coachId" value={coachId} />
        <div className="form-grid">
          <DateField label={t.from} name="from" value={from} onChange={setFrom} />
          <DateField label={t.to} name="to" value={to} onChange={setTo} />
        </div>
        <button type="submit" disabled={!from || !to}>{t.addPeriod}</button>
      </form>
    </div>
  );
}
