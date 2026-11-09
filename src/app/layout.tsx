import type { Metadata, Viewport } from 'next';
import { Barlow, Big_Shoulders } from 'next/font/google';
import { sr } from '@/lib/i18n/sr';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--f-body',
  display: 'swap',
});
const shoulders = Big_Shoulders({
  subsets: ['latin', 'latin-ext'],
  variable: '--f-display',
  display: 'swap',
  adjustFontFallback: false, // no metrics for this family; silences a build warning
});

export const metadata: Metadata = {
  title: sr.appName,
  description: 'Trening, SIUS, SCATT i puls na jednoj vremenskoj liniji.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark',
  themeColor: '#0b1530',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr" className={`${barlow.variable} ${shoulders.variable}`}>
      <body>{children}</body>
    </html>
  );
}
