import { sr } from '@/lib/i18n/sr';
import type { ConnectOutcome } from '@/lib/googleHealth/connect';

const t = sr.googleHealth;
export type HealthFlash = ConnectOutcome | 'off';

const day = (iso: string) => new Date(iso).toLocaleDateString('sr-Latn-RS');

/** Connect or disconnect Google Health, the source of pulse for trainings. */
export function GoogleHealthPanel({ status, connectedAt, flash }: { status: 'none' | 'ok' | 'broken'; connectedAt: string | null; flash: HealthFlash | null }) {
  const bad = flash !== null && flash !== 'ok' && flash !== 'off';
  return (
    <section className="stack" aria-labelledby="gh-title">
      <h2 id="gh-title">{t.title}</h2>
      {flash && (bad ? <p role="alert">{t.flash[flash]}</p> : <p role="status">{t.flash[flash]}</p>)}
      {status === 'ok' ? (
        <>
          {connectedAt && <p>{t.connectedSince(day(connectedAt))}</p>}
          <form action="/api/google-health/disconnect" method="post">
            <button type="submit" className="button--quiet">{t.disconnect}</button>
          </form>
        </>
      ) : (
        <>
          {status === 'broken' && <p role="status">{t.broken}</p>}
          <a className="button" href="/api/google-health/connect">{status === 'broken' ? t.reconnect : t.connect}</a>
          <small>{t.hint}</small>
        </>
      )}
    </section>
  );
}
