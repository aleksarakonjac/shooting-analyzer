import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { getSessionProfile } from '@/lib/auth/session';
import { logout } from '@/lib/auth/actions';

export default function WaitingPage() {
  return (
    <main className="auth">
      <div className="auth__brand" aria-hidden="true">{sr.appName}</div>
      <section className="auth__card" aria-labelledby="wait-title">
        <h1 id="wait-title" className="auth__title">{sr.waiting.title}</h1>
        <Suspense fallback={null}>
          <Message />
        </Suspense>
        <form action={logout}>
          <button type="submit" className="button--quiet">{sr.auth.logout}</button>
        </form>
      </section>
    </main>
  );
}

async function Message() {
  const profile = await getSessionProfile();
  return <p>{profile?.status === 'disabled' ? sr.waiting.disabled : sr.waiting.pending}</p>;
}
