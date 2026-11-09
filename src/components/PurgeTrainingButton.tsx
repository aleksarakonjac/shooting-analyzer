'use client';
import { useState } from 'react';
import { purgeTrainingForm } from '@/lib/trainings';
import { sr } from '@/lib/i18n/sr';

export function PurgeTrainingButton({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const t = sr.trash;
  if (!asking) {
    return (
      <button type="button" className="button--quiet" onClick={() => setAsking(true)}>
        {t.purge}
      </button>
    );
  }
  return (
    <form action={purgeTrainingForm} role="alertdialog" aria-label={t.purgeAsk}>
      <input type="hidden" name="id" value={id} />
      <p>{t.purgeAsk}</p>
      <button type="submit">{t.purgeYes}</button>{' '}
      <button type="button" className="button--quiet" onClick={() => setAsking(false)}>
        {t.cancel}
      </button>
    </form>
  );
}
