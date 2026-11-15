import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyBytes(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('GOOGLE_HEALTH_TOKEN_KEY must be 32 bytes (base64)');
  return key;
}

/** AES-256-GCM; the result is `iv:tag:ciphertext`, each part base64. */
export function encryptToken(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(keyB64), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join(':');
}

/** Opens what `encryptToken` sealed; throws on a wrong key or any change to the text. */
export function decryptToken(sealed: string, keyB64: string): string {
  const [iv, tag, data] = sealed.split(':').map((p) => Buffer.from(p, 'base64'));
  if (!iv || !tag || !data) throw new Error('malformed token');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(keyB64), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
