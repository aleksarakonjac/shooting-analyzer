'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { discardInboxFileForm, passInboxFile } from '@/lib/inbox/actions';
import type { InboxPair } from '@/lib/inbox/pairs';
import { orderTargets } from '@/lib/inbox/targets';
import { isSius, type InboxItem, type InboxKind } from '@/lib/inbox/types';
import { sr } from '@/lib/i18n/sr';
import { metaText, type DropShooter } from './DropBox';

const t = sr.inbox;

type Part = 'scatt' | 'tcx' | 'sius';
export interface InboxSession {
  id: string;
  name: string;
  trainedOn: string;
  has: Record<Part, boolean>;
}

const partOf = (kind: InboxKind): Part => (isSius(kind) ? 'sius' : kind === 'scatt' ? 'scatt' : 'tcx');
const LABEL: Record<Part, InboxKind> = { scatt: 'scatt', tcx: 'tcx', sius: 'sius_prnx' };

/** One shooter's files of one day: choose which belong together, then open them as a new session or in a saved one. */
export function InboxDay({ items, pairs, day, tz, newHref, sessions, passTo, current }: {
  items: InboxItem[];
  pairs: InboxPair[];
  day: string;
  tz: string;
  newHref: string;
  sessions: InboxSession[];
  /** Who a file sent to the wrong name can be given to. */
  passTo: DropShooter[];
  /** The file the phone just sent. */
  current?: string;
}) {
  const [chosen, setChosen] = useState<string[]>(() => {
    const pair = pairs.find((p) => p.siusId === current || p.scattId === current) ?? (current ? undefined : pairs[0]);
    if (pair) return [pair.siusId, pair.scattId];
    return current ? [current] : items.length === 1 ? [items[0].id] : [];
  });
  const on = new Set(chosen);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  // In the order shown, so the address does not depend on the order of clicks.
  const picked = items.filter((i) => on.has(i.id));
  const query = picked.map((i) => `inbox=${i.id}`).join('&');
  const parts = [...new Set(picked.map((i) => partOf(i.kind)))];
  const targets = orderTargets(sessions, day, (s) => parts.some((p) => s.has[p]));
  const name = (id: string) => items.find((i) => i.id === id)?.name ?? '';

  return (
    <div className="inbox__day">
      <ul className="rows">
        {items.map((i) => (
          <li key={i.id} className="rows__item" data-current={i.id === current || undefined}>
            <label className="inbox__pick">
              <input type="checkbox" checked={on.has(i.id)} onChange={() => toggle(i.id)} />
              <span className="rows__main">
                <strong>{i.name}</strong>
                <span className="rows__muted num">
                  {metaText(i.kind, i.meta, tz)} · {t.received(new Date(i.createdAt).toLocaleString('sr-Latn-RS', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }))}
                </span>
              </span>
            </label>
            <div className="rows__actions">
              {passTo.length > 0 && <PassOn id={i.id} to={passTo} />}
              <form action={discardInboxFileForm}>
                <input type="hidden" name="id" value={i.id} />
                <button type="submit" className="button--quiet">{t.discard}</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      {pairs.length > 1 && (
        <div className="rows__actions inbox__pairs">
          {pairs.map((p) => (
            <button key={p.siusId} type="button" className="button--quiet" onClick={() => setChosen([p.siusId, p.scattId])}>
              {name(p.siusId)} + {name(p.scattId)}
            </button>
          ))}
        </div>
      )}
      {picked.length > 0 && (
        <>
          <div className="rows__actions">
            <Link className="button" href={`${newHref}?${query}`}>{t.newSession}</Link>
          </div>
          {targets.length > 0 && (
            <details className="inbox__existing">
              <summary>{t.addToExisting}</summary>
              <ul className="rows">
                {targets.map((s) => (
                  <li key={s.id}>
                    <Link className="rows__item inbox__target" href={`/trening/${s.id}/podaci?${query}`}>
                      <span className="rows__main">
                        <strong>{s.name}</strong>
                        <span className="rows__muted num"> · {s.trainedOn}</span>
                      </span>
                      <span className="rows__muted">
                        {parts.filter((p) => sessions.find((x) => x.id === s.id)?.has[p]).map((p) => t.alreadyHas[LABEL[p]]).join(', ')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** Giving a file to someone else cannot be taken back by the giver, so choosing a name is not yet giving. */
function PassOn({ id, to }: { id: string; to: DropShooter[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [who, setWho] = useState('');
  const [failed, setFailed] = useState(false);
  const pass = () =>
    start(async () => {
      const ok = await passInboxFile(id, who).then((r) => r.ok, () => false);
      setFailed(!ok);
      if (ok) router.refresh();
    });
  return (
    <>
      <select
        aria-label={t.passTo}
        value={who}
        disabled={pending}
        onChange={(e) => {
          setWho(e.target.value);
          setFailed(false);
        }}
      >
        <option value="">{t.passTo}</option>
        {to.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {who && <button type="button" disabled={pending} onClick={pass}>{t.pass}</button>}
      {failed && <span className="drop__problem" role="alert">{t.passFailed}</span>}
    </>
  );
}
