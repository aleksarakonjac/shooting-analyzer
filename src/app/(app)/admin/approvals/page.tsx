import { Suspense } from 'react';
import { Workspace } from '@/components/Workspace';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { setProfile } from '@/lib/auth/actions';

export default function ApprovalsPage() {
  return (
    <Suspense fallback={null}>
      <PendingList />
    </Suspense>
  );
}

async function PendingList() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('status', 'pending')
    .order('created_at');
  const body = !pending?.length ? (
    <p className="panel__empty dash__empty">{sr.admin.empty}</p>
  ) : (
    <ul className="rows">
      {pending.map((p) => (
        <li key={p.id} className="rows__item">
          <div className="rows__main">
            <strong>{p.display_name}</strong>
            <div className="rows__muted num">{sr.admin.registered} {new Date(p.created_at).toLocaleDateString('sr-Latn-RS')}</div>
          </div>
          <div className="rows__actions">
            <Decision id={p.id} role="shooter" status="active" label={sr.admin.approveShooter} />
            <Decision id={p.id} role="coach" status="active" label={sr.admin.approveCoach} />
            <Decision id={p.id} role="shooter" status="disabled" label={sr.admin.reject} danger />
          </div>
        </li>
      ))}
    </ul>
  );
  return (
    <Workspace
      label={sr.admin.approvalsTitle}
      rows={1}
      strip={<div className="ws__head"><h1 className="ws__title">{sr.admin.approvalsTitle}</h1></div>}
      panels={[{ id: 'pending', title: sr.admin.pendingTitle, range: pending?.length ? String(pending.length) : undefined, col: '1 / 13', row: '1 / 2', flush: true, children: body }]}
    />
  );
}

function Decision({ id, role, status, label, danger }: { id: string; role: string; status: string; label: string; danger?: boolean }) {
  return (
    <form action={setProfile}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={danger ? 'button--danger' : undefined}>{label}</button>
    </form>
  );
}
