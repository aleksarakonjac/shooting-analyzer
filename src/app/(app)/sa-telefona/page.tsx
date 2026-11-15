import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Workspace } from '@/components/Workspace';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';
import { discardInboxFileForm } from '@/lib/inbox/actions';
import { waitingInbox } from '@/lib/inbox/waiting';
import { orderTargets } from '@/lib/inbox/targets';
import { parseFilters } from '@/lib/stats/filters';
import { loadSessions } from '@/lib/stats/loadSessions';
import { hasPulse, hasScatt, type TrainingSummary } from '@/lib/stats/periodStats';
import { HOME } from '@/lib/routes';

/** How many recent sessions are offered as a place for a phone file. */
const RECENT = 8;

/** A SIUS report fills a session's result: one that has series already has it. */
const hasResult = (s: TrainingSummary) => s.matches.some((m) => m.series.length > 0);
const HAS = { scatt: hasScatt, tcx: hasPulse, sius_pdf: hasResult } as const;

type Search = { f?: string };

/** Files sent from the phone: each goes into a new session or one already saved (e.g. entered from SIUS on the laptop). */
export default function PhoneInboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role !== 'shooter') redirect(HOME);
  const t = sr.inbox;
  const { f } = await searchParams;
  const [files, sessions] = await Promise.all([waitingInbox(), loadSessions(profile.id, parseFilters({}, new Date(), profile.tz))]);
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: profile.tz }).format(new Date(iso));
  // The file the Shortcut just sent comes first.
  const ordered = [...files].sort((a, b) => Number(b.id === f) - Number(a.id === f));

  const body =
    ordered.length === 0 ? (
      <p className="panel__empty dash__empty">{t.emptyInbox}</p>
    ) : (
      <ul className="inbox__files">
        {ordered.map((file) => {
          const has = HAS[file.kind];
          const targets = orderTargets(sessions.slice(0, RECENT), day(file.createdAt), has);
          return (
            <li key={file.id} className="inbox__file" data-current={file.id === f || undefined}>
              <div className="rows__line">
                <div className="rows__main">
                  <strong>{file.name}</strong>
                  <div className="rows__muted num">
                    {t.kindLabel[file.kind]} · {t.received(new Date(file.createdAt).toLocaleString('sr-Latn-RS', { timeZone: profile.tz, dateStyle: 'short', timeStyle: 'short' }))}
                  </div>
                </div>
                <div className="rows__actions">
                  <Link className="button" href={`/trening/novi?inbox=${file.id}`}>{t.newSession}</Link>
                  <form action={discardInboxFileForm}>
                    <input type="hidden" name="id" value={file.id} />
                    <button type="submit" className="button--quiet">{t.discard}</button>
                  </form>
                </div>
              </div>
              {targets.length > 0 && (
                <>
                  <small className="rows__muted">{t.addToExisting}</small>
                  <ul className="rows">
                    {targets.map((s) => (
                      <li key={s.id}>
                        <Link className="rows__item inbox__target" href={`/trening/${s.id}/podaci?inbox=${file.id}`}>
                          <span className="rows__main">
                            <strong>{s.name}</strong>
                            <span className="rows__muted num"> · {s.trainedOn}</span>
                          </span>
                          <span className={s.has ? 'rows__muted' : 'rows__state'}>{s.has ? t.alreadyHas[file.kind] : t.missing[file.kind]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          );
        })}
      </ul>
    );

  return (
    <Workspace
      label={t.waitingTitle}
      rows={1}
      strip={<div className="ws__head"><h1 className="ws__title">{t.waitingTitle}</h1><p className="ws__meta">{t.waitingHint}</p></div>}
      panels={[{ id: 'inbox', title: t.filesTitle, range: files.length ? String(files.length) : undefined, col: '1 / 13', row: '1 / 2', children: body }]}
    />
  );
}
