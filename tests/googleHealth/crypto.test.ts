import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from '../../src/lib/googleHealth/crypto';

const key = randomBytes(32).toString('base64');

describe('token encryption', () => {
  it('round trips', () => {
    expect(decryptToken(encryptToken('1//refresh-token', key), key)).toBe('1//refresh-token');
  });

  it('gives a different ciphertext each time', () => {
    expect(encryptToken('same', key)).not.toBe(encryptToken('same', key));
  });

  it('rejects a tampered ciphertext', () => {
    const [iv, tag, data] = encryptToken('secret', key).split(':');
    const bytes = Buffer.from(data, 'base64');
    bytes[0] ^= 1;
    expect(() => decryptToken(`${iv}:${tag}:${bytes.toString('base64')}`, key)).toThrow();
  });

  it('rejects the wrong key', () => {
    expect(() => decryptToken(encryptToken('secret', key), randomBytes(32).toString('base64'))).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => encryptToken('secret', randomBytes(16).toString('base64'))).toThrow();
  });
});
