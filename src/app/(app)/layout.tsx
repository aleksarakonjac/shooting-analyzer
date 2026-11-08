import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { logout } from '@/lib/auth/actions';
import { getSessionProfile } from '@/lib/auth/session';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const profile = await getSessionProfile();
  // The proxy keeps non-active users out; this is only the fallback for a missing profile.
  if (!profile || profile.status !== 'active') return <>{children}</>;
  return (
    <AppShell role={profile.role} signOutAction={logout}>
      {children}
    </AppShell>
  );
}
