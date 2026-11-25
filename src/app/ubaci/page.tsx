import type { Metadata } from 'next';
import { ClubUpload } from '@/components/inbox/ClubUpload';
import { sr } from '@/lib/i18n/sr';

export const metadata: Metadata = {
  title: sr.drop.pageTitle,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ClubUploadPage() {
  return <ClubUpload />;
}
