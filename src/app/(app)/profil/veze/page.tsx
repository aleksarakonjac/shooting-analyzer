import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { linkDecisionForm, requestLinkForm } from '@/lib/links';

interface MyLink {
  id: string;
  status: 'pending' | 'active';
  other_name: string | null;
  other_role: 'shooter' | 'coach' | 'admin' | null;
  i_requested: boolean;
}

export default function LinksPage({ searchParams }: { searchParams: Promise<{ poslato?: string }> }) {
  return (
    <div className="page page--narrow">
      <h1>{sr.links.title}</h1>
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ poslato?: string }> }) {
  const { poslato } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_links');
  const links = data as MyLink[] | null;
  const t = sr.links;
  return (
    <>
      <form action={requestLinkForm} style={{ display: 'grid', gap: '.75rem', marginBottom: '2rem' }}>
        <label>
          {t.requestLabel}
          <input name="email" type="email" required style={{ display: 'block', width: '100%' }} />
        </label>
        <button type="submit">{t.requestSubmit}</button>
        {poslato && <p role="status">{t.requestSent}</p>}
      </form>

      {!links?.length && <p>{t.empty}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
        {links?.map((l) => (
          <li key={l.id}>
            <strong>{l.other_name ?? t.outgoing}</strong>{l.other_role && ` (${l.other_role === 'coach' ? t.coach : t.shooter})`} —{' '}
            {l.status === 'active' ? t.active : l.i_requested ? t.pendingOut : t.pendingIn}
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
              {l.status === 'pending' && !l.i_requested && <Decision id={l.id} decision="confirm" label={t.confirm} />}
              <Decision
                id={l.id}
                decision="end"
                label={l.status === 'active' ? t.end : l.i_requested ? t.cancel : t.end}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Decision({ id, decision, label }: { id: string; decision: string; label: string }) {
  return (
    <form action={linkDecisionForm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit">{label}</button>
    </form>
  );
}
