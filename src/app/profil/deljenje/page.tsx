import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { addShareForm, removeShareForm } from '@/lib/links';

export default function SharingPage({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
  return (
    <main style={{ padding: 'var(--gutter)', maxWidth: '40rem' }}>
      <h1>{sr.sharing.title}</h1>
      <p>{sr.sharing.intro}</p>
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
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

  return (
    <>
      {greska && <p role="alert">{t.invalid}</p>}
      <h2>{t.current}</h2>
      {!shares?.length && <p>{t.none}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '.75rem' }}>
        {shares?.map((s) => (
          <li key={s.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span>{label(s)}</span>
            <form action={removeShareForm}>
              <input type="hidden" name="id" value={s.id} />
              <button type="submit">{t.revoke}</button>
            </form>
          </li>
        ))}
      </ul>

      <div style={{ display: 'grid', gap: '1.5rem', marginTop: '2rem' }}>
        <form action={addShareForm}>
          <input type="hidden" name="scope" value="all" />
          <button type="submit">{t.addAll}</button>
        </form>
        <form action={addShareForm} style={{ display: 'grid', gap: '.5rem' }}>
          <input type="hidden" name="scope" value="training" />
          <label>
            {t.training}
            <select name="trainingId" required style={{ display: 'block', width: '100%' }} defaultValue="">
              <option value="" disabled>{t.choose}</option>
              {trainings?.map((x) => (
                <option key={x.id} value={x.id}>{x.trained_on} {x.name}</option>
              ))}
            </select>
          </label>
          <button type="submit">{t.addTraining}</button>
        </form>
        <form action={addShareForm} style={{ display: 'grid', gap: '.5rem' }}>
          <input type="hidden" name="scope" value="period" />
          <label>{t.from}<input name="from" type="date" required style={{ display: 'block' }} /></label>
          <label>{t.to}<input name="to" type="date" required style={{ display: 'block' }} /></label>
          <button type="submit">{t.addPeriod}</button>
        </form>
      </div>
    </>
  );
}
