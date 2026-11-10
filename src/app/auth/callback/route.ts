import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { announceNewAccount } from '@/lib/email/announce';

// OAuth (Google) lands here with a one-time code. Someone who already picked a role on the register
// page is finished at once; everyone else continues, and the proxy sends a first-timer to onboarding.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  if (!code) return NextResponse.redirect(`${origin}/login`);
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login`);

  const picked = searchParams.get('role');
  if (picked === 'coach' || picked === 'shooter') {
    // The database ignores this for anyone already onboarded, and only returns true once per account.
    const { data: first } = await supabase.rpc('complete_onboarding', { p_name: null, p_role: picked });
    if (first) {
      const { data: auth } = await supabase.auth.getUser();
      const { data: p } = await supabase.from('profiles').select('display_name').eq('id', auth.user?.id ?? '').maybeSingle();
      if (auth.user) await announceNewAccount(origin, auth.user, p?.display_name ?? auth.user.email ?? '', picked);
    }
  }
  return NextResponse.redirect(`${origin}/`);
}
