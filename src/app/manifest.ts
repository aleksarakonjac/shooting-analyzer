import type { MetadataRoute } from 'next';
import { sr } from '@/lib/i18n/sr';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: sr.appName,
    short_name: sr.appName,
    description: 'Trening, SIUS, SCATT i puls na jednoj vremenskoj liniji.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1530',
    theme_color: '#0b1530',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
