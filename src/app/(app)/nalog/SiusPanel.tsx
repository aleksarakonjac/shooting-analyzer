'use client';
import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { connectSius, disconnectSius, siusConfirmAthlete } from '@/lib/sius/actions';
import { sr } from '@/lib/i18n/sr';

const t = sr.sius;
type Status = { state: 'none' | 'ok' | 'broken'; reason: string | null; email: string | null };
type ErrorKey = keyof typeof t.errors;

/** Connect the shooter's SIUS Shooting Sports Cloud account; the password goes straight to the server and is never shown again. */
export function SiusPanel({ userId, status, athleteId }: { userId: string; status: Status; athleteId: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(status.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, start] = useTransition();
  const [athlete, setAthlete] = useState(athleteId ?? '');
  const [athleteSaved, setAthleteSaved] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const pw = password;
    setPassword('');
    setError(null);
    start(async () => {
      try {
        const r = await connectSius(email, pw);
        if (r.ok) router.refresh();
        else setError(r.error in t.errors ? (r.error as ErrorKey) : 'unavailable');
      } catch {
        setError('unavailable');
      }
    });
  }

  function disconnect() {
    start(async () => {
      try {
        await disconnectSius();
        router.refresh();
      } catch {
        setError('unavailable');
      }
    });
  }

  function saveAthlete(e: FormEvent) {
    e.preventDefault();
    setAthleteSaved(false);
    start(async () => {
      try {
        const r = await siusConfirmAthlete(userId, athlete.trim());
        setAthleteSaved('ok' in r);
      } catch {
        setAthleteSaved(false);
      }
    });
  }

  const brokenText = status.state === 'broken' ? (t.broken[(status.reason ?? 'unknown') as keyof typeof t.broken] ?? t.broken.unknown) : null;

  return (
    <section className="stack" aria-labelledby="sius-title">
      <h2 id="sius-title">{t.title}</h2>
      {status.state === 'ok' ? (
        <>
          {status.email && <p>{t.connectedAs(status.email)}</p>}
          <button type="button" className="button--quiet" onClick={disconnect} disabled={pending}>{t.disconnect}</button>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          {brokenText && <p role="status">{brokenText}</p>}
          <label>
            {t.email}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" maxLength={254} />
          </label>
          <label>
            {t.password}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" maxLength={256} />
          </label>
          {error && <p role="alert">{t.errors[error]}</p>}
          <button type="submit" disabled={pending}>{pending ? t.busy : status.state === 'broken' ? t.reconnect : t.connect}</button>
          <small>{t.hint}</small>
        </form>
      )}
      <form className="stack" onSubmit={saveAthlete}>
        <label>
          {t.athleteId}
          <input value={athlete} onChange={(e) => setAthlete(e.target.value)} maxLength={64} pattern="[A-Za-z0-9_\-]+" />
        </label>
        <small>{t.athleteIdHint}</small>
        {athleteSaved && <p role="status">{t.athleteSaved}</p>}
        <button type="submit" className="button--quiet" disabled={pending || !athlete.trim()}>{t.athleteSave}</button>
      </form>
    </section>
  );
}
