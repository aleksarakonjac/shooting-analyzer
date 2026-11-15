import { afterEach, describe, expect, it, vi } from 'vitest';
import { open, seal, siusKey } from '@/lib/crypto/secretBox';

const key = Buffer.alloc(32, 7).toString('base64');

describe('secretBox', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('round trips', () => expect(open(seal('pw', key), key)).toBe('pw'));

  it('uses v1 prefix and a fresh IV', () => {
    const a = seal('pw', key);
    const b = seal('pw', key);
    expect(a.startsWith('v1:')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('rejects tampering', () => {
    const s = seal('pw', key);
    expect(() => open(s.slice(0, -2) + 'AA', key)).toThrow();
  });

  it('rejects wrong key', () => {
    expect(() => open(seal('pw', key), Buffer.alloc(32, 8).toString('base64'))).toThrow();
  });

  it('rejects text without the v1 prefix', () => {
    expect(() => open(seal('pw', key).slice(3), key)).toThrow();
  });

  it('siusKey is null for a 16-byte key', () => {
    vi.stubEnv('SIUS_CRED_KEY', Buffer.alloc(16).toString('base64'));
    expect(siusKey()).toBeNull();
  });

  it('siusKey is null when unset and returns a valid key', () => {
    vi.stubEnv('SIUS_CRED_KEY', '');
    expect(siusKey()).toBeNull();
    vi.stubEnv('SIUS_CRED_KEY', key);
    expect(siusKey()).toBe(key);
  });
});
