'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Close } from '@/components/ui/icons';
import { readListUrl } from '@/lib/listReturn';
import { sr } from '@/lib/i18n/sr';

/** The strip's "X": back to the sessions list as it was left (filters, period), or the plain list. */
export function CloseReport({ fallback = '/' }: { fallback?: string }) {
  const [href, setHref] = useState(fallback);
  useEffect(() => { setHref(readListUrl() ?? fallback); }, [fallback]);
  return (
    <Link href={href} className="ui-trigger more__trigger ws__close hide-phone" aria-label={sr.report.close} title={sr.report.close}>
      <Close />
    </Link>
  );
}
