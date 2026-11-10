import { Suspense } from 'react';
import { sr } from '@/lib/i18n/sr';
import { verifyApproval } from '@/lib/auth/approvalToken';
import { decideByLink } from '@/lib/auth/actions';
import { createAdminClient } from '@/lib/supabase/admin';

export default function ApprovalLinkPage({ searchParams }: { searchParams: Promise<{ id?: string; sig?: string }> }) {
  return (
    <main className="auth">
      <div className="auth__brand" aria-hidden="true">{sr.appName}</div>
      <section className="auth__card" aria-labelledby="link-title">
        <h1 id="link-title" className="auth__title">{sr.admin.linkTitle}</h1>
        <Suspense fallback={null}>
          <Body searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: Promise<{ id?: string; sig?: string }> }) {
  const { id = '', sig = '' } = await searchParams;
  const admin = createAdminClient();
  if (!admin || !verifyApproval(id, sig, process.env.SUPABASE_SERVICE_ROLE_KEY)) return <p role="alert">{sr.admin.linkInvalid}</p>;
  const { data: p } = await admin.from('profiles').select('display_name, status, role, requested_role').eq('id', id).maybeSingle();
  if (!p) return <p role="alert">{sr.admin.linkInvalid}</p>;
  if (p.status === 'active') return <p>{sr.admin.linkApproved} ({p.role === 'coach' ? sr.auth.roleCoach : sr.auth.roleShooter})</p>;
  if (p.status === 'disabled') return <p>{sr.admin.linkRejected}</p>;
  const { data: u } = await admin.auth.admin.getUserById(id);
  return (
    <form action={decideByLink} className="stack">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="sig" value={sig} />
      <p>
        <strong>{p.display_name}</strong>
        <br />
        {u.user?.email}
        <br />
        {p.requested_role === 'coach' ? sr.admin.requestedCoach : sr.admin.requestedShooter}
      </p>
      <button type="submit" name="decision" value="approve">{sr.admin.approve}</button>
      <button type="submit" name="decision" value="reject" className="button--danger">{sr.admin.reject}</button>
    </form>
  );
}
