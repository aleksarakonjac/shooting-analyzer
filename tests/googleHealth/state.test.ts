import { describe, expect, it } from 'vitest';
import { signState, verifyState } from '../../src/lib/googleHealth/state';

const secret = 'test-state-secret';
const payload = { userId: 'u1', nonce: 'n1', exp: 1_000 };

describe('OAuth state', () => {
  it('verifies a valid state', () => {
    expect(verifyState(signState(payload, secret), secret, { userId: 'u1', nonce: 'n1', now: 999 })).toBe(true);
  });

  it('rejects an expired state', () => {
    expect(verifyState(signState(payload, secret), secret, { userId: 'u1', nonce: 'n1', now: 1_001 })).toBe(false);
  });

  it('rejects another user', () => {
    expect(verifyState(signState(payload, secret), secret, { userId: 'u2', nonce: 'n1', now: 0 })).toBe(false);
  });

  it('rejects another nonce', () => {
    expect(verifyState(signState(payload, secret), secret, { userId: 'u1', nonce: 'n2', now: 0 })).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const [, sig] = signState(payload, secret).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, exp: 9_999 })).toString('base64url');
    expect(verifyState(`${forged}.${sig}`, secret, { userId: 'u1', nonce: 'n1', now: 2_000 })).toBe(false);
  });

  it('rejects garbage', () => {
    expect(verifyState('not-a-state', secret, { userId: 'u1', nonce: 'n1', now: 0 })).toBe(false);
  });
});
