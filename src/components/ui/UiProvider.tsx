'use client';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { I18nProvider, RouterProvider } from 'react-aria-components';

/** Serbian Latin dates and numbers for every control, and client-side links through the Next router. */
export const UI_LOCALE = 'sr-Latn-RS';

export function UiProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <RouterProvider navigate={(href) => router.push(href)}>
      <I18nProvider locale={UI_LOCALE}>{children}</I18nProvider>
    </RouterProvider>
  );
}
