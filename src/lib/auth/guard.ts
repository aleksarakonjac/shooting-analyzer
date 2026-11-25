import { HOME } from '@/lib/routes';

export interface SessionProfile {
  id: string;
  role: 'shooter' | 'coach' | 'admin';
  status: 'pending' | 'active' | 'disabled';
  tz: string;
  /** False for a first-time Google sign-in that has not yet chosen an account type. Missing counts as done. */
  onboarded?: boolean;
}

export type RouteDecision = { allow: true } | { redirect: string };

const WAITING = '/cekanje-odobrenja';
const ONBOARDING = '/dobrodoslica';
const AUTH_PAGES = ['/login', '/register'];

const isUnder = (path: string, base: string) => path === base || path.startsWith(base + '/');

/**
 * Optimistic route check (proxy). Real authorization is RLS in the database;
 * this only keeps people on the right page.
 */
export function decideRoute(pathname: string, profile: SessionProfile | null, signedIn: boolean): RouteDecision {
  // Scheduled jobs carry no session; the route checks its own secret.
  if (isUnder(pathname, '/api/cron')) return { allow: true };
  // Phone uploads carry a personal token instead of a session; the route checks it.
  if (isUnder(pathname, '/api/inbox')) return { allow: true };
  // The club's upload page carries a secret link instead of a session; the route behind it checks it.
  if (isUnder(pathname, '/ubaci')) return { allow: true };
  // The e-mailed approval link is authorized by its own signature, so the admin needs no sign-in.
  if (isUnder(pathname, '/odobrenje')) return { allow: true };
  // Privacy policy is public: Google's consent screen and signed-out visitors must reach it.
  if (isUnder(pathname, '/privatnost') || isUnder(pathname, '/privacy')) return { allow: true };
  // Public homepage for signed-out visitors (Google's verification review included). Signed-in users go on to HOME below.
  if (pathname === '/' && !signedIn) return { allow: true };
  // OAuth return: arrives without a session until the code is exchanged.
  if (isUnder(pathname, '/auth/callback')) return { allow: true };
  const onAuthPage = AUTH_PAGES.some((p) => isUnder(pathname, p));
  const onWaiting = isUnder(pathname, WAITING);

  if (!signedIn) return onAuthPage ? { allow: true } : { redirect: '/login' };
  if (profile && profile.status === 'pending' && profile.onboarded === false) {
    return isUnder(pathname, ONBOARDING) ? { allow: true } : { redirect: ONBOARDING };
  }
  if (isUnder(pathname, ONBOARDING)) return { redirect: profile?.status === 'active' ? HOME : WAITING };
  if (!profile || profile.status !== 'active') return onWaiting ? { allow: true } : { redirect: WAITING };
  if (onAuthPage || onWaiting || pathname === '/') return { redirect: HOME };
  if (isUnder(pathname, '/admin') && profile.role !== 'admin') return { redirect: HOME };
  return { allow: true };
}
