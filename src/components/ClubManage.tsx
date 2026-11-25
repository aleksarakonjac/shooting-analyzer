'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renameClub, replaceClubLink } from '@/lib/clubs/actions';
import { sr } from '@/lib/i18n/sr';

const t = sr.club;

/** Rename a club and replace its link: for its maker in Nalog, and for an admin. */
export function ClubManage({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(name);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = (job: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      const ok = await job().then((r) => r.ok, () => false);
      setFailed(!ok);
      if (ok) {
        setAsking(false);
        router.refresh();
      }
    });

  return (
    <div className="stack">
      <label>
        {t.name}
        <input value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="rows__actions">
        <button type="button" className="button--quiet" disabled={pending || !text.trim() || text.trim() === name} onClick={() => run(() => renameClub(id, text.trim()))}>
          {t.rename}
        </button>
        {asking ? (
          <>
            <button type="button" className="button--danger" disabled={pending} onClick={() => run(() => replaceClubLink(id))}>{t.replaceYes}</button>
            <button type="button" className="button--quiet" onClick={() => setAsking(false)}>{t.cancel}</button>
          </>
        ) : (
          <button type="button" className="button--quiet" disabled={pending} onClick={() => setAsking(true)}>{t.replace}</button>
        )}
      </div>
      {asking && <small>{t.replaceHint}</small>}
      {failed && <p role="alert">{t.failed}</p>}
    </div>
  );
}
