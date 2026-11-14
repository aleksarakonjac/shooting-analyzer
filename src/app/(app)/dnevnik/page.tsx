import Link from 'next/link';
import { Suspense } from 'react';
import { Workspace } from '@/components/Workspace';
import { connection } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { describeAudit } from '@/lib/audit/describe';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';

const SIZES = [20, 30, 50] as const;

interface Search {
  page?: string;
  size?: string;
}

export default function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <Suspense fallback={null}>
      <Body searchParams={searchParams} />
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

async function Body({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const sizeNum = Number(sp.size);
  const size = (SIZES as readonly number[]).includes(sizeNum) ? sizeNum : SIZES[0];
  const pageReq = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const t = sr.audit;
  const profile = await getSessionProfile();
  const supabase = await createClient();
  // Row-level security already limits this to the viewer's scope (the admin sees everything).
  const query = (page: number) =>
    supabase
      .from('audit_log')
      .select('id,at,actor_id,action,diff', { count: 'exact' })
      .eq('table_name', 'trainings')
      .order('at', { ascending: false })
      .order('id', { ascending: false })
      .range((page - 1) * size, page * size - 1);
  let res = await query(pageReq);
  const total = res.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pageReq, pages);
  if (page !== pageReq) res = await query(page);
  const rows = (res.data ?? []) as Row[];

  const actorIds = [...new Set([...rows.map((r) => r.actor_id), profile?.id].filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: ps } = await supabase.from('profiles').select('id,display_name').in('id', actorIds);
    for (const p of (ps ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }
  const who = (id: string | null) => (id === null ? t.unknown : names.get(id) ?? t.unknown);

  const href = (p: number, n: number) => `/dnevnik?page=${p}&size=${n}`;

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
      {total > 0 && (
        <nav className="audit__pager" aria-label={t.pager}>
          <span className="audit__pager-range">{t.range(total === 0 ? 0 : (page - 1) * size + 1, (page - 1) * size + rows.length, total)}</span>
          <span className="audit__pager-sizes">
            {t.perPage}
            {SIZES.map((n) => (
              <Link key={n} href={href(1, n)} aria-current={n === size ? 'true' : undefined} className="audit__pager-link">{n}</Link>
            ))}
          </span>
          <span className="audit__pager-nav">
            {page > 1 ? <Link href={href(page - 1, size)} rel="prev" className="audit__pager-link">{t.prev}</Link> : <span className="audit__pager-link" aria-disabled="true">{t.prev}</span>}
            <span>{page} / {pages}</span>
            {page < pages ? <Link href={href(page + 1, size)} rel="next" className="audit__pager-link">{t.next}</Link> : <span className="audit__pager-link" aria-disabled="true">{t.next}</span>}
          </span>
        </nav>
      )}
    </>
  );
  return (
    <Workspace
      label={t.title}
      rows={1}
      strip={<div className="ws__head"><Link className="ws__back" href="/nalog">{sr.account.title}</Link><h1 className="ws__title">{t.title}</h1><p className="ws__meta">{t.intro}</p></div>}
      panels={[{ id: 'audit', title: t.listTitle, col: '1 / 13', row: '1 / 2', flush: true, children: body }]}
    />
  );
}
