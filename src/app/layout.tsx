import type { Metadata, Viewport } from 'next';
import { sr } from '@/lib/i18n/sr';
import './globals.css';

export const metadata: Metadata = {
  title: sr.appName,
  description: 'Trening, SIUS, SCATT i puls na jednoj vremenskoj liniji.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr">
      <body>{children}</body>
    </html>
  );
}
