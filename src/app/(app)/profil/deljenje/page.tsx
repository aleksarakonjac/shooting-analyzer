import { Suspense } from 'react';
import { connection } from 'next/server';
import { Workspace } from '@/components/Workspace';
import { ShareForms } from './ShareForms';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { removeShareForm } from '@/lib/links';

export default function SharingPage({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
  await connection();
  const { greska } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: shares } = await supabase
    .from('shares')
    .select('id, scope, training_id, from_date, to_date')
    .eq('shooter_id', auth.user?.id ?? '');
  const { data: trainings } = await supabase
    .from('trainings')
    .select('id, name, trained_on')
    .eq('shooter_id', auth.user?.id ?? '')
    .is('deleted_at', null)
    .order('trained_on', { ascending: false })
    .limit(50);
  const t = sr.sharing;
  const label = (s: NonNullable<typeof shares>[number]) =>
    s.scope === 'all'
      ? t.all
      : s.scope === 'period'
        ? `${t.period}: ${s.from_date} – ${s.to_date}`
        : `${t.training}: ${trainings?.find((x) => x.id === s.training_id)?.trained_on ?? ''}`;

  const current = (
    <>
      {greska && <p role="alert">{t.invalid}</p>}
      {!shares?.length ? (
        <p className="panel__empty">{t.none}</p>
      ) : (
        <ul className="rows">
          {shares.map((s) => (
            <li key={s.id} className="rows__item">
              <div className="rows__main"><span className="num">{label(s)}</span></div>
              <div className="rows__actions">
                <form action={removeShareForm}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="button--quiet">{t.revoke}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return (
    <Workspace
      label={t.title}
      rows={1}
      strip={
        <div className="ws__head">
          <h1 className="ws__title">{t.title}</h1>
          <p className="ws__meta">{t.intro}</p>
        </div>
      }
      panels={[
        { id: 'current', title: t.current, col: '1 / 7', row: '1 / 2', flush: true, children: current },
        {
          id: 'add',
          title: t.addTitle,
          col: '7 / 13',
          row: '1 / 2',
          children: <ShareForms trainings={(trainings ?? []).map((x) => ({ id: x.id, label: `${x.trained_on} ${x.name}` }))} />,
        },
      ]}
    />
  );
}
