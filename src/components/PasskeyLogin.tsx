'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { sr } from '@/lib/i18n/sr';

/** Signs in with a saved passkey (the browser shows its own picker). The browser client stores the session cookie, so a refresh lets the server see it. */
export function PasskeyLogin() {
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function run() {
    setBusy(true);
    setError(false);
    const { error: e } = await createClient().auth.signInWithPasskey();
    if (e) {
      setError(true);
      setBusy(false);
      return;
    }
    router.push('/');
    router.refresh();
  }
  return (
    <div className="stack">
      <button type="button" className="button--quiet" onClick={run} disabled={busy}>{sr.auth.passkeyLogin}</button>
      {error && <p role="alert">{sr.auth.passkeyFailed}</p>}
    </div>
  );
}
