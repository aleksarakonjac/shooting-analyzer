export interface SessionProfile {
  id: string;
  role: 'shooter' | 'coach' | 'admin';
  status: 'pending' | 'active' | 'disabled';
  tz: string;
}

export type RouteDecision = { allow: true } | { redirect: string };

const WAITING = '/cekanje-odobrenja';
const AUTH_PAGES = ['/login', '/register'];

const isUnder = (path: string, base: string) => path === base || path.startsWith(base + '/');

/**
 * Optimistic route check (proxy). Real authorization is RLS in the database;
 * this only keeps people on the right page.
 */
export function decideRoute(pathname: string, profile: SessionProfile | null, signedIn: boolean): RouteDecision {
  const onAuthPage = AUTH_PAGES.some((p) => isUnder(pathname, p));
  const onWaiting = isUnder(pathname, WAITING);

  if (!signedIn) return onAuthPage ? { allow: true } : { redirect: '/login' };
  if (!profile || profile.status !== 'active') return onWaiting ? { allow: true } : { redirect: WAITING };
  if (onAuthPage || onWaiting) return { redirect: '/' };
  if (isUnder(pathname, '/admin') && profile.role !== 'admin') return { redirect: '/' };
  return { allow: true };
}
