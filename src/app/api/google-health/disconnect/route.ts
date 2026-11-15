import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { revokeToken } from '@/lib/googleHealth/client';
import { decryptToken } from '@/lib/googleHealth/crypto';
import { googleHealthEnv } from '@/lib/googleHealth/server';

/** Removes the signed-in user's Google Health connection: revoked at Google (best effort), deleted here. */
export async function POST(request: NextRequest) {
  const base = request.nextUrl.origin;
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.redirect(`${base}/login`, 303);
  const env = googleHealthEnv();
  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(`${base}/nalog?gh=error`, 303);

  const links = admin.from('google_health_links');
  const { data } = await links.select('refresh_token_enc').eq('user_id', profile.id).maybeSingle();
  if (data && env) {
    try {
      await revokeToken(decryptToken(data.refresh_token_enc as string, env.tokenKey));
    } catch {
      // A token we cannot open cannot be revoked; the row is removed below either way.
    }
  }
  await links.delete().eq('user_id', profile.id);
  return NextResponse.redirect(`${base}/nalog?gh=off`, 303);
}
