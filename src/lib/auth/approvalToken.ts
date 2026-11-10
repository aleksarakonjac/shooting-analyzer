import { createHmac, timingSafeEqual } from 'node:crypto';

const tag = (id: string, key: string) => createHmac('sha256', key).update(`approve:${id}`).digest('hex');

/** Signature that goes in the admin's e-mail link. Only the server holding `key` can produce it. */
export function signApproval(id: string, key: string): string {
  return tag(id, key);
}

/** Constant-time check. A missing key or signature never verifies. */
export function verifyApproval(id: string, sig: string, key: string | undefined): boolean {
  if (!key || !sig) return false;
  const a = Buffer.from(tag(id, key));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
