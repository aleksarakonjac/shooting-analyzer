import { describe, expect, it } from 'vitest';
import { signApproval, verifyApproval } from '@/lib/auth/approvalToken';
import { decideRoute } from '@/lib/auth/guard';

describe('approval link signature', () => {
  const id = '3f2c1a9e-0000-4000-8000-000000000001';
  it('verifies its own signature', () => {
    expect(verifyApproval(id, signApproval(id, 'k'), 'k')).toBe(true);
  });
  it('rejects another id, key, empty or malformed signature', () => {
    const sig = signApproval(id, 'k');
    expect(verifyApproval('other', sig, 'k')).toBe(false);
    expect(verifyApproval(id, sig, 'k2')).toBe(false);
    expect(verifyApproval(id, '', 'k')).toBe(false);
    expect(verifyApproval(id, sig.slice(1), 'k')).toBe(false);
    expect(verifyApproval(id, sig, undefined)).toBe(false);
  });
  it('is reachable without a session', () => {
    expect(decideRoute('/odobrenje', null, false)).toEqual({ allow: true });
  });
});

describe('oauth callback route', () => {
  it('is reachable without a session', () => {
    expect(decideRoute('/auth/callback', null, false)).toEqual({ allow: true });
  });
});
