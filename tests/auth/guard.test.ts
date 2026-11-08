import { describe, expect, it } from 'vitest';
import { decideRoute, type SessionProfile } from '../../src/lib/auth/guard';

const p = (role: SessionProfile['role'], status: SessionProfile['status']): SessionProfile => ({
  id: 'u', role, status, tz: 'Europe/Belgrade',
});

describe('decideRoute', () => {
  it('lets anonymous users reach login and register only', () => {
    expect(decideRoute('/login', null, false)).toEqual({ allow: true });
    expect(decideRoute('/register', null, false)).toEqual({ allow: true });
    expect(decideRoute('/', null, false)).toEqual({ redirect: '/login' });
    expect(decideRoute('/admin/approvals', null, false)).toEqual({ redirect: '/login' });
  });

  it('sends a signed-in user without a profile row to the waiting page', () => {
    expect(decideRoute('/', null, true)).toEqual({ redirect: '/cekanje-odobrenja' });
  });

  it.each(['pending', 'disabled'] as const)('keeps %s users on the waiting page', (status) => {
    expect(decideRoute('/', p('shooter', status), true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/trainings/1', p('coach', status), true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/admin/approvals', p('admin', status), true)).toEqual({ redirect: '/cekanje-odobrenja' });
    expect(decideRoute('/cekanje-odobrenja', p('shooter', status), true)).toEqual({ allow: true });
  });

  it('lets active users in and bounces them off auth pages', () => {
    expect(decideRoute('/', p('shooter', 'active'), true)).toEqual({ allow: true });
    expect(decideRoute('/login', p('shooter', 'active'), true)).toEqual({ redirect: '/' });
    expect(decideRoute('/cekanje-odobrenja', p('coach', 'active'), true)).toEqual({ redirect: '/' });
  });

  it('allows /admin only for active admins', () => {
    expect(decideRoute('/admin/approvals', p('admin', 'active'), true)).toEqual({ allow: true });
    expect(decideRoute('/admin/approvals', p('shooter', 'active'), true)).toEqual({ redirect: '/' });
    expect(decideRoute('/admin', p('coach', 'active'), true)).toEqual({ redirect: '/' });
    expect(decideRoute('/administrator', p('shooter', 'active'), true)).toEqual({ allow: true });
  });
});
