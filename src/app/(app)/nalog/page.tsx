import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Workspace } from '@/components/Workspace';
import { logout } from '@/lib/auth/actions';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';
import { PipRuleForm } from './PipRuleForm';
import { PasskeyPanel } from './PasskeyPanel';
import { DISCIPLINES } from '@/lib/domain/disciplines';
import type { DisciplineId } from '@/lib/domain/types';
import { pipTopFor } from '@/lib/report/target';

type Search = { sacuvano?: string; greska?: string; prikaz?: string };

export default function AccountPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const { sacuvano, greska, prikaz } = await searchParams;
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('display_name, pip_top').eq('id', profile.id).maybeSingle();
  const pipPrefs = (data?.pip_top ?? {}) as Record<string, unknown>;
  const pipCurrent = Object.fromEntries((Object.keys(DISCIPLINES) as DisciplineId[]).map((d) => [d, pipTopFor(pipPrefs, d)])) as Record<DisciplineId, number>;
  const t = sr.account;

  const profilePanel = (
    <div className="stack">
      {sacuvano && <p role="status">{t.saved}</p>}
      {greska && <p role="alert">{t.invalid}</p>}
      <ProfileForm name={(data?.display_name as string | undefined) ?? ''} tz={profile.tz} />
      <PasskeyPanel />
    </div>
  );

  const displayPanel = (
    <div className="stack">
      {prikaz && <p role="status">{t.pipSaved}</p>}
      <PipRuleForm current={pipCurrent} />
    </div>
  );

  const entries = [
    ...(profile.role === 'admin' ? [{ href: '/admin/approvals', title: t.approvals, hint: '' }] : []),
    { href: '/profil/veze', title: t.links, hint: t.linksHint },
    { href: '/korpa', title: t.trash, hint: t.trashHint },
    { href: '/dnevnik', title: t.audit, hint: t.auditHint },
  ];
  const more = (
    <>
      <ul className="dash__list account__links">
        {entries.map((e) => (
          <li key={e.href}>
            <Link href={e.href}>
              <span className="dash__name">
                {e.title}
                {e.hint && <small className="account__hint">{e.hint}</small>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <form action={logout} className="account__out">
        <button type="submit" className="button--quiet">{t.signOut}</button>
      </form>
    </>
  );

  return (
    <Workspace
      label={t.title}
      rows={1}
      strip={<div className="ws__head"><h1 className="ws__title">{t.title}</h1></div>}
      panels={[
        { id: 'profile', title: t.profile, col: '1 / 5', row: '1 / 2', children: profilePanel },
        { id: 'display', title: t.display, col: '5 / 9', row: '1 / 2', children: displayPanel },
        { id: 'more', title: t.sections, col: '9 / 13', row: '1 / 2', flush: true, children: more },
      ]}
    />
  );
}
