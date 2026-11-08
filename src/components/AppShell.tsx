import type { ReactNode } from 'react';
import { sr } from '@/lib/i18n/sr';
import { NavLinks, type NavItem } from './NavLinks';

type Role = 'shooter' | 'coach' | 'admin';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICON = {
  plus: icon('M12 5v14M5 12h14'),
  list: icon('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'),
  people: icon('M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6'),
  link: icon('M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1'),
  share: icon('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13'),
  shield: icon('M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3ZM8.5 12l2.5 2.5L15.5 10'),
  out: icon('M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9'),
};

const NAV: Record<Role, NavItem[]> = {
  shooter: [
    { href: '/', label: sr.nav.trainings, icon: ICON.list },
    { href: '/trening/novi', label: sr.newTraining.nav, icon: ICON.plus },
    { href: '/profil/veze', label: sr.nav.links, icon: ICON.link },
    { href: '/profil/deljenje', label: sr.nav.sharing, icon: ICON.share },
  ],
  coach: [
    { href: '/', label: sr.nav.shooters, icon: ICON.people },
    { href: '/profil/veze', label: sr.nav.links, icon: ICON.link },
  ],
  admin: [{ href: '/admin/approvals', label: sr.nav.approvals, icon: ICON.shield }],
};

/** Side rail on desktop, bottom bar on phone widths (the same markup, restyled). */
export function AppShell({
  role,
  signOutAction,
  children,
}: {
  role: Role;
  signOutAction?: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <a className="shell__skip" href="#sadrzaj">{sr.nav.skip}</a>
      <aside className="shell__rail">
        <div className="shell__brand">{sr.appName}</div>
        <nav className="shell__nav" aria-label={sr.nav.label}>
          <NavLinks items={NAV[role]} />
        </nav>
        {signOutAction && (
          <form action={signOutAction} className="shell__out">
            <button type="submit" className="shell__link shell__link--button">
              {ICON.out}
              <span>{sr.auth.logout}</span>
            </button>
          </form>
        )}
      </aside>
      <main id="sadrzaj" className="shell__main">{children}</main>
    </div>
  );
}
