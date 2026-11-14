'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Fired when the menu item of the current page is pressed again; `detail` is its href. */
export const NAV_RESELECT = 'nav-reselect';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? '';
  return (
    <>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + '/');
        return (
          <Link
            key={it.href}
            href={it.href}
            className="shell__link"
            aria-current={active ? 'page' : undefined}
            // Pressing the item of the page you are on: the page may have sub-views to close (a panel opened over it).
            onClick={() => { if (active) window.dispatchEvent(new CustomEvent(NAV_RESELECT, { detail: it.href })); }}
          >
            {it.icon}
            <span>{it.label}</span>
          </Link>
        );
      })}
    </>
  );
}
