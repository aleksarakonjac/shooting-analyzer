'use client';
import { useActionState, useState } from 'react';
import { createInboxToken, revokeInboxToken } from '@/lib/inbox/actions';
import { sr } from '@/lib/i18n/sr';

const t = sr.inbox;
export type TokenRow = { id: string; label: string; created_at: string; last_used_at: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString('sr-Latn-RS');

/** Personal upload tokens for the iOS share-sheet Shortcut, and how to set the Shortcut up. */
export function InboxTokenPanel({ tokens, uploadUrl }: { tokens: TokenRow[]; uploadUrl: string }) {
  const [state, action, pending] = useActionState(createInboxToken, undefined);
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="stack" aria-labelledby="inbox-title">
      <h2 id="inbox-title">{t.title}</h2>
      <small>{t.hint}</small>

      {tokens.length === 0 ? (
        <p className="rows__muted">{t.none}</p>
      ) : (
        <ul className="rows">
          {tokens.map((k) => (
            <li key={k.id} className="rows__item">
              <div className="rows__main">
                <strong>{k.label || t.unnamed}</strong>
                <div className="rows__muted num">
                  {day(k.created_at)} · {k.last_used_at ? t.lastUsed(day(k.last_used_at)) : t.neverUsed}
                </div>
              </div>
              <form action={revokeInboxToken}>
                <input type="hidden" name="id" value={k.id} />
                <button type="submit" className="button--danger">{t.revoke}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {state?.token && (
        <div className="stack" role="status">
          <small>{t.newToken}</small>
          <code className="inbox__token">{state.token}</code>
          <button type="button" className="button--quiet" onClick={() => copy(state.token!)}>{copied ? t.copied : t.copy}</button>
        </div>
      )}
      {state?.error && <p role="alert">{t.createFailed}</p>}

      <form action={action} className="stack">
        <label>
          {t.label}
          <input name="label" maxLength={60} placeholder={t.labelPlaceholder} />
        </label>
        <button type="submit" disabled={pending}>{t.create}</button>
      </form>

      <details>
        <summary>{t.howTo}</summary>
        <ol className="inbox__steps">
          {t.steps.map((s, i) => (
            <li key={i}>
              {s}
              {i === 2 && <code className="inbox__token">{uploadUrl}</code>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
