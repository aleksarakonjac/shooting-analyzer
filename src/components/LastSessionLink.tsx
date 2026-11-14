'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLastSession } from '@/lib/report/lastSession';
import { sr } from '@/lib/i18n/sr';

const TOAST_MS = 3500;

/**
 * First rail item: back to the session report the viewer last had open (it restores the shot).
 * Greyed out until there is one; pressing it then says to pick a session first.
 */
export function LastSessionLink({ icon }: { icon: ReactNode }) {
  const last = useLastSession();
  const pathname = usePathname() ?? '';
  const [toast, setToast] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  if (last) {
    const href = `/trening/${last.id}`;
    const title = last.name ? `${sr.nav.review}: ${last.name}` : sr.nav.review;
    return (
      <Link href={href} className="shell__link shell__link--review" aria-current={pathname === href ? 'page' : undefined} title={title}>
        {icon}
        <span>{sr.nav.review}</span>
      </Link>
    );
  }

  const show = () => {
    setToast(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(false), TOAST_MS);
  };
  return (
    <>
      <button type="button" className="shell__link shell__link--button shell__link--review" aria-disabled="true" onClick={show}>
        {icon}
        <span>{sr.nav.review}</span>
      </button>
      {toast && createPortal(<div className="toast" role="status">{sr.nav.reviewNone}</div>, document.body)}
    </>
  );
}
