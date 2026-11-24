'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { sr } from '@/lib/i18n/sr';
import { DropBox, type DropShooter, type Sender } from './DropBox';

const t = sr.drop;
const KEY = 'club-link';
const TOKEN = /^ub_[0-9a-f]{64}$/;
const API = '/api/inbox/link';

/** For a browser that keeps nothing: the token lives until the page is closed. */
let inMemory: string | null = null;

/** The token from the link just opened (then taken out of the address), or the one kept from before. */
function readToken(): string | null {
  const fromLink = window.location.hash.slice(1);
  if (TOKEN.test(fromLink)) {
    window.history.replaceState(null, '', window.location.pathname);
    inMemory = null;
    try {
      localStorage.setItem(KEY, fromLink);
    } catch {
      inMemory = fromLink;
    }
    return fromLink;
  }
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && TOKEN.test(kept)) return kept;
  } catch {
    /* storage blocked */
  }
  return inMemory;
}

function forgetToken() {
  inMemory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

type View = { kind: 'loading' } | { kind: 'none' } | { kind: 'offline' } | { kind: 'club'; token: string; name: string; shooters: DropShooter[] };

/** The public page of a club, opened with its link on a shared computer. Nobody signs in here. */
export function ClubUpload() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(async () => {
    const token = readToken();
    if (!token) return setView({ kind: 'none' });
    try {
      const res = await fetch(API, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.status === 401) {
        forgetToken();
        return setView({ kind: 'none' });
      }
      if (!res.ok) throw new Error(String(res.status));
      const club = (await res.json()) as { name: string; shooters: DropShooter[] };
      setView({ kind: 'club', token, ...club });
    } catch {
      setView({ kind: 'offline' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the token is only known in the browser
    void load();
    // The link opened again in the same tab only changes the part after #.
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, [load]);

  const token = view.kind === 'club' ? view.token : null;
  const sender = useMemo<Sender>(() => {
    const post = async (body: unknown) => {
      const res = await fetch(API, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) {
        forgetToken();
        setView({ kind: 'none' });
      }
      const data = await res.json().catch(() => ({}));
      return { ...data, status: res.status };
    };
    return { start: (req) => post({ step: 'start', ...req }), confirm: (uploadId) => post({ step: 'confirm', uploadId }) };
  }, [token]);
  // The report is read on the computer that wrote it, so its own zone is the right one.
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Belgrade');

  return (
    <main className="club">
      <div className="club__brand"><Wordmark /></div>
      {view.kind === 'loading' && <p className="rows__muted">{t.loading}</p>}
      {view.kind === 'none' && (
        <>
          <h1>{t.notConnected}</h1>
          <p>{t.notConnectedHint}</p>
        </>
      )}
      {view.kind === 'offline' && (
        <>
          <p role="alert">{t.offline}</p>
          <button type="button" onClick={load}>{t.again}</button>
        </>
      )}
      {view.kind === 'club' && (
        <>
          <h1>{view.name}</h1>
          <DropBox shooters={view.shooters} sender={sender} tz={tz} />
        </>
      )}
    </main>
  );
}
