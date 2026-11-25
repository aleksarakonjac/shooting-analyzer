import { describe, expect, it } from 'vitest';
import { decideRoute, type SessionProfile } from '../../src/lib/auth/guard';

const p = (role: SessionProfile['role'], status: SessionProfile['status']): SessionProfile => ({
  id: 'u', role, status, tz: 'Europe/Belgrade',
});

describe('decideRoute', () => {
  it('lets anonymous users reach login and register only', () => {
    expect(decideRoute('/login', null, false)).toEqual({ allow: true });
    expect(decideRoute('/register', null, false)).toEqual({ allow: true });
    expect(decideRoute('/', null, false)).toEqual({ allow: true }); // public homepage
    expect(decideRoute('/', p('shooter', 'active'), true)).toEqual({ redirect: '/sesije' }); // default page when signed in
    expect(decideRoute('/sesije', null, false)).toEqual({ redirect: '/login' });
    expect(decideRoute('/trening/novi', null, false)).toEqual({ redirect: '/login' });
    expect(decideRoute('/admin/approvals', null, false)).toEqual({ redirect: '/login' });
  });

  it('keeps the privacy policy public', () => {
    expect(decideRoute('/privatnost', null, false)).toEqual({ allow: true });
    expect(decideRoute('/privatnost', p('shooter', 'active'), true)).toEqual({ allow: true });
    expect(decideRoute('/privacy', null, false)).toEqual({ allow: true });
  });

  it('sends a signed-in user without a profile row to the waiting page', () => {
    expect(decideRoute('/sesije', null, true)).toEqual({ redirect: '/cekanje-odobrenja' });
  });

  it.each(['pending', 'disabled'] as const)('keeps %s users on the waiting page', (status) => {
    expect(decideRoute('/sesije', p('shooter', status), true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/trainings/1', p('coach', status), true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/admin/approvals', p('admin', status), true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/cekanje-odobrenja', p('shooter', status), true)).toEqual({ allow: true });
  });

  it('lets active users in and bounces them off auth pages', () => {
    expect(decideRoute('/sesije', p('shooter', 'active'), true)).toEqual({ allow: true });
    expect(decideRoute('/login', p('shooter', 'active'), true)).toEqual({ redirect: '/sesije' });
    expect(decideRoute('/cekanje-odobrenja', p('coach', 'active'), true)).toEqual({ redirect: '/sesije' });
  });

  it('allows /admin only for active admins', () => {
    expect(decideRoute('/admin/approvals', p('admin', 'active'), true)).toEqual({ allow: true });
    expect(decideRoute('/admin/approvals', p('shooter', 'active'), true)).toEqual({ redirect: '/sesije' });
    expect(decideRoute('/admin', p('coach', 'active'), true)).toEqual({ redirect: '/sesije' });
    expect(decideRoute('/administrator', p('shooter', 'active'), true)).toEqual({ allow: true });
  });
});

describe('onboarding', () => {
  const fresh = { ...p('shooter', 'pending'), onboarded: false };
  it('sends a not-yet-onboarded pending user to onboarding and keeps them there', () => {
    expect(decideRoute('/sesije', fresh, true)).toEqual({ redirect: '/dobrodoslica' });
    expect(decideRoute('/cekanje-odobrenja', fresh, true)).toEqual({ redirect: '/dobrodoslica' });
    expect(decideRoute('/dobrodoslica', fresh, true)).toEqual({ allow: true });
  });
  it('moves anyone else off the onboarding page', () => {
    expect(decideRoute('/dobrodoslica', { ...p('shooter', 'pending'), onboarded: true }, true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/dobrodoslica', p('coach', 'active'), true)).toEqual({ redirect: '/sesije' });
    expect(decideRoute('/dobrodoslica', null, false)).toEqual({ redirect: '/login' });
  });
});

describe('phone inbox route', () => {
  it('passes /api/inbox without a session (the route checks its token)', () => {
    expect(decideRoute('/api/inbox', null, false)).toEqual({ allow: true });
  });
});

describe('club upload page', () => {
  it('opens for anyone: signed out, waiting for approval, signed in', () => {
    expect(decideRoute('/ubaci', null, false)).toEqual({ allow: true });
    expect(decideRoute('/ubaci', p('shooter', 'pending'), true)).toEqual({ allow: true });
    expect(decideRoute('/ubaci', p('coach', 'active'), true)).toEqual({ allow: true });
  });
  it('opens nothing else that only starts the same', () => {
    expect(decideRoute('/ubacivanje', null, false)).toEqual({ redirect: '/login' });
  });
});
