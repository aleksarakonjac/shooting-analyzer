import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1:';

function keyBytes(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('secret box key must be 32 bytes (base64)');
  return key;
}

/** AES-256-GCM; the result is `v1:iv:tag:ciphertext`, each part base64. The version prefix allows a later key or cipher change. */
export function seal(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(keyB64), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

/** Opens what `seal` produced; throws on a wrong key, an unknown version or any change to the text. */
export function open(sealed: string, keyB64: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error('unknown sealed format');
  const [iv, tag, data] = sealed.slice(PREFIX.length).split(':').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !data) throw new Error('malformed sealed text');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(keyB64), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** The SIUS credential key from `SIUS_CRED_KEY`, or null when it is unset or not 32 bytes (the feature then reports `not_configured`). */
export function siusKey(): string | null {
  const k = process.env.SIUS_CRED_KEY;
  if (!k) return null;
  return Buffer.from(k, 'base64').length === 32 ? k : null;
}
