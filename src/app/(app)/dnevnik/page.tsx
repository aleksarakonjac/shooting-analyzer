import { Suspense } from 'react';
import { Workspace } from '@/components/Workspace';
import { connection } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { describeAudit } from '@/lib/audit/describe';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';

export default function AuditPage() {
  return (
    <Suspense fallback={null}>
      <Body />
    </Suspense>
  );
}

interface Row {
  id: number;
  at: string;
  actor_id: string | null;
  action: string;
  diff: unknown;
}

async function Body() {
  await connection();
  const t = sr.audit;
  const profile = await getSessionProfile();
  const supabase = await createClient();
  // Row-level security already limits this to the viewer's scope (the admin sees everything).
  const { data } = await supabase
    .from('audit_log')
    .select('id,at,actor_id,action,diff')
    .eq('table_name', 'trainings')
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Row[];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id && id !== profile?.id))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: ps } = await supabase.from('profiles').select('id,display_name').in('id', actorIds);
    for (const p of (ps ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }
  const who = (id: string | null) => (id === null ? t.unknown : id === profile?.id ? t.you : (names.get(id) ?? t.unknown));

  const body = (
    <>
      {rows.length === 0 ? (
        <p className="panel__empty dash__empty">{t.empty}</p>
      ) : (
        <table className="audit__table">
          <thead>
            <tr>
              <th scope="col">{t.when}</th>
              <th scope="col">{t.who}</th>
              <th scope="col">{t.what}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = describeAudit(r);
              return (
                <tr key={r.id} data-testid="audit-row">
                  <td className="num">{new Date(r.at).toLocaleString('sr-Latn-RS', { timeZone: profile?.tz })}</td>
                  <td>{who(r.actor_id)}</td>
                  <td>
                    {t[d.action]}
                    {d.name && <>: {d.name}</>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
  return (
    <Workspace
      label={t.title}
      rows={1}
      strip={<div className="ws__head"><h1 className="ws__title">{t.title}</h1><p className="ws__meta">{t.intro}</p></div>}
      panels={[{ id: 'audit', title: t.listTitle, col: '1 / 13', row: '1 / 2', flush: true, children: body }]}
    />
  );
}
