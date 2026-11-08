import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { createClient } from '@/lib/supabase/server';
import { setProfile } from '@/lib/auth/actions';

export default function ApprovalsPage() {
  return (
    <main style={{ padding: 'var(--gutter)' }}>
      <h1>{sr.admin.approvalsTitle}</h1>
      <Suspense fallback={null}>
        <PendingList />
      </Suspense>
    </main>
  );
}

async function PendingList() {
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from('profiles')
    .select('id, display_name, created_at')
    .eq('status', 'pending')
    .order('created_at');
  return (
    <>
      {!pending?.length && <p>{sr.admin.empty}</p>}
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
        {pending?.map((p) => (
          <li key={p.id}>
            <strong>{p.display_name}</strong>{' '}
            <span className="num">{sr.admin.registered} {new Date(p.created_at).toLocaleDateString('sr-Latn-RS')}</span>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <Decision id={p.id} role="shooter" status="active" label={sr.admin.approveShooter} />
              <Decision id={p.id} role="coach" status="active" label={sr.admin.approveCoach} />
              <Decision id={p.id} role="shooter" status="disabled" label={sr.admin.reject} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Decision({ id, role, status, label }: { id: string; role: string; status: string; label: string }) {
  return (
    <form action={setProfile}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="status" value={status} />
      <button type="submit">{label}</button>
    </form>
  );
}
