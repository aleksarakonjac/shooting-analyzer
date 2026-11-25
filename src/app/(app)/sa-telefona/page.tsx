import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { InboxDay, type InboxSession } from '@/components/inbox/InboxDay';
import { OwnDrop } from '@/components/inbox/OwnDrop';
import { Workspace } from '@/components/Workspace';
import { linkedShooters } from '@/lib/auth/linkedShooters';
import { getSessionProfile } from '@/lib/auth/session';
import { sr } from '@/lib/i18n/sr';
import { groupInbox } from '@/lib/inbox/pairs';
import { waitingInbox } from '@/lib/inbox/waiting';
import { HOME } from '@/lib/routes';
import { parseFilters } from '@/lib/stats/filters';
import { loadSessions } from '@/lib/stats/loadSessions';
import { hasPulse, hasScatt, type TrainingSummary } from '@/lib/stats/periodStats';
import { createClient } from '@/lib/supabase/server';

/** How many recent sessions are offered as a place for waiting files. */
const RECENT = 8;

/** A SIUS report fills a session's result: one that has series already has it. */
const hasResult = (s: TrainingSummary) => s.matches.some((m) => m.series.length > 0);

type Search = { f?: string };

/**
 * The inbox: files sent from the range laptops, the phone or here, to be put together into sessions. A shooter sees
 * their own, a coach those of the linked shooters. (The address is older than the name: the phone Shortcut opens it.)
 */
export default function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const profile = await getSessionProfile();
  if (!profile || profile.role === 'admin') redirect(HOME);
  const t = sr.inbox;
  const coach = profile.role === 'coach';
  const { f } = await searchParams;
  const supabase = await createClient();
  const [shooters, { data: mateRows }] = await Promise.all([
    coach ? linkedShooters() : [{ id: profile.id, name: '' }],
    coach ? { data: [] } : supabase.rpc('club_mates'),
  ]);
  const mates = ((mateRows ?? []) as { id: string; display_name: string }[]).map((m) => ({ id: m.id, name: m.display_name }));
  const files = await waitingInbox(shooters.map((s) => s.id));
  // The file the Shortcut just sent comes first.
  const groups = groupInbox(files, profile.tz).sort((a, b) => Number(b.items.some((i) => i.id === f)) - Number(a.items.some((i) => i.id === f)));
  const withFiles = [...new Set(groups.map((g) => g.shooterId))];
  const filters = parseFilters({}, new Date(), profile.tz);
  const sessions = new Map<string, InboxSession[]>(
    await Promise.all(
      withFiles.map(async (id): Promise<[string, InboxSession[]]> => {
        const recent = (await loadSessions(id, filters)).slice(0, RECENT);
        return [id, recent.map((s) => ({ id: s.id, name: s.name, trainedOn: s.trainedOn, has: { scatt: hasScatt(s), tcx: hasPulse(s), sius: hasResult(s) } }))];
      }),
    ),
  );
  const nameOf = (id: string) => shooters.find((s) => s.id === id)?.name ?? '';

  const body = (
    <div className="inbox">
      <OwnDrop shooters={shooters} fixed={!coach} tz={profile.tz} />
      {groups.length === 0 ? (
        <p className="panel__empty dash__empty">{t.emptyInbox}</p>
      ) : (
        groups.map((g) => (
          <section key={`${g.shooterId} ${g.day}`} className="inbox__group">
            <h2>
              {[coach && nameOf(g.shooterId), new Date(`${g.day}T12:00:00Z`).toLocaleDateString('sr-Latn-RS', { timeZone: 'UTC', dateStyle: 'medium' })].filter(Boolean).join(' · ')}
            </h2>
            <InboxDay
              // A change of files starts the choice over.
              key={g.items.map((i) => i.id).join()}
              items={g.items}
              pairs={g.pairs}
              day={g.day}
              tz={profile.tz}
              newHref={coach ? `/strelci/${g.shooterId}/novi` : '/trening/novi'}
              sessions={sessions.get(g.shooterId) ?? []}
              passTo={(coach ? shooters : mates).filter((p) => p.id !== g.shooterId)}
              current={g.items.some((i) => i.id === f) ? f : undefined}
            />
          </section>
        ))
      )}
    </div>
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
