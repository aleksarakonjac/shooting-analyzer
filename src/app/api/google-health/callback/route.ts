import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, getIdentity } from '@/lib/googleHealth/client';
import { completeConnect } from '@/lib/googleHealth/connect';
import { encryptToken } from '@/lib/googleHealth/crypto';
import { googleHealthEnv, healthCallbackUrl } from '@/lib/googleHealth/server';

const NONCE_COOKIE = 'gh_nonce';

/** Google sends the user back here with a one-time code; the connection is stored and the user returns to /nalog. */
export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin;
  const env = googleHealthEnv();
  const admin = createAdminClient();
  const q = request.nextUrl.searchParams;
  let outcome = 'error';
  if (env && admin) {
    const profile = await getSessionProfile();
    outcome = await completeConnect(
      { code: q.get('code'), state: q.get('state'), error: q.get('error') },
      {
        userId: profile && profile.status === 'active' ? profile.id : null,
        nonce: request.cookies.get(NONCE_COOKIE)?.value ?? null,
        now: Date.now(),
        stateSecret: env.stateSecret,
        exchange: (code) => exchangeCode({ clientId: env.clientId, clientSecret: env.clientSecret, redirectUri: healthCallbackUrl(base), code }),
        identity: (accessToken) => getIdentity(accessToken),
        encrypt: (plain) => encryptToken(plain, env.tokenKey),
        async save(row) {
          const { error } = await admin.from('google_health_links').upsert({
            user_id: row.userId,
            refresh_token_enc: row.refreshTokenEnc,
            health_user_id: row.healthUserId,
            scopes: row.scopes,
            connected_at: new Date().toISOString(),
            broken_at: null,
          });
          if (error) throw new Error(error.message);
        },
      },
    );
  }
  const res = NextResponse.redirect(`${base}/nalog?gh=${outcome}`);
  res.cookies.set(NONCE_COOKIE, '', { path: '/api/google-health', maxAge: 0 });
  return res;
}
