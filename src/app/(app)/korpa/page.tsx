import { Suspense } from 'react';
import { connection } from 'next/server';
import { PurgeTrainingButton } from '@/components/PurgeTrainingButton';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';
import { restoreTrainingForm } from '@/lib/trainings';
import { daysLeft } from '@/lib/trash/daysLeft';
import { createClient } from '@/lib/supabase/server';

export default function TrashPage() {
  return (
    <div className="page">
      <h1>{sr.trash.title}</h1>
      <Suspense fallback={null}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Body() {
  await connection();
  const t = sr.trash;
  const profile = await getSessionProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from('trainings')
    .select('id,name,trained_on,deleted_at,shooter_id')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  const rows = (data ?? []) as { id: string; name: string; trained_on: string; deleted_at: string; shooter_id: string }[];

  // A coach or the admin sees several shooters' trash: name the owner.
  const others = [...new Set(rows.map((r) => r.shooter_id).filter((id) => id !== profile?.id))];
  const names = new Map<string, string>();
  if (others.length) {
    const { data: ps } = await supabase.from('profiles').select('id,display_name').in('id', others);
    for (const p of (ps ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }
  const now = new Date();

  return (
    <>
      <p>{t.intro}</p>
      {rows.length === 0 ? (
        <p>{t.empty}</p>
      ) : (
        <ul className="trash__list">
          {rows.map((r) => (
            <li key={r.id} className="trash__item" data-testid="trash-item">
              <div>
                <strong>{r.name}</strong>
                <div className="report__meta">
                  {r.trained_on}
                  {names.has(r.shooter_id) && ` · ${t.shooter}: ${names.get(r.shooter_id)}`} · {t.deletedOn}{' '}
                  {r.deleted_at.slice(0, 10)} · {t.daysLeft}: {daysLeft(r.deleted_at, now)}
                </div>
              </div>
              <div className="trash__actions">
                <form action={restoreTrainingForm}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit">{t.restore}</button>
                </form>
                <PurgeTrainingButton id={r.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
