'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClubManage } from '@/components/ClubManage';
import { ComboField } from '@/components/ui/ComboField';
import { chooseClub } from '@/lib/clubs/actions';
import { clubKey } from '@/lib/clubs/key';
import { sr } from '@/lib/i18n/sr';

const t = sr.club;

export interface OwnClub {
  id: string;
  name: string;
  token: string;
  canManage: boolean;
}

/** The person's own club: choose an entered one, make a new one or leave, and the club's upload link. */
export function ClubPanel({ club, clubs, siteUrl }: { club: OwnClub | null; clubs: string[]; siteUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const key = clubKey(text);
  const match = key ? clubs.find((c) => clubKey(c) === key) : undefined;
  const own = club !== null && key === clubKey(club.name);
  const choose = (name: string) =>
    start(async () => {
      const ok = await chooseClub(name).then((r) => r.ok, () => false);
      setFailed(!ok);
      if (ok) {
        setText('');
        router.refresh();
      }
    });
  const link = club && `${siteUrl}/ubaci#${club.token}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="stack" aria-labelledby="club-title">
      <h2 id="club-title">{t.title}</h2>
      {club && (
        <>
          <div className="rows__line">
            <strong>{club.name}</strong>
            <button type="button" className="button--quiet" disabled={pending} onClick={() => choose('')}>{t.leave}</button>
          </div>
          <small>{t.linkHint}</small>
          <code className="inbox__token">{link}</code>
          <button type="button" className="button--quiet" onClick={copy}>{copied ? t.copied : t.copy}</button>
          {club.canManage && <ClubManage key={club.name} id={club.id} name={club.name} />}
        </>
      )}
      <ComboField label={club ? t.change : t.field} value={text} onChange={setText} suggestions={clubs} description={t.visible} />
      {key.length >= 2 && !own && (
        <button type="button" disabled={pending} onClick={() => choose(match ?? text.trim())}>
          {match ? t.join(match) : t.make(text.trim())}
        </button>
      )}
      {failed && <p role="alert">{t.failed}</p>}
    </section>
  );
}
