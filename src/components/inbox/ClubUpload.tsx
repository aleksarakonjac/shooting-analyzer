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
/** A token from a link just opened that the server has not accepted yet. */
let candidate: string | null = null;

/** Takes a token from the address; it is not kept before the server accepts it. */
function readLink() {
  const fromLink = window.location.hash.slice(1);
  if (!TOKEN.test(fromLink)) return;
  candidate = fromLink;
  window.history.replaceState(null, '', window.location.pathname);
}

function keptToken(): string | null {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && TOKEN.test(kept)) return kept;
  } catch {
    /* storage blocked */
  }
  return inMemory;
}

function keepToken(token: string) {
  inMemory = null;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    inMemory = token;
  }
}

function forgetToken() {
  inMemory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

interface Club {
  token: string;
  name: string;
  shooters: DropShooter[];
}

/** The club behind a token, or null when the server does not know the token. Throws when there is no answer. */
async function fetchClub(token: string): Promise<Club | null> {
  const res = await fetch(API, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(String(res.status));
  return { token, ...((await res.json()) as Omit<Club, 'token'>) };
}

type View = { kind: 'loading' } | { kind: 'none' } | { kind: 'offline' } | { kind: 'ask'; current: Club; next: Club } | ({ kind: 'club' } & Club);

/** The public page of a club, opened with its link on a shared computer. Nobody signs in here. */
export function ClubUpload() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = useCallback(async () => {
    readLink();
    const kept = keptToken();
    try {
      const next = candidate && candidate !== kept ? await fetchClub(candidate) : null;
      const current = kept ? await fetchClub(kept) : null;
      if (kept && !current) forgetToken();
      candidate = null;
      // A foreign link must not move a shared computer to another club unasked.
      if (next && current) return setView({ kind: 'ask', current, next });
      const club = next ?? current;
      if (!club) return setView({ kind: 'none' });
      if (next) keepToken(next.token);
      setView({ kind: 'club', ...club });
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
      {view.kind === 'ask' && (
        <>
          <p>{t.switchAsk(view.current.name, view.next.name)}</p>
          <div className="rows__actions">
            <button type="button" onClick={() => setView({ kind: 'club', ...view.current })}>{t.switchNo(view.current.name)}</button>
            <button
              type="button"
              className="button--quiet"
              onClick={() => {
                keepToken(view.next.token);
                setView({ kind: 'club', ...view.next });
              }}
            >
              {t.switchYes(view.next.name)}
            </button>
          </div>
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
