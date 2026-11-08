'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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
        const active = it.href === '/' ? pathname === '/' : pathname === it.href || pathname.startsWith(it.href + '/');
        return (
          <Link key={it.href} href={it.href} className="shell__link" aria-current={active ? 'page' : undefined}>
            {it.icon}
            <span>{it.label}</span>
          </Link>
        );
      })}
    </>
  );
}
