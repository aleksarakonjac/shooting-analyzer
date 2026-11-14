import type { Metadata, Viewport } from 'next';
import { Barlow } from 'next/font/google';
import localFont from 'next/font/local';
import { sr } from '@/lib/i18n/sr';
import './globals.css';

const barlow = Barlow({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--f-body',
  display: 'swap',
});
// Self-hosted (OFL, src/fonts/OFL-BigShoulders.txt): Latin + Latin Extended-A subset of the variable font.
// Local files let Next measure the font and build a matching fallback, which it cannot do for this Google family.
const shoulders = localFont({
  src: '../fonts/BigShoulders-latin.woff2',
  weight: '100 900',
  variable: '--f-display',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: sr.appName,
  description: 'Trening, SIUS, SCATT i puls na jednoj vremenskoj liniji.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Content runs under the notch and home bar; the shell pads by env(safe-area-inset-*).
  viewportFit: 'cover',
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
