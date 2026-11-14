import type { Metadata } from 'next';
import { POLICY_PATH, PrivacyPolicy, policyDescription, policyTitle } from '@/components/PrivacyPolicy';

export const metadata: Metadata = {
  title: policyTitle('sr'),
  description: policyDescription('sr'),
  alternates: { canonical: POLICY_PATH.sr, languages: { sr: POLICY_PATH.sr, en: POLICY_PATH.en } },
};

export default function PrivacyPage() {
  return <PrivacyPolicy lang="sr" />;
}
