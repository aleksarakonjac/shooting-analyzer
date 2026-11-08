import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { getSessionProfile } from '@/lib/auth/session';
import { logout } from '@/lib/auth/actions';

export default function WaitingPage() {
  return (
    <main className="page page--narrow">
      <h1>{sr.waiting.title}</h1>
      <Suspense fallback={null}>
        <Message />
      </Suspense>
      <form action={logout}>
        <button type="submit">{sr.auth.logout}</button>
      </form>
    </main>
  );
}

async function Message() {
  const profile = await getSessionProfile();
  return <p>{profile?.status === 'disabled' ? sr.waiting.disabled : sr.waiting.pending}</p>;
}
