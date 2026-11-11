'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sr } from '@/lib/i18n/sr';

const t = sr.account;
type Item = { id: string; friendly_name?: string | null; created_at: string };

/** The signed-in user's passkeys: add this device, remove old ones. */
export function PasskeyPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState('');

  const load = useCallback(async () => {
    const { data } = await createClient().auth.passkey.list();
    setItems((data as Item[] | null) ?? []);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the list once on mount
    void load();
  }, [load]);

  async function add() {
    setError(false);
    const { error: e } = await createClient().auth.registerPasskey();
    if (e) {
      console.error('registerPasskey failed', e);
      setError(true);
      setDetail([(e as { code?: string }).code, e.name, e.message].filter(Boolean).join(' · '));
    }
    await load();
  }
  async function remove(id: string) {
    await createClient().auth.passkey.delete({ passkeyId: id });
    await load();
  }

  return (
    <section className="stack" aria-labelledby="passkeys-title">
      <h2 id="passkeys-title">{t.passkeys}</h2>
      <small>{t.passkeysHint}</small>
      {items && items.length === 0 && <p className="rows__muted">{t.passkeyNone}</p>}
      {items && items.length > 0 && (
        <ul className="rows">
          {items.map((p) => (
            <li key={p.id} className="rows__item">
              <div className="rows__main">
                <strong>{p.friendly_name || t.passkeyUnnamed}</strong>
                <div className="rows__muted num">{new Date(p.created_at).toLocaleDateString('sr-Latn-RS')}</div>
              </div>
              <button type="button" className="button--danger" onClick={() => remove(p.id)}>{t.passkeyRemove}</button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert">
          {t.passkeyFailed}
          {detail && <small className="rows__muted"> ({detail})</small>}
        </p>
      )}
      <button type="button" onClick={add}>{t.passkeyAdd}</button>
    </section>
  );
}
