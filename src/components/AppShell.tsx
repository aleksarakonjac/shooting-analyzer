'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { sr } from '@/lib/i18n/sr';
import { NavLinks, type NavItem } from './NavLinks';

type Role = 'shooter' | 'coach' | 'admin';

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICON = {
  stats: icon('M4 20V10M10 20V4M16 20v-7M22 20H2'),
  plus: icon('M12 5v14M5 12h14'),
  list: icon('M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'),
  people: icon('M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6'),
  link: icon('M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1'),
  share: icon('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13'),
  shield: icon('M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6l-8-3ZM8.5 12l2.5 2.5L15.5 10'),
  trash: icon('M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3'),
  clock: icon('M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'),
  user: icon('M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'),
  rail: icon('M4 4h16v16H4zM9 4v16'),
  out: icon('M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9'),
};

const ACCOUNT: NavItem = { href: '/nalog', label: sr.nav.account, icon: ICON.user };

const NAV: Record<Role, NavItem[]> = {
  shooter: [
    { href: '/', label: sr.nav.trainings, icon: ICON.list },
    { href: '/statistika', label: sr.nav.stats, icon: ICON.stats },
    { href: '/trening/novi', label: sr.newTraining.nav, icon: ICON.plus },
  ],
  coach: [
    { href: '/strelci', label: sr.nav.shooters, icon: ICON.people },
  ],
  admin: [
    { href: '/admin/approvals', label: sr.nav.approvals, icon: ICON.shield },
  ],
};

const KEY = 'rail-collapsed';
const EVENT = 'rail-collapsed-change';

// The collapsed rail is a per-browser preference: read from localStorage, expanded on the server.
const readCollapsed = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};
const setCollapsed = (value: boolean) => {
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* storage blocked: the toggle still works until the next page */
  }
  window.dispatchEvent(new Event(EVENT));
};

/**
 * Side rail on desktop (collapsible to icons; remembered per browser), bottom bar on phone widths
 * (the same markup, restyled).
 */
export function AppShell({
  role,
  signOutAction,
  children,
}: {
  role: Role;
  signOutAction?: () => Promise<void>;
  children: ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const toggle = () => setCollapsed(!collapsed);
  return (
    <div className="shell" data-collapsed={collapsed || undefined}>
      <a className="shell__skip" href="#sadrzaj">{sr.nav.skip}</a>
      <aside className="shell__rail">
        <div className="shell__top">
          <div className="shell__brand">{sr.brand}</div>
          <button
            type="button"
            className="shell__toggle"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? sr.nav.expand : sr.nav.collapse}
            title={collapsed ? sr.nav.expand : sr.nav.collapse}
          >
            {ICON.rail}
          </button>
        </div>
        <nav className="shell__nav" aria-label={sr.nav.label}>
          <NavLinks items={NAV[role]} />
        </nav>
        <nav className="shell__account" aria-label={sr.nav.account}>
          <NavLinks items={[ACCOUNT]} />
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
