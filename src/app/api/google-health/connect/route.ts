import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionProfile } from '@/lib/auth/session';
import { authUrl } from '@/lib/googleHealth/client';
import { googleHealthEnv, healthCallbackUrl } from '@/lib/googleHealth/server';
import { signState } from '@/lib/googleHealth/state';

const NONCE_COOKIE = 'gh_nonce';
const TEN_MINUTES = 10 * 60_000;

/** Starts connecting Google Health: a signed state bound to this user and a nonce cookie, then Google's consent. */
export async function GET(request: NextRequest) {
  const base = request.nextUrl.origin;
  const env = googleHealthEnv();
  const profile = await getSessionProfile();
  if (!profile || profile.status !== 'active') return NextResponse.redirect(`${base}/login`);
  if (!env) return NextResponse.redirect(`${base}/nalog?gh=error`);

  const nonce = randomUUID();
  const state = signState({ userId: profile.id, nonce, exp: Date.now() + TEN_MINUTES }, env.stateSecret);
  const res = NextResponse.redirect(authUrl({ clientId: env.clientId, redirectUri: healthCallbackUrl(base), state }));
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/google-health',
    maxAge: TEN_MINUTES / 1000,
  });
  return res;
}
