import { Suspense } from 'react';
import Link from 'next/link';
import { Workspace } from '@/components/Workspace';
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
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ poslato?: string }> }) {
  const { poslato } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_links');
  const links = data as MyLink[] | null;
  const t = sr.links;
  const request = (
    <form action={requestLinkForm} className="stack">
      <label>
        {t.requestLabel}
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <button type="submit">{t.requestSubmit}</button>
      {poslato && <p role="status">{t.requestSent}</p>}
    </form>
  );
  const list = !links?.length ? (
    <p className="panel__empty">{t.empty}</p>
  ) : (
    <ul className="rows">
      {links.map((l) => (
        <li key={l.id} className="rows__item">
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
        </li>
      ))}
    </ul>
  );
  return (
    <Workspace
      label={t.title}
      rows={1}
      strip={
        <>
          <div className="ws__head"><h1 className="ws__title">{t.title}</h1></div>
          <div className="ws__strip-end"><Link className="button button--quiet" href="/profil/deljenje">{t.sharingLink}</Link></div>
        </>
      }
      panels={[
        { id: 'request', title: t.requestTitle, col: '1 / 6', row: '1 / 2', children: request },
        { id: 'list', title: t.listTitle, range: links?.length ? String(links.length) : undefined, col: '6 / 13', row: '1 / 2', flush: true, children: list },
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
