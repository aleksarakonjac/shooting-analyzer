import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'sa_';

/** A new personal upload token: 32 random bytes, URL-safe. Shown to the user once; only its hash is kept. */
export function newInboxToken(): string {
  return PREFIX + randomBytes(32).toString('base64url');
}

export function hashInboxToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The token from `Authorization: Bearer <token>`, or null when the header is missing or malformed. */
export function bearerToken(header: string | null): string | null {
  const m = header?.match(/^Bearer\s+(sa_[A-Za-z0-9_-]{43})\s*$/);
  return m ? m[1] : null;
}
