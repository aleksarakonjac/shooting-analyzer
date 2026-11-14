import type { Metadata } from 'next';
import { POLICY_PATH, PrivacyPolicy, policyDescription, policyTitle } from '@/components/PrivacyPolicy';

export const metadata: Metadata = {
  title: policyTitle('en'),
  description: policyDescription('en'),
  alternates: { canonical: POLICY_PATH.en, languages: { sr: POLICY_PATH.sr, en: POLICY_PATH.en } },
};

export default function PrivacyPageEn() {
  return <PrivacyPolicy lang="en" />;
}
