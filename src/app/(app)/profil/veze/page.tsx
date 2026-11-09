import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { ShareForms } from '@/components/ShareForms';
import { Workspace } from '@/components/Workspace';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { linkDecisionForm, removeShareForm, requestLinkForm } from '@/lib/links';

interface MyLink {
  id: string;
  status: 'pending' | 'active';
  other_id: string | null;
  other_name: string | null;
  other_role: 'shooter' | 'coach' | 'admin' | null;
  i_requested: boolean;
}

interface ShareRow {
  id: string;
  coach_id: string | null;
  scope: 'all' | 'training' | 'period';
  training_id: string | null;
  from_date: string | null;
  to_date: string | null;
}

type Search = { poslato?: string; greska?: string };

export default function LinksPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const { poslato, greska } = await searchParams;
  const profile = await getSessionProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_links');
  const links = (data ?? []) as MyLink[];
  const t = sr.links;
  const s = sr.sharing;
  const isShooter = profile?.role === 'shooter';

  // Sharing settings belong to the shooter and are shown under each coach link.
  let shares: ShareRow[] = [];
  let trainings: { id: string; name: string; trained_on: string }[] = [];
  if (isShooter && links.some((l) => l.status === 'active')) {
    const [sh, tr] = await Promise.all([
      supabase.from('shares').select('id, coach_id, scope, training_id, from_date, to_date').eq('shooter_id', profile.id),
      supabase
        .from('trainings')
        .select('id, name, trained_on')
        .eq('shooter_id', profile.id)
        .is('deleted_at', null)
        .order('trained_on', { ascending: false })
        .limit(50),
    ]);
    shares = (sh.data ?? []) as ShareRow[];
    trainings = (tr.data ?? []) as typeof trainings;
  }
  const label = (x: ShareRow) =>
    x.scope === 'all'
      ? s.all
      : x.scope === 'period'
        ? `${s.period}: ${x.from_date} – ${x.to_date}`
        : `${s.training}: ${trainings.find((tr) => tr.id === x.training_id)?.trained_on ?? ''}`;

  const request = (
    <form action={requestLinkForm} className="stack">
      <label>
        {t.requestLabel}
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <button type="submit">{t.requestSubmit}</button>
      {poslato && <p role="status">{t.requestSent}</p>}
      {isShooter && <p className="panel__empty">{s.intro}</p>}
    </form>
  );

  const list = !links.length ? (
    <p className="panel__empty">{t.empty}</p>
  ) : (
    <ul className="rows">
      {links.map((l) => {
        const mine = shares.filter((x) => x.coach_id === l.other_id || x.coach_id === null);
        const sharing = isShooter && l.status === 'active' && l.other_role === 'coach' && l.other_id;
        return (
          <li key={l.id} className="rows__item rows__item--stack">
            <div className="rows__line">
              <div className="rows__main">
                <strong>{l.other_name ?? t.outgoing}</strong>
                {l.other_role && <span className="rows__muted"> · {l.other_role === 'coach' ? t.coach : t.shooter}</span>}
                <div className={l.status === 'active' ? 'rows__state' : 'rows__state rows__state--pending'}>
                  {l.status === 'active' ? t.active : l.i_requested ? t.pendingOut : t.pendingIn}
                </div>
              </div>
              <div className="rows__actions">
                {l.status === 'pending' && !l.i_requested && <Decision id={l.id} decision="confirm" label={t.confirm} />}
                <Decision id={l.id} decision="end" label={l.status === 'active' ? t.end : l.i_requested ? t.cancel : t.end} quiet />
              </div>
            </div>
            {sharing && (
              <details className="share-box" open={mine.length > 0 || undefined}>
                <summary>
                  {s.withCoach} {mine.length > 0 && <span className="rows__muted">({mine.length})</span>}
                </summary>
                {mine.length === 0 ? (
                  <p className="panel__empty">{s.none}</p>
                ) : (
                  <ul className="share-box__list">
                    {mine.map((x) => (
                      <li key={x.id}>
                        <span className="num">{label(x)}</span>
                        {x.coach_id === null && <span className="rows__muted"> · {s.allCoaches}</span>}
                        <form action={removeShareForm}>
                          <input type="hidden" name="id" value={x.id} />
                          <button type="submit" className="button--quiet">{s.revoke}</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <ShareForms coachId={l.other_id!} trainings={trainings.map((x) => ({ id: x.id, label: `${x.trained_on} ${x.name}` }))} />
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <Workspace
      label={t.title}
      rows={1}
      strip={
        <>
          <div className="ws__head">
            <Link className="ws__back" href="/nalog">{sr.account.title}</Link>
            <h1 className="ws__title">{t.title}</h1>
          </div>
          {greska && <p role="alert">{s.invalid}</p>}
        </>
      }
      panels={[
        { id: 'request', title: t.requestTitle, col: '1 / 5', row: '1 / 2', children: request },
        { id: 'list', title: t.listTitle, range: links.length ? String(links.length) : undefined, col: '5 / 13', row: '1 / 2', flush: true, children: list },
      ]}
    />
  );
}

function Decision({ id, decision, label, quiet }: { id: string; decision: string; label: string; quiet?: boolean }) {
  return (
    <form action={linkDecisionForm}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button type="submit" className={quiet ? 'button--quiet' : undefined}>{label}</button>
    </form>
  );
}
