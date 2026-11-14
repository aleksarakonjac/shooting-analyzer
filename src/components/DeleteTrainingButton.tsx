'use client';
import { useState } from 'react';
import { deleteTrainingForm } from '@/lib/trainings';
import { sr } from '@/lib/i18n/sr';

export function DeleteTrainingButton({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const t = sr.report;
  if (!asking) {
    return (
      <button type="button" className="button--danger" onClick={() => setAsking(true)}>
        {t.delete}
      </button>
    );
  }
  return (
    <form action={deleteTrainingForm} role="alertdialog" aria-label={t.deleteAsk} style={{ display: 'contents' }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="button--danger">{t.deleteYes}</button>
      <button type="button" className="button--quiet" onClick={() => setAsking(false)}>
        {t.deleteNo}
      </button>
    </form>
  );
}
